// ============================================================================
// FALL RESPAWN HOOKS — declarative per-env ids + optional global fell-off-map hook
// ============================================================================

import { isViteDev } from '../utils/dev_log';

const handlers = new Map<string, () => void | Promise<void>>();
const warnedUnknown = new Set<string>();

let globalOnFellOffMapHook: (() => void | Promise<void>) | null = null;

export function registerFallRespawnHandler(id: string, fn: () => void | Promise<void>): void {
  handlers.set(id, fn);
}

export async function runFallRespawnHandler(id: string | undefined): Promise<void> {
  if (id === undefined || id.length === 0) {
    return;
  }
  const fn = handlers.get(id);
  if (!fn) {
    if (isViteDev() && !warnedUnknown.has(id)) {
      warnedUnknown.add(id);
      console.warn(
        `[FallRespawn] unknown onRespawnedHandlerId: ${id} — register it with registerFallRespawnHandler(...)`
      );
    }
    return;
  }
  await Promise.resolve(fn());
}

/** @expected-unused */
export function setGlobalOnFellOffMapHook(fn: (() => void | Promise<void>) | null): void {
  globalOnFellOffMapHook = fn;
}

export async function runGlobalOnFellOffMapHook(): Promise<void> {
  if (!globalOnFellOffMapHook) {
    return;
  }
  await Promise.resolve(globalOnFellOffMapHook());
}
