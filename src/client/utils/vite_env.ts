// ============================================================================
// VITE ENV BRIDGE (playground-safe)
// ============================================================================
//
// Vite inlines `import.meta.env.*` at build time for direct property access.
// The Babylon playground Monaco TS service has no `ImportMetaEnv` type and
// rejects bare `import.meta.env` references. Every bundled module should read
// env through `readViteEnv()` instead.

export interface ViteEnvLike {
  readonly BASE_URL?: string;
  readonly DEV?: boolean;
  readonly VITE_MULTIPLAYER_HOST?: string;
  readonly VITE_CHAT_UPSTREAM_URL?: string;
}

export function readViteEnv(): ViteEnvLike | undefined {
  try {
    const meta = import.meta as { env?: ViteEnvLike };
    return meta.env;
  } catch {
    return undefined;
  }
}
