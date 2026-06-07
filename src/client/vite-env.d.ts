/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Host[:port] for the Go multiplayer service; overrides CONFIG.MULTIPLAYER discovery. */
  readonly VITE_MULTIPLAYER_HOST?: string;
  /** Chat Slayer origin baked in at Vite build time (from CHAT_UPSTREAM_URL / deploy settings). */
  readonly VITE_CHAT_UPSTREAM_URL?: string;
}
