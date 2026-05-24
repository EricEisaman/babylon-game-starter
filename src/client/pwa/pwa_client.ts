// ============================================================================
// PWA CLIENT — service worker registration and cache lifecycle
// ============================================================================

import { Workbox } from 'workbox-window';

import { getBrandingConfig, loadBrandingConfig } from '../utils/branding_config';

type UpdateListener = (available: boolean) => void;

let workbox: Workbox | null = null;
let updateAvailable = false;
const updateListeners = new Set<UpdateListener>();

function isPlaygroundRuntime(): boolean {
  try {
    if (window.location.hostname.includes('playground.babylonjs.com')) {
      return true;
    }
  } catch {
    return false;
  }
  return document.getElementById('pg-split') instanceof HTMLElement;
}

function notifyUpdateListeners(): void {
  for (const listener of updateListeners) {
    listener(updateAvailable);
  }
}

export function onPwaUpdateAvailable(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  listener(updateAvailable);
  return () => {
    updateListeners.delete(listener);
  };
}

export function isPwaUpdateAvailable(): boolean {
  return updateAvailable;
}

export function isPwaSupported(): boolean {
  return 'serviceWorker' in navigator && !isPlaygroundRuntime();
}

export async function initPwa(): Promise<void> {
  if (!isPwaSupported()) {
    return;
  }

  const branding = getBrandingConfig() ?? (await loadBrandingConfig());
  if (!branding.pwa.enabled) {
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}sw.js`.replace(/\/{2,}/g, '/').replace(':/', '://');
  workbox = new Workbox(swUrl, { type: 'module' });

  workbox.addEventListener('waiting', () => {
    updateAvailable = true;
    notifyUpdateListeners();
  });

  workbox.addEventListener('controlling', () => {
    window.location.reload();
  });

  try {
    await workbox.register();
  } catch (error) {
    console.warn('[PwaClient] Service worker registration failed:', error);
  }
}

export async function applyPwaUpdate(): Promise<void> {
  if (!workbox) {
    return;
  }

  workbox.addEventListener('controlling', () => {
    window.location.reload();
  });

  workbox.messageSkipWaiting();
  await Promise.resolve();
}

export async function purgePwaCache(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  updateAvailable = false;
  notifyUpdateListeners();
  window.location.reload();
}
