// ============================================================================
// VITE ENV BRIDGE (playground-safe)
// ============================================================================
//
// Vite inlines bare `import.meta.env` at build time. The playground export does
// not include `vite-env.d.ts` / `vite/client`, so Monaco's `ImportMeta` has no
// `env` unless we augment it here (this file is in the export graph).
// Ambient shapes must merge cleanly with Vite's `ImportMeta` / `ImportMetaEnv`
// (`env` required, typed as `ImportMetaEnv`). Do not redeclare Vite's required
// `BASE_URL` / `DEV` here — optional copies conflict under local `tsc`.
// Other bundled modules must use `readViteEnv()` — the smoke checker rejects
// `import.meta.env.` / `import.meta.env[` member access elsewhere.
// Do NOT use `(import.meta as { env }).env` — Vite/Rolldown may not replace that
// cast form, leaving DEV / VITE_* undefined under `npm run dev`.

export interface ViteEnvLike {
  readonly BASE_URL?: string;
  readonly DEV?: boolean;
  readonly VITE_ENGINE?: string;
  readonly VITE_MULTIPLAYER_HOST?: string;
  readonly VITE_CHAT_UPSTREAM_URL?: string;
}

declare global {
  /** Playground Monaco has no vite/client; local tsc merges with Vite's interface. */
  interface ImportMetaEnv {
    readonly VITE_ENGINE?: string;
    readonly VITE_MULTIPLAYER_HOST?: string;
    readonly VITE_CHAT_UPSTREAM_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export function readViteEnv(): ViteEnvLike | undefined {
  try {
    // Direct `import.meta.env` so Vite inlines; playground types come from the
    // `declare global` above (vite-env.d.ts is not shipped in playground.json).
    return import.meta.env;
  } catch {
    return undefined;
  }
}
