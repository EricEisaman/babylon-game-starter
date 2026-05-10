// ============================================================================
// MULTIPLAYER MANAGER - Client-side orchestration
// ============================================================================

import { CONFIG } from '../config/game_config';
import {
  getDatastarClient,
  getMultiplayerHttpOrigin,
  type DatastarClient
} from '../datastar/datastar_client';

import type {
  MultiplayerClientState,
  JoinResponse,
  ItemStateUpdate,
  EffectStateUpdate,
  LightStateUpdate,
  SkyEffectStateUpdate,
  CharacterStateUpdate,
  SynchronizerChangedMessage,
  ClientConnectionEvent,
  ItemAuthorityChangedMessage,
  EnvItemAuthorityChangedMessage,
  ItemAuthorityClaim,
  ItemAuthorityClaimResponse,
  ItemAuthorityRelease,
  ItemAuthorityReleaseResponse
} from '../types/multiplayer';

export interface MultiplayerManagerConfig {
  autoJoinOnInit?: boolean;
  updateThrottleMs?: number;
}

interface MultiplayerEventMap {
  connected: MultiplayerClientState;
  disconnected: undefined;
  error: Error;
  'character-state-update': CharacterStateUpdate;
  'item-state-update': ItemStateUpdate;
  'effects-state-update': EffectStateUpdate;
  'lights-state-update': LightStateUpdate;
  'sky-effects-state-update': SkyEffectStateUpdate;
  'synchronizer-changed': SynchronizerChangedMessage;
  'item-authority-changed': ItemAuthorityChangedMessage;
  'env-item-authority-changed': EnvItemAuthorityChangedMessage;
  'client-joined': ClientConnectionEvent;
  'client-left': ClientConnectionEvent;
}

type MultiplayerEventName = keyof MultiplayerEventMap;
type MultiplayerEmitHandler<K extends MultiplayerEventName> = (
  data: MultiplayerEventMap[K]
) => void;
type MultiplayerListeners = {
  [K in MultiplayerEventName]: Set<MultiplayerEmitHandler<K>>;
};

/**
 * Manages client-side multiplayer synchronization
 *
 * Responsibilities:
 * - Join/leave multiplayer session
 * - Manage SSE connection via Datastar
 * - Orchestrate state sync across managers
 * - Handle synchronizer role and client leadership
 */
export class MultiplayerManager {
  private static instance: MultiplayerManager | null = null;

  private clientState: MultiplayerClientState | null = null;
  /** Base `https://host:port` for REST calls (may differ from page origin when using VITE_MULTIPLAYER_HOST). */
  private mpHttpOrigin: string | null = null;
  private datastarClient: DatastarClient;
  private isConnected = false;
  private listeners: MultiplayerListeners = {
    connected: new Set(),
    disconnected: new Set(),
    error: new Set(),
    'character-state-update': new Set(),
    'item-state-update': new Set(),
    'effects-state-update': new Set(),
    'lights-state-update': new Set(),
    'sky-effects-state-update': new Set(),
    'synchronizer-changed': new Set(),
    'item-authority-changed': new Set(),
    'env-item-authority-changed': new Set(),
    'client-joined': new Set(),
    'client-left': new Set()
  };

  // Signal unsubscribers
  private unsubscribers: (() => void)[] = [];

  constructor(config?: MultiplayerManagerConfig) {
    void config;
    this.datastarClient = getDatastarClient();
    this.setupEventListeners();
  }

  /**
   * Gets or creates the singleton instance
   */
  public static getInstance(config?: MultiplayerManagerConfig): MultiplayerManager {
    MultiplayerManager.instance ??= new MultiplayerManager(config);
    return MultiplayerManager.instance;
  }

  /**
   * Joins a multiplayer session
   */
  public async join(environmentName: string, characterName: string): Promise<void> {
    if (!CONFIG.MULTIPLAYER.ENABLED) {
      throw new Error('Multiplayer is disabled in configuration');
    }

    try {
      console.log('[MultiplayerManager] Joining multiplayer session...');

      this.mpHttpOrigin = await getMultiplayerHttpOrigin();
      // Ensure EventSource URL is set before connect (same promise as getDatastarClient, but avoid a race with its .then microtask).
      this.datastarClient.setUrl(`${this.mpHttpOrigin}/api/multiplayer/stream`);

      // Call join endpoint
      const response = await fetch(`${this.mpHttpOrigin}/api/multiplayer/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment_name: environmentName,
          character_name: characterName
        })
      });

      if (!response.ok) {
        throw new Error(`Join failed: ${response.status} ${response.statusText}`);
      }

      const joinResponse: JoinResponse = await response.json();

      // Store client state
      this.clientState = {
        clientId: joinResponse.client_id,
        isSynchronizer: joinResponse.is_synchronizer,
        sessionStarted: new Date().toISOString(),
        environment: environmentName,
        character: characterName
      };

      console.log(`[MultiplayerManager] Joined successfully`, {
        clientId: this.clientState.clientId,
        isSynchronizer: this.clientState.isSynchronizer,
        existingClients: joinResponse.existing_clients
      });

      // Connect to SSE endpoint
      await this.connectSSE(joinResponse.session_id);

      this.isConnected = true;
      this.emit('connected', this.clientState);
    } catch (error) {
      this.mpHttpOrigin = null;
      console.error('[MultiplayerManager] Join failed:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Leaves the multiplayer session
   */
  public async leave(): Promise<void> {
    try {
      if (!this.clientState) {
        return;
      }

      console.log('[MultiplayerManager] Leaving multiplayer session...');

      // Unsubscribe from all signals
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];

      // Call leave endpoint
      const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
      await fetch(`${origin}/api/multiplayer/leave`, {
        method: 'POST',
        headers: {
          'X-Client-ID': this.clientState.clientId
        }
      });

      // Disconnect SSE
      this.datastarClient.disconnect();

      this.isConnected = false;
      this.clientState = null;
      this.mpHttpOrigin = null;
      this.emit('disconnected', undefined);
    } catch (error) {
      console.error('[MultiplayerManager] Leave failed:', error);
    }
  }

  /**
   * Checks if multiplayer is enabled in configuration
   */
  public isEnabled(): boolean {
    return CONFIG.MULTIPLAYER.ENABLED;
  }

  /**
   * Checks if client is connected to multiplayer
   */
  public isMultiplayerActive(): boolean {
    return this.isConnected && this.clientState !== null;
  }

  /**
   * Checks if this client is the synchronizer
   */
  public isSynchronizer(): boolean {
    return this.clientState?.isSynchronizer ?? false;
  }

  /**
   * Gets current client state
   */
  public getClientState(): MultiplayerClientState | null {
    return this.clientState;
  }

  /**
   * Gets current client ID
   */
  public getClientID(): string | null {
    return this.clientState?.clientId ?? null;
  }

  /**
   * Sends this client's character pose. Every connected client may send their own avatar;
   * the server rejects updates whose `clientId` does not match `X-Client-ID`.
   * (World/item/effects sync remains synchronizer-only — see other update* methods.)
   */
  public async updateCharacterState(update: CharacterStateUpdate): Promise<void> {
    const st = this.clientState;
    if (!st) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      await this.datastarClient.patch(
        `${origin}/api/multiplayer/character-state`,
        { updates: update.updates, timestamp: update.timestamp },
        { headers: { 'X-Client-ID': st.clientId } }
      );
    } catch (error) {
      console.error('[MultiplayerManager] Failed to update character state:', error);
    }
  }

  /**
   * Sends item state update. Under the hybrid authority model (MULTIPLAYER_SYNCH.md §5.2)
   * any connected client may PATCH this endpoint; the server filters rows per-instance:
   *   - Owner-owned rows (`instanceId` in server's itemOwners) are accepted only from the owner.
   *   - Unowned rows are accepted only from the base synchronizer (bootstrap / collectibles).
   * Unauthorized rows are silently dropped. Callers should still only send rows they
   * own, plus collectible bootstrap rows if they are the base synchronizer.
   */
  public async updateItemState(update: ItemStateUpdate): Promise<void> {
    const st = this.clientState;
    if (!st) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      await this.datastarClient.patch(
        `${origin}/api/multiplayer/item-state`,
        {
          updates: update.updates,
          collections: update.collections,
          timestamp: update.timestamp
        },
        { headers: { 'X-Client-ID': st.clientId } }
      );
    } catch (error) {
      console.error('[MultiplayerManager] Failed to update item state:', error);
    }
  }

  /**
   * Claim per-item authority (MULTIPLAYER_SYNCH.md §5.6 / §4.7). Resolves with the server's
   * decision: `accepted=true` means this client now (or still) owns the `instanceId` and may
   * publish rows for it. `accepted=false` indicates a live owner held the lock; `currentOwnerId`
   * reports who.
   *
   * The server also broadcasts an `item-authority-changed` SSE signal on transitions, which
   * {@link ItemAuthorityTracker} listens to so every client converges on the same view.
   */
  public async claimItemAuthority(
    instanceId: string,
    opts?: { clientPosition?: { x: number; y: number; z: number }; reason?: string }
  ): Promise<ItemAuthorityClaimResponse | null> {
    const st = this.clientState;
    if (!st) {
      return null;
    }
    const body: ItemAuthorityClaim = {
      instanceId,
      clientPosition: opts?.clientPosition,
      reason: opts?.reason,
      timestamp: Date.now()
    };
    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      const res = await fetch(`${origin}/api/multiplayer/item-authority-claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': st.clientId },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as ItemAuthorityClaimResponse;
    } catch (error) {
      console.warn('[MultiplayerManager] Claim failed:', error);
      return null;
    }
  }

  /**
   * Release per-item authority (MULTIPLAYER_SYNCH.md §5.7). Idempotent; returns the server's
   * echoed decision. A corresponding `item-authority-changed` SSE signal is broadcast only
   * when this call actually transitions ownership.
   */
  public async releaseItemAuthority(
    instanceId: string,
    opts?: { reason?: string }
  ): Promise<ItemAuthorityReleaseResponse | null> {
    const st = this.clientState;
    if (!st) {
      return null;
    }
    const body: ItemAuthorityRelease = {
      instanceId,
      reason: opts?.reason,
      timestamp: Date.now()
    };
    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      const res = await fetch(`${origin}/api/multiplayer/item-authority-release`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': st.clientId },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as ItemAuthorityReleaseResponse;
    } catch (error) {
      console.warn('[MultiplayerManager] Release failed:', error);
      return null;
    }
  }

  /**
   * Notify the server that this client has switched environments. Without this call the
   * server's `envAuthority` / `envClientOrder` maps only reflect the join-time environment,
   * so `envAuthority[newEnv]` is never assigned after an in-game portal transition; no
   * `env-item-authority-changed` broadcast goes out for the new env, no client becomes
   * env-authority for it, and `item-state-update` is never published for its items. Each
   * client then simulates physics (e.g. RV Life presents) independently and diverges.
   *
   * Behavior (see MULTIPLAYER_SYNCH.md §4.8):
   *  - Idempotent: a call with the current env resolves immediately with current auth.
   *  - Errors are logged and swallowed so single-player / offline / server-down paths keep
   *    working. The caller should always proceed to local `SettingsUI.changeEnvironment`.
   *  - On success the returned `envAuthority[newEnv]` is applied optimistically via a
   *    synthetic `env-item-authority-changed` emission, so the local tracker opens its
   *    publish gate without waiting for the SSE echo round-trip.
   */
  public async switchEnvironment(environmentName: string): Promise<void> {
    const st = this.clientState;
    if (!st || !this.isConnected) {
      return;
    }

    const newEnv = (environmentName ?? '').trim();
    if (!newEnv) {
      return;
    }
    if (st.environment === newEnv) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      const res = await fetch(`${origin}/api/multiplayer/env-switch`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': st.clientId
        },
        body: JSON.stringify({ environmentName: newEnv })
      });

      if (!res.ok) {
        console.warn(`[MultiplayerManager] env-switch failed: ${res.status} ${res.statusText}`);
        return;
      }

      const body = (await res.json()) as {
        ok?: boolean;
        envAuthority?: Record<string, string | null>;
        serverTimestamp?: number;
      };

      st.environment = newEnv;

      // Optimistic apply: synthesize an env-item-authority-changed so listeners
      // (ItemAuthorityTracker + multiplayer_bootstrap) can unblock the publish gate on the
      // very next tick instead of waiting for the SSE round-trip.
      const auth = body.envAuthority?.[newEnv];
      if (auth !== undefined) {
        const synthetic: EnvItemAuthorityChangedMessage = {
          environmentName: newEnv, // §6.9 field name
          newAuthorityId: auth ?? null,
          prevAuthorityId: null,
          reason: 'snapshot',
          timestamp: body.serverTimestamp ?? Date.now()
        };
        this.emit('env-item-authority-changed', synthetic);
      }
    } catch (error) {
      console.warn('[MultiplayerManager] env-switch request failed:', error);
    }
  }

  /**
   * Sends effects state update (synchronizer only)
   */
  public async updateEffectsState(update: EffectStateUpdate): Promise<void> {
    if (!this.isSynchronizer()) {
      console.warn('[MultiplayerManager] Only synchronizer can update effects state');
      return;
    }

    const st = this.clientState;
    if (!st) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      await this.datastarClient.patch(
        `${origin}/api/multiplayer/effects-state`,
        {
          particle_effects: update.particleEffects,
          environment_particles: update.environmentParticles,
          timestamp: update.timestamp
        },
        { headers: { 'X-Client-ID': st.clientId } }
      );
    } catch (error) {
      console.error('[MultiplayerManager] Failed to update effects state:', error);
    }
  }

  /**
   * Sends lights state update (synchronizer only)
   */
  public async updateLightsState(update: LightStateUpdate): Promise<void> {
    if (!this.isSynchronizer()) {
      console.warn('[MultiplayerManager] Only synchronizer can update lights state');
      return;
    }

    const st = this.clientState;
    if (!st) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      await this.datastarClient.patch(
        `${origin}/api/multiplayer/lights-state`,
        { updates: update.updates, timestamp: update.timestamp },
        { headers: { 'X-Client-ID': st.clientId } }
      );
    } catch (error) {
      console.error('[MultiplayerManager] Failed to update lights state:', error);
    }
  }

  /**
   * Sends sky effects update (synchronizer only)
   */
  public async updateSkyEffects(update: SkyEffectStateUpdate): Promise<void> {
    if (!this.isSynchronizer()) {
      console.warn('[MultiplayerManager] Only synchronizer can update sky effects');
      return;
    }

    const st = this.clientState;
    if (!st) {
      return;
    }

    const origin = this.mpHttpOrigin ?? (await getMultiplayerHttpOrigin());
    try {
      await this.datastarClient.patch(
        `${origin}/api/multiplayer/sky-effects-state`,
        { updates: update.updates, timestamp: update.timestamp },
        { headers: { 'X-Client-ID': st.clientId } }
      );
    } catch (error) {
      console.error('[MultiplayerManager] Failed to update sky effects:', error);
    }
  }

  /**
   * Subscribes to state updates
   */
  public on<K extends MultiplayerEventName>(
    eventName: K,
    listener: MultiplayerEmitHandler<K>
  ): () => void {
    this.listeners[eventName].add(listener);

    // Return unsubscriber
    return () => {
      this.listeners[eventName].delete(listener);
    };
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  private setupEventListeners(): void {
    // Listen for Datastar connection events
    this.datastarClient.addEventListener('connected', () => {
      console.log('[MultiplayerManager] SSE connection established');
    });

    this.datastarClient.addEventListener('disconnected', () => {
      console.log('[MultiplayerManager] SSE disconnected');
      if (this.isConnected) {
        this.emit('disconnected', undefined);
        this.isConnected = false;
      }
    });

    this.datastarClient.addEventListener('error', (error) => {
      console.error('[MultiplayerManager] SSE error:', error);
      this.emit('error', error);
    });
  }

  private async connectSSE(sessionID: string): Promise<void> {
    // Set session ID for SSE authentication
    this.datastarClient.setSessionID(sessionID);

    // Subscribe to state update signals
    const unsub1 = this.datastarClient.onSignal<CharacterStateUpdate>(
      'character-state-update',
      (data) => {
        this.emit('character-state-update', data);
      }
    );

    const unsub2 = this.datastarClient.onSignal<ItemStateUpdate>('item-state-update', (data) => {
      this.emit('item-state-update', data);
    });

    const unsub3 = this.datastarClient.onSignal<EffectStateUpdate>(
      'effects-state-update',
      (data) => {
        this.emit('effects-state-update', data);
      }
    );

    const unsub4 = this.datastarClient.onSignal<LightStateUpdate>('lights-state-update', (data) => {
      this.emit('lights-state-update', data);
    });

    const unsub5 = this.datastarClient.onSignal<SkyEffectStateUpdate>(
      'sky-effects-state-update',
      (data) => {
        this.emit('sky-effects-state-update', data);
      }
    );

    const unsub6 = this.datastarClient.onSignal<SynchronizerChangedMessage>(
      'synchronizer-changed',
      (data) => {
        this.handleSynchronizerChanged(data);
      }
    );

    const unsub7 = this.datastarClient.onSignal<ClientConnectionEvent>('client-joined', (data) => {
      this.emit('client-joined', data);
    });

    const unsub8 = this.datastarClient.onSignal<ClientConnectionEvent>('client-left', (data) => {
      this.emit('client-left', data);
    });

    const unsub9 = this.datastarClient.onSignal<ItemAuthorityChangedMessage>(
      'item-authority-changed',
      (data) => {
        this.emit('item-authority-changed', data);
      }
    );

    // MULTIPLAYER_SYNCH.md §4.8: `env-item-authority-changed` carries the identity of the
    // current env-authority for each environment. Without this subscription the signal is
    // emitted by the server but never reaches listeners, so `ItemAuthorityTracker.envAuthority`
    // stays empty, `isOwnedBySelf` never resolves tier 2, and every client keeps unclaimed
    // items in the ANIMATED-default state (breaking the DYNAMIC-only-on-owner invariant).
    const unsub10 = this.datastarClient.onSignal<EnvItemAuthorityChangedMessage>(
      'env-item-authority-changed',
      (data) => {
        this.emit('env-item-authority-changed', data);
      }
    );

    this.unsubscribers.push(
      unsub1,
      unsub2,
      unsub3,
      unsub4,
      unsub5,
      unsub6,
      unsub7,
      unsub8,
      unsub9,
      unsub10
    );

    // Connect to SSE
    await this.datastarClient.connect();
  }

  private handleSynchronizerChanged(message: SynchronizerChangedMessage): void {
    if (this.clientState && message.newSynchronizerId === this.clientState.clientId) {
      this.clientState.isSynchronizer = true;
      console.log('[MultiplayerManager] This client became synchronizer');
    } else if (this.clientState) {
      this.clientState.isSynchronizer = false;
    }

    this.emit('synchronizer-changed', message);
  }

  private emit<K extends MultiplayerEventName>(eventName: K, data: MultiplayerEventMap[K]): void {
    const listeners = this.listeners[eventName];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`[MultiplayerManager] Error in listener for ${eventName}:`, error);
      }
    }
  }
}

/**
 * Convenience export for singleton access
 */
export function getMultiplayerManager(config?: MultiplayerManagerConfig): MultiplayerManager {
  return MultiplayerManager.getInstance(config);
}
