/**
 * True when running under Vite in development; false in production and in the official playground.
 * Cast avoids requiring Vite's `ImportMetaEnv` where the playground TS service has no `env`.
 */
export function isViteDev(): boolean {
  const meta = import.meta as { env?: { DEV?: boolean } };
  return meta.env?.DEV === true;
}

/**
 * Logs only in Vite dev; no-op in production builds and in the official playground.
 */
export function devLog(...args: Parameters<typeof console.log>): void {
  if (isViteDev()) {
    console.log(...args);
  }
}
