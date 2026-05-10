/**
 * True when running under Vite in development; false in production and in the official playground.
 */
export function isViteDev(): boolean {
  return import.meta.env?.DEV ?? false;
}

/**
 * Logs only in Vite dev; no-op in production builds and in the official playground.
 */
export function devLog(...args: Parameters<typeof console.log>): void {
  if (isViteDev()) {
    console.log(...args);
  }
}
