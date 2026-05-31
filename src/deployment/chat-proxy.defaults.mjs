/** @typedef {'same-origin-proxy' | 'direct'} ChatProxyMode */
/** @typedef {'nginx' | 'netlify-redirect' | 'none'} ChatProxyMaterializer */

/** Browser path prefix when using a host reverse proxy (must match chat/config.json serviceUrl). */
export const DEFAULT_CHAT_PROXY_PREFIX = '/chat-api';

/** Default Chat Slayer origin (no trailing slash). Override with CHAT_UPSTREAM_URL. */
export const DEFAULT_CHAT_UPSTREAM_URL = 'https://chat-slayer.onrender.com';

/** Platform env var for upstream override (build + container runtime). */
export const CHAT_UPSTREAM_ENV_VAR = 'CHAT_UPSTREAM_URL';
