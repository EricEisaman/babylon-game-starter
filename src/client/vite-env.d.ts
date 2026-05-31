/// <reference types="vite/client" />

declare const __CHAT_PROXY_PREFIX__: string;
declare const __CHAT_DIRECT_UPSTREAM_URL__: string;

interface ImportMetaEnv {
  /** Host[:port] for the Go multiplayer service; overrides CONFIG.MULTIPLAYER discovery. */
  readonly VITE_MULTIPLAYER_HOST?: string;
}
