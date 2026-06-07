// ============================================================================
// CHAT PROXY RESOLUTION (playground-safe)
// ============================================================================
//
// Vite builds may override the direct upstream via import.meta.env.VITE_CHAT_UPSTREAM_URL.
// The Babylon playground has no Vite define injection — defaults apply and hosts
// without a /chat-api reverse proxy use direct Chat Slayer (see CHAT.md).

/** Browser path prefix when the deploy host provides a same-origin reverse proxy. */
export const CHAT_PROXY_PREFIX = '/chat-api';

export const DEFAULT_CHAT_DIRECT_UPSTREAM_URL = 'https://chat-slayer.onrender.com';

import { readViteEnv } from '../utils/vite_env';
export function getChatDirectUpstreamUrl(): string {
  const override = readViteEnv()?.VITE_CHAT_UPSTREAM_URL?.trim();
  return override && override.length > 0 ? override : DEFAULT_CHAT_DIRECT_UPSTREAM_URL;
}

/**
 * True when the current host materializes a same-origin `/chat-api` proxy
 * (Vite dev, Netlify redirect, Render nginx). False on static hosts and the
 * Babylon playground, which connect to Chat Slayer directly.
 */
export function isChatSameOriginProxyAvailable(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  const hostname = window.location.hostname;
  if (hostname.endsWith('.github.io')) {
    return false;
  }
  if (hostname.includes('playground.babylonjs.com')) {
    return false;
  }
  return true;
}
