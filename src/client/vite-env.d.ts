/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'webgl' | 'webgpu'` — overrides `CONFIG.PERFORMANCE.ENGINE` for local Vite runs (`npm run dev:wgpu`). */
  readonly VITE_ENGINE?: string;
  /** Host[:port] for the Go multiplayer service; overrides CONFIG.MULTIPLAYER discovery. */
  readonly VITE_MULTIPLAYER_HOST?: string;
  /** Chat Slayer origin baked in at Vite build time (from CHAT_UPSTREAM_URL / deploy settings). */
  readonly VITE_CHAT_UPSTREAM_URL?: string;
}
