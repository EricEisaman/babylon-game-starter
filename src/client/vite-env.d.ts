/// <reference types="vite/client" />

declare const __CHAT_PROXY_PREFIX__: string;
declare const __CHAT_DIRECT_UPSTREAM_URL__: string;
/** True when the deploy host materializes a same-origin `/chat-api` proxy (Netlify, Render, Vite dev). */
declare const __CHAT_SAME_ORIGIN_PROXY_AVAILABLE__: boolean;

interface ImportMetaEnv {
  /** Host[:port] for the Go multiplayer service; overrides CONFIG.MULTIPLAYER discovery. */
  readonly VITE_MULTIPLAYER_HOST?: string;
}
