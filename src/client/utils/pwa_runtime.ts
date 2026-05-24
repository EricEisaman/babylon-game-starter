// ============================================================================
// PWA RUNTIME BRIDGE (playground-safe)
// ============================================================================
// Settings UI imports this module only. Vite `main.ts` registers real handlers
// from `pwa/pwa_client.ts`. The playground export never imports `pwa/` or
// `workbox-window`.

export interface PwaRuntimeHandlers {
  readonly isSupported: () => boolean;
  readonly isUpdateAvailable: () => boolean;
  readonly onUpdateAvailable: (listener: (available: boolean) => void) => () => void;
  readonly applyUpdate: () => Promise<void>;
  readonly purgeCache: () => Promise<void>;
  readonly isInstallOfferAvailable: () => boolean;
  readonly onInstallOfferChanged: (listener: () => void) => () => void;
  readonly showInstallInstructions: () => void;
  readonly maybeShowInstallCoach: () => void;
  readonly recordPwaVisit: () => void;
}

const noopUnsubscribe = (): void => {
  // Playground export: PWA handlers not registered.
};

const disabledRuntime: PwaRuntimeHandlers = {
  isSupported: () => false,
  isUpdateAvailable: () => false,
  onUpdateAvailable: () => noopUnsubscribe,
  applyUpdate: () => Promise.resolve(),
  purgeCache: () => Promise.resolve(),
  isInstallOfferAvailable: () => false,
  onInstallOfferChanged: () => noopUnsubscribe,
  showInstallInstructions: () => {
    // Playground export: PWA handlers not registered.
  },
  maybeShowInstallCoach: () => {
    // Playground export: PWA handlers not registered.
  },
  recordPwaVisit: () => {
    // Playground export: PWA handlers not registered.
  }
};

let activeRuntime: PwaRuntimeHandlers = disabledRuntime;

/** Called from Vite `main.ts` only — not from playground entry `index.ts`. */
export function registerPwaRuntime(handlers: PwaRuntimeHandlers): void {
  activeRuntime = handlers;
}

export function resetPwaRuntime(): void {
  activeRuntime = disabledRuntime;
}

export function isPwaSupported(): boolean {
  return activeRuntime.isSupported();
}

export function isPwaUpdateAvailable(): boolean {
  return activeRuntime.isUpdateAvailable();
}

export function onPwaUpdateAvailable(listener: (available: boolean) => void): () => void {
  return activeRuntime.onUpdateAvailable(listener);
}

export async function applyPwaUpdate(): Promise<void> {
  await activeRuntime.applyUpdate();
}

export async function purgePwaCache(): Promise<void> {
  await activeRuntime.purgeCache();
}

export function isPwaInstallOfferAvailable(): boolean {
  return activeRuntime.isInstallOfferAvailable();
}

export function onPwaInstallOfferChanged(listener: () => void): () => void {
  return activeRuntime.onInstallOfferChanged(listener);
}

export function showPwaInstallInstructions(): void {
  activeRuntime.showInstallInstructions();
}

export function maybeShowPwaInstallCoach(): void {
  activeRuntime.maybeShowInstallCoach();
}

export function recordPwaVisit(): void {
  activeRuntime.recordPwaVisit();
}
