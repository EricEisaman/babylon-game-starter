// ============================================================================
// CHAT CONFIG LOADER (runtime)
// ============================================================================
//
// Deployed game URL(s) (e.g. http://localhost:5173, your GitHub Pages origin)
// must be listed in Chat Slayer ALLOWED_CLIENTS for `clientId`, or browser
// requests will fail CORS / 403. See ../chat-slayer/CLIENT_GUIDE.md and
// ../chat-slayer/RENDER_DEPLOYMENT.md.

import { withAppBasePath } from './branding_config';
import { isQueryFlagEnabled } from './query_hook';

import type { ChatConfig, ChatRoomMode, ResolvedChatConfig } from '../types/chat';

const DEFAULT_CHAT: ResolvedChatConfig = {
  enabled: false,
  serviceUrl: '',
  streamServiceUrl: '',
  clientId: 'web-demo',
  roomMode: 'per-environment',
  gameRoomName: 'Lobby',
  roomNamePrefix: '',
  e2eeEnabled: false,
  tlsPinEnforced: false,
  expectedTlsFingerprintSha256: '',
  expectedTlsFingerprintBackupSha256: '',
  warmupTimeoutMs: 60_000,
  warmupRetryIntervalMs: 2_000,
  allowRegistration: true,
  allowedUsers: []
};

/** Hosts where Netlify/Pages edge proxies break chunked SSE (see CHAT.md). */
function needsDirectStreamUpstream(hostname: string): boolean {
  return hostname.endsWith('.netlify.app') || hostname.endsWith('.github.io');
}

interface ResolvedChatUrls {
  readonly serviceUrl: string;
  readonly streamServiceUrl: string;
}

/**
 * REST uses same-origin `/chat-api` when the deploy host provides a proxy (avoids CORS on
 * register/login). SSE uses direct Chat Slayer only on static hosts where the proxy cannot
 * forward chunked streams.
 */
function resolveChatServiceUrls(configured: string): ResolvedChatUrls {
  const proxyPrefix = __CHAT_PROXY_PREFIX__;
  const directUpstream = __CHAT_DIRECT_UPSTREAM_URL__;

  if (configured !== proxyPrefix) {
    const url = normalizeServiceUrl(configured);
    return { serviceUrl: url, streamServiceUrl: url };
  }

  if (!__CHAT_SAME_ORIGIN_PROXY_AVAILABLE__) {
    return { serviceUrl: directUpstream, streamServiceUrl: directUpstream };
  }

  if (typeof window === 'undefined') {
    return { serviceUrl: proxyPrefix, streamServiceUrl: directUpstream };
  }

  const streamDirect = needsDirectStreamUpstream(window.location.hostname);
  return {
    serviceUrl: proxyPrefix,
    streamServiceUrl: streamDirect ? directUpstream : proxyPrefix
  };
}

let cachedConfig: ResolvedChatConfig | null = null;
let loadPromise: Promise<ResolvedChatConfig> | null = null;

function normalizeServiceUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeAllowedUsers(users: readonly string[] | undefined): readonly string[] {
  if (!users?.length) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const name of users) {
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function resolveChatConfig(raw: ChatConfig): ResolvedChatConfig {
  const enabled = raw.enabled === true;
  const roomMode: ChatRoomMode = raw.roomMode === 'game-wide' ? 'game-wide' : 'per-environment';
  const allowRegistration = raw.allowRegistration !== false;
  const allowedUsers = allowRegistration ? [] : normalizeAllowedUsers(raw.allowedUsers);
  const urls =
    enabled && raw.serviceUrl
      ? resolveChatServiceUrls(raw.serviceUrl)
      : { serviceUrl: '', streamServiceUrl: '' };

  return {
    enabled,
    serviceUrl: normalizeServiceUrl(urls.serviceUrl),
    streamServiceUrl: normalizeServiceUrl(urls.streamServiceUrl),
    clientId: raw.clientId?.trim() ?? DEFAULT_CHAT.clientId,
    roomMode,
    gameRoomName: raw.gameRoomName?.trim() ?? DEFAULT_CHAT.gameRoomName,
    roomNamePrefix: raw.roomNamePrefix ?? DEFAULT_CHAT.roomNamePrefix,
    e2eeEnabled: raw.e2eeEnabled === true,
    tlsPinEnforced: raw.tlsPinEnforced === true,
    expectedTlsFingerprintSha256: raw.expectedTlsFingerprintSha256?.trim() ?? '',
    expectedTlsFingerprintBackupSha256: raw.expectedTlsFingerprintBackupSha256?.trim() ?? '',
    warmupTimeoutMs: raw.warmupTimeoutMs ?? DEFAULT_CHAT.warmupTimeoutMs,
    warmupRetryIntervalMs: raw.warmupRetryIntervalMs ?? DEFAULT_CHAT.warmupRetryIntervalMs,
    allowRegistration,
    allowedUsers
  };
}

export async function loadChatConfig(): Promise<ResolvedChatConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const response = await fetch(withAppBasePath('/chat/config.json'), { cache: 'no-store' });
      if (!response.ok) {
        cachedConfig = DEFAULT_CHAT;
      } else {
        const data = (await response.json()) as ChatConfig;
        cachedConfig = resolveChatConfig(data);
      }
    } catch {
      cachedConfig = DEFAULT_CHAT;
    }
    return cachedConfig;
  })();

  return loadPromise;
}

export function getChatConfig(): ResolvedChatConfig | null {
  return cachedConfig;
}

export function isChatEnabled(): boolean {
  return (
    cachedConfig?.enabled === true &&
    cachedConfig.serviceUrl.length > 0 &&
    cachedConfig.streamServiceUrl.length > 0
  );
}

/** `?chatui=true` (also `1` / `yes`) — show chat UI without a configured service. */
export function isChatUiDebugEnabled(): boolean {
  return isQueryFlagEnabled('chatui');
}

/** Mount chat button + panel when live chat or UI debug flag is on. */
export function isChatUiVisible(): boolean {
  return isChatEnabled() || isChatUiDebugEnabled();
}

/** Local mock data only; no Chat Slayer network calls. */
export function isChatUiPreviewMode(): boolean {
  return isChatUiDebugEnabled() && !isChatEnabled();
}

export function isChatRegistrationAllowed(): boolean {
  return cachedConfig?.allowRegistration !== false;
}

export function getChatAllowedUsers(): readonly string[] {
  return cachedConfig?.allowedUsers ?? [];
}

/** True when login is restricted to `allowedUsers` (non-empty, registration off). */
export function isChatLoginRestrictedToAllowedUsers(): boolean {
  const config = cachedConfig;
  return config !== null && !config.allowRegistration && config.allowedUsers.length > 0;
}

export function isChatUsernameAllowed(username: string): boolean {
  const config = cachedConfig;
  if (!config || config.allowRegistration || config.allowedUsers.length === 0) {
    return true;
  }
  const key = username.trim().toLowerCase();
  return config.allowedUsers.some((name) => name.toLowerCase() === key);
}

export { DEFAULT_CHAT };
