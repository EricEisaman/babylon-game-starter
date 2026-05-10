// ============================================================================
// DATASTAR CLIENT SDK WRAPPER - SSE (Server-Sent Events)
// ============================================================================

/**
 * Lightweight Datastar client wrapper for browser-based multiplayer sync.
 *
 * This module provides:
 * - SSE (Server-Sent Events) connection management via EventSource
 * - Signal subscription/unsubscription
 * - PATCH request handling
 * - Automatic reconnection with exponential backoff
 * - Configurable server endpoints (production or local)
 *
 * The Datastar way: server-sent `datastar-patch-signals` events (JSON from the Go SDK
 * `MarshalAndPatchSignals` patch-signals wire format). This client uses `EventSource` and dispatches by signal name.
 *
 * NOTE FOR PLAYGROUND CONTRIBUTORS:
 * This module is bundled into `playground.json` and executed inside the Babylon
 * playground's blob-URL ESM loader. Use STATIC imports only — dynamic relative
 * imports are rewritten into unquoted bare tokens that V8 rejects with
 * `SyntaxError: Unexpected token ','`. See `PLAYGROUND.md`
 * ("Static imports only, no dynamic relative `import()`") for the full
 * rationale. The `scripts/check-playground-export.mjs` smoke test fails the
 * build if a dynamic relative import slips back in.
 */

import { CONFIG } from '../config/game_config';

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

// Recursive JSON object types need an index signature; `Record` aliases are rejected by TS 5.3 here.
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type DatastarSignalListener<T = JsonValue> = (data: T) => void;

export interface DatastarEventMap {
  connected: undefined;
  disconnected: undefined;
  error: Error;
}

/** Union of payloads for `connected` | `disconnected` | `error` lifecycle events */
type DatastarLifecyclePayload = DatastarEventMap[keyof DatastarEventMap];
type DatastarLifecycleListener = (payload: DatastarLifecyclePayload) => void;

export class DatastarClient {
  private eventSource: EventSource | null = null;
  private sseUrl: string;
  private signalListeners = new Map<string, Set<DatastarSignalListener>>();
  private eventListeners = new Map<keyof DatastarEventMap, Set<DatastarLifecycleListener>>();
  private messageIndex = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 1000;
  private isIntentionallyClosed = false;
  private sessionID = '';

  constructor(sseUrl: string) {
    this.sseUrl = sseUrl;
  }

  /**
   * Updates the SSE URL (for lazy endpoint detection)
   */
  public setUrl(sseUrl: string): void {
    this.sseUrl = sseUrl;
  }

  /**
   * Sets the session ID for SSE authentication
   */
  public setSessionID(sessionID: string): void {
    this.sessionID = sessionID;
  }

  /**
   * Connects to the Datastar server via SSE with timeout
   */
  public async connect(timeoutMs?: number): Promise<void> {
    const effectiveMs = timeoutMs ?? CONFIG.MULTIPLAYER.CONNECTION_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        action();
      };

      try {
        // Build SSE URL with session and client ID headers
        const url = new URL(this.sseUrl, window.location.origin);
        if (this.sessionID) {
          url.searchParams.set('sid', this.sessionID);
        }

        // Create EventSource for SSE connection
        this.eventSource = new EventSource(url.toString());

        // Set connection timeout (CONNECTING without onopen — e.g. proxy stalled)
        connectionTimeout = setTimeout(() => {
          if (this.eventSource && this.eventSource.readyState === EventSource.CONNECTING) {
            this.eventSource.close();
            finish(() => {
              reject(new Error(`Connection timeout after ${effectiveMs}ms`));
            });
          }
        }, effectiveMs);

        this.eventSource.onopen = () => {
          finish(() => {
            this.reconnectAttempts = 0;
            this.reconnectDelayMs = 1000;
            this.emit('connected');
            resolve();
          });
        };

        // Official datastar-go wire format: event type datastar-patch-signals (see EventTypePatchSignals).
        this.eventSource.addEventListener(
          'datastar-patch-signals',
          (event: MessageEvent<string>) => {
            this.handlePatchSignalsEvent(event.data);
          }
        );

        // Legacy/default SSE messages (optional fallback)
        this.eventSource.addEventListener('message', (event) => {
          this.handleMessage(event.data);
        });

        this.eventSource.onerror = () => {
          // While CONNECTING, some browsers fire transient errors; only act on a closed stream.
          if (this.eventSource?.readyState !== EventSource.CLOSED) {
            return;
          }
          const error = new Error('SSE connection closed');
          this.emit('error', error);
          if (!this.isIntentionallyClosed) {
            this.attemptReconnect();
          }
          // Reject is a no-op if onopen already called finish (settled).
          finish(() => {
            reject(error);
          });
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        finish(() => {
          reject(err);
        });
      }
    });
  }

  /**
   * Disconnects from the server
   */
  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Subscribes to a server signal
   */
  public onSignal<T = JsonValue>(
    signalName: string,
    listener: DatastarSignalListener<T>
  ): () => void {
    if (!this.signalListeners.has(signalName)) {
      this.signalListeners.set(signalName, new Set());
    }
    this.signalListeners.get(signalName)!.add(listener as DatastarSignalListener);

    // Return unsubscribe function
    return () => {
      const listeners = this.signalListeners.get(signalName);
      if (listeners) {
        listeners.delete(listener as DatastarSignalListener);
      }
    };
  }

  /**
   * Sends a PATCH request to the server
   */
  public async patch(
    path: string,
    data: object,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    const headers = {
      'Content-Type': 'application/json',
      ...options?.headers
    };

    const response = await fetch(path, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`PATCH ${path} failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  /**
   * Subscribes to connection events
   */
  public addEventListener<K extends keyof DatastarEventMap>(
    event: K,
    listener: (data: DatastarEventMap[K]) => void
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const stored = listener as DatastarLifecycleListener;
    this.eventListeners.get(event)!.add(stored);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(stored);
      }
    };
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  private handleMessage(rawData: string): void {
    try {
      const data: {
        readonly type?: string;
        readonly name?: string;
        readonly payload?: JsonValue;
        readonly data?: JsonValue;
      } = JSON.parse(rawData);

      // Datastar SIGNAL message format
      if (data.type === 'signal' && data.name) {
        const listeners = this.signalListeners.get(data.name);
        if (listeners) {
          for (const listener of listeners) {
            listener(data.payload ?? data.data ?? null);
          }
        }
      }

      this.messageIndex++;
    } catch (error) {
      console.warn('Failed to parse SSE message:', error);
    }
  }

  /**
   * Parses SSE payload from datastar-go PatchSignals / MarshalAndPatchSignals:
   * one or more lines `signals <json fragment>` (fragments join on newlines to recreate JSON).
   */
  private handlePatchSignalsEvent(rawData: string): void {
    try {
      const lines = rawData.split('\n');
      const fragments: string[] = [];
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (trimmed.startsWith('signals ')) {
          fragments.push(trimmed.slice('signals '.length));
        }
      }
      if (fragments.length === 0) {
        return;
      }
      const merged = fragments.join('\n');
      const patch: { readonly mp?: { readonly name?: string; readonly payload?: JsonValue } } =
        JSON.parse(merged);
      const name = patch.mp?.name;
      if (!name) {
        return;
      }
      const listeners = this.signalListeners.get(name);
      if (listeners) {
        for (const listener of listeners) {
          listener(patch.mp?.payload ?? null);
        }
      }
      this.messageIndex++;
    } catch (error) {
      console.warn('Failed to parse datastar-patch-signals message:', error);
    }
  }

  private emit<K extends keyof DatastarEventMap>(event: K, data?: DatastarEventMap[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`
    );

    setTimeout(() => {
      this.connect().catch(() => {
        // Retry will be handled by next attemptReconnect
      });
    }, delay);
  }
}

/**
 * Global Datastar client instance
 */
let globalDatastarClient: DatastarClient | null = null;

/** Single flight: health probe + chosen stream URL (absolute). */
let resolvedStreamUrlPromise: Promise<string> | null = null;

function ensureMultiplayerStreamUrlResolved(): Promise<string> {
  resolvedStreamUrlPromise ??= determineMultiplayerUrl();
  return resolvedStreamUrlPromise;
}

/**
 * Origin of the Go multiplayer service (`https://host[:port]`), after the same discovery
 * as the SSE client. Use for `join` / `leave` / `PATCH` when the game SPA is not same-origin
 * with the API (e.g. fork deploys static site + separate Render service).
 */
export async function getMultiplayerHttpOrigin(): Promise<string> {
  const streamUrl = await ensureMultiplayerStreamUrlResolved();
  return new URL(streamUrl).origin;
}

function normalizeMultiplayerHostInput(raw: string): string {
  let s = raw.trim();
  if (!s) {
    return '';
  }
  if (s.startsWith('https://')) {
    s = s.slice('https://'.length);
  } else if (s.startsWith('http://')) {
    s = s.slice('http://'.length);
  }
  s = s.split('/')[0] ?? '';
  return s.trim();
}

function readViteEnv(): ImportMetaEnv | undefined {
  try {
    return import.meta.env;
  } catch {
    return undefined;
  }
}

/**
 * Read an optional host override from the URL, as `?mp=host[:port]` or
 * `#mp=host[:port]`. This is the preferred knob for students running the
 * exported snippet in https://playground.babylonjs.com/ and for instructors
 * directing a class at a private server without rebuilding the bundle.
 *
 * Returns the normalized host (no scheme, no path), or an empty string when
 * the override is absent, malformed, or we are not in a browser.
 */
function readOverrideHost(): string {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return '';
  }
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('mp');
    if (fromQuery && fromQuery.trim().length > 0) {
      return normalizeMultiplayerHostInput(fromQuery);
    }
    // Babylon playground rewrites the query string frequently; also accept
    // the override in the fragment (#mp=host) so a pasted URL survives
    // playground navigation.
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (hash) {
      const params = new URLSearchParams(hash);
      const fromHash = params.get('mp');
      if (fromHash && fromHash.trim().length > 0) {
        return normalizeMultiplayerHostInput(fromHash);
      }
    }
  } catch {
    // Ignore malformed URLs; callers fall through to env / config defaults.
  }
  return '';
}

/**
 * Decide the SSE endpoint to use. Checked in priority order:
 *
 *   1. `?mp=host` (or `#mp=host`) URL override — highest priority so
 *      instructors can steer a class without rebuilding.
 *   2. `VITE_MULTIPLAYER_HOST` build-time env — only ever set under Vite.
 *   3. Vite dev same-origin via the dev-server proxy.
 *   4. `CONFIG.MULTIPLAYER.PRODUCTION_SERVER` / `LOCAL_SERVER` probe in the
 *      order dictated by `PRODUCTION_FIRST`.
 *
 * Every `import.meta.env.*` read goes through `readViteEnv()` so this module
 * remains safe to run inside the Babylon playground where `import.meta.env`
 * is not injected.
 */
async function determineMultiplayerUrl(): Promise<string> {
  if (!CONFIG.MULTIPLAYER.ENABLED) {
    throw new Error('Multiplayer is disabled in configuration');
  }

  const timeoutMs = CONFIG.MULTIPLAYER.CONNECTION_TIMEOUT_MS;
  const viteEnv = readViteEnv();

  const overrideHost = readOverrideHost();
  if (overrideHost) {
    console.log(`[Datastar] Using ?mp= override host "${overrideHost}"`);
    const only = await attemptServerConnection(overrideHost, timeoutMs);
    if (only) {
      return only;
    }
    throw new Error(
      `Multiplayer override "?mp=${overrideHost}" failed its health check. Fix the host or remove the override to use the default server.`
    );
  }

  const envRaw = viteEnv?.VITE_MULTIPLAYER_HOST;
  const envHost =
    typeof envRaw === 'string' && envRaw.trim().length > 0
      ? normalizeMultiplayerHostInput(envRaw)
      : '';

  if (envHost) {
    const only = await attemptServerConnection(envHost, timeoutMs);
    if (only) {
      return only;
    }
    throw new Error(
      `VITE_MULTIPLAYER_HOST is set to "${envHost}" but health check failed. Fix the host or unset the variable to use CONFIG.MULTIPLAYER defaults.`
    );
  }

  // `npm run dev`: same-origin requests hit the Vite proxy → Go on :5000 (no remote probe, no CORS).
  if (viteEnv?.DEV === true && typeof window !== 'undefined') {
    return `${window.location.origin}/api/multiplayer/stream`;
  }

  const productionServer = CONFIG.MULTIPLAYER.PRODUCTION_SERVER;
  const localServer = CONFIG.MULTIPLAYER.LOCAL_SERVER;
  const tryProductionFirst = CONFIG.MULTIPLAYER.PRODUCTION_FIRST;

  const primaryServer = tryProductionFirst ? productionServer : localServer;
  const fallbackServer = tryProductionFirst ? localServer : productionServer;

  const primaryUrl = await attemptServerConnection(primaryServer, timeoutMs);
  if (primaryUrl) {
    return primaryUrl;
  }

  const fallbackUrl = await attemptServerConnection(fallbackServer, timeoutMs);
  if (fallbackUrl) {
    return fallbackUrl;
  }

  throw new Error(
    `Failed to connect to multiplayer servers: ${primaryServer} and ${fallbackServer}`
  );
}

/**
 * Emitted on `window` when a health probe is taking longer than ~5 s, which on
 * a free-tier Render deployment usually means the service is cold-starting.
 * The event is purely advisory; listeners can show a "warming up server…"
 * hint while the probe continues up to `CONNECTION_TIMEOUT_MS`.
 */
const WARMING_UP_EVENT = 'multiplayer-warming-up';
const WARMING_UP_THRESHOLD_MS = 5000;

/**
 * Attempts to connect to a server and returns the SSE URL if successful.
 * Fires `multiplayer-warming-up` on `window` if the probe exceeds
 * `WARMING_UP_THRESHOLD_MS`, so the UI can explain a long first connect.
 */
async function attemptServerConnection(server: string, timeoutMs: number): Promise<string | null> {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  const warmingUpTimer = setTimeout(() => {
    try {
      window.dispatchEvent(
        new CustomEvent(WARMING_UP_EVENT, {
          detail: { server, timeoutMs, elapsedMs: WARMING_UP_THRESHOLD_MS }
        })
      );
    } catch {
      // CustomEvent / dispatchEvent unavailable (non-browser shim); skip silently.
    }
    console.log(
      `[Datastar] Server at ${server} is slow to respond; this is normal for a cold Render free-tier instance (may take up to ${Math.round(timeoutMs / 1000)}s).`
    );
  }, WARMING_UP_THRESHOLD_MS);

  try {
    console.log(`[Datastar] Checking server at ${server}...`);

    // Health check with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const response = await fetch(`${protocol}//${server}/api/multiplayer/health`, {
      signal: controller.signal,
      mode: 'cors'
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const sseUrl = `${protocol}//${server}/api/multiplayer/stream`;
      console.log(`[Datastar] ✓ Server available at ${server}`);
      return sseUrl;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`[Datastar] Server at ${server} unavailable (${errorMsg})`);
  } finally {
    clearTimeout(warmingUpTimer);
  }

  return null;
}

/**
 * Gets or creates the global Datastar client
 * Automatically detects and selects appropriate multiplayer server
 */
export function getDatastarClient(): DatastarClient {
  if (!globalDatastarClient) {
    const viteEnv = readViteEnv();
    const initialStream =
      viteEnv?.DEV === true && typeof window !== 'undefined'
        ? `${window.location.origin}/api/multiplayer/stream`
        : 'http://127.0.0.1:5000/api/multiplayer/stream';
    globalDatastarClient = new DatastarClient(initialStream);

    ensureMultiplayerStreamUrlResolved()
      .then((url) => {
        if (globalDatastarClient) {
          globalDatastarClient.setUrl(url);
          console.log('[Datastar] SSE endpoint configured successfully');
        }
      })
      .catch((error: unknown) => {
        console.warn('[Datastar] Failed to determine multiplayer server:', error);
        console.warn('[Datastar] Multiplayer will not be available');
      });
  }
  return globalDatastarClient;
}

/**
 * Sets a custom global Datastar client (for testing)
 * @expected-unused
 */
export function setDatastarClient(client: DatastarClient | null): void {
  globalDatastarClient = client;
  if (client === null) {
    resolvedStreamUrlPromise = null;
  }
}
