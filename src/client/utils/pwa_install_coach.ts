// ============================================================================
// PWA INSTALL COACH — iPad Safari + Chromium (playground-safe)
// ============================================================================
// iPadOS has no beforeinstallprompt. Users install via Share → Add to Home Screen.
// This module provides detection, a coach modal, and settings entry points.

import { getBrandingConfig, withAppBasePath } from './branding_config';
import { DeviceDetector } from './device_detector';

const VISIT_COUNT_KEY = 'bgs-pwa-visit-count';
const COACH_DISMISSED_KEY = 'bgs-pwa-install-coach-dismissed';
const MIN_VISITS_BEFORE_COACH = 2;

type InstallCoachMode = 'ipad-safari' | 'chromium';

interface InstallCoachCopy {
  readonly title: string;
  readonly intro: string;
  readonly steps: readonly string[];
  readonly primaryLabel: string;
  readonly showIpadHint: boolean;
}

/** Chromium `beforeinstallprompt` event — defined locally for playground export (no global.d.ts). */
interface ChromiumInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: ChromiumInstallPromptEvent | null = null;
const installOfferListeners = new Set<() => void>();

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

function isSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

function resolveInstallCoachMode(): InstallCoachMode {
  if (isIPadSafariInstallable()) {
    return 'ipad-safari';
  }
  if (isChromiumInstallPromptAvailable()) {
    return 'chromium';
  }
  return 'ipad-safari';
}

function getInstallCoachCopy(mode: InstallCoachMode): InstallCoachCopy {
  const appName = getAppDisplayName();

  if (mode === 'ipad-safari') {
    return {
      title: `Install ${appName} on your iPad`,
      intro:
        'Safari does not show an automatic install button. Add this game to your Home Screen in three taps:',
      steps: [
        'Tap the Share button in Safari’s toolbar (square with an upward arrow).',
        'Scroll the sheet and tap Add to Home Screen.',
        'Tap Add — the app icon appears on your Home Screen like any other app.'
      ],
      primaryLabel: 'Got it',
      showIpadHint: true
    };
  }

  return {
    title: `Install ${appName}`,
    intro: 'Install this app for a full-screen experience with offline play.',
    steps: ['Click Install below.', 'Confirm when your browser asks to install the app.'],
    primaryLabel: 'Install',
    showIpadHint: false
  };
}

async function triggerChromiumInstallPrompt(): Promise<void> {
  if (!deferredInstallPrompt) {
    return;
  }
  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  notifyInstallOfferChanged();
}

export function isRunningAsInstalledPwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

/** iPad Safari, browser tab (not already installed to Home Screen). */
export function isIPadSafariInstallable(): boolean {
  if (isPlaygroundRuntime()) {
    return false;
  }
  return DeviceDetector.isIPad() && isSafariBrowser() && !isRunningAsInstalledPwa();
}

export function isChromiumInstallPromptAvailable(): boolean {
  return deferredInstallPrompt !== null;
}

export function isInstallOfferAvailable(): boolean {
  if (isPlaygroundRuntime()) {
    return false;
  }
  if (isRunningAsInstalledPwa()) {
    return false;
  }
  return isIPadSafariInstallable() || isChromiumInstallPromptAvailable();
}

export function onInstallOfferChanged(listener: () => void): () => void {
  installOfferListeners.add(listener);
  return () => {
    installOfferListeners.delete(listener);
  };
}

function notifyInstallOfferChanged(): void {
  for (const listener of installOfferListeners) {
    listener();
  }
}

export function captureChromiumInstallPrompt(event: Event): void {
  event.preventDefault();
  if ('prompt' in event && typeof (event as ChromiumInstallPromptEvent).prompt === 'function') {
    deferredInstallPrompt = event as ChromiumInstallPromptEvent;
    notifyInstallOfferChanged();
  }
}

export function recordPwaVisit(): void {
  if (isPlaygroundRuntime() || isRunningAsInstalledPwa()) {
    return;
  }
  try {
    const count = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10);
    localStorage.setItem(VISIT_COUNT_KEY, String(Number.isFinite(count) ? count + 1 : 1));
  } catch {
    // Ignore private mode / blocked storage.
  }
}

function getVisitCount(): number {
  try {
    const count = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

function isCoachDismissed(): boolean {
  try {
    return localStorage.getItem(COACH_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissCoach(): void {
  try {
    localStorage.setItem(COACH_DISMISSED_KEY, '1');
  } catch {
    // Ignore.
  }
}

function getAppDisplayName(): string {
  const branding = getBrandingConfig();
  return branding?.pwa.shortName ?? branding?.title ?? 'This app';
}

function removeExistingModal(): void {
  document.getElementById('pwa-install-coach')?.remove();
}

function buildInstallModal(mode: InstallCoachMode): HTMLDivElement {
  const branding = getBrandingConfig();
  const appName = getAppDisplayName();
  const copy = getInstallCoachCopy(mode);

  const overlay = document.createElement('div');
  overlay.id = 'pwa-install-coach';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'pwa-install-coach-title');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 10050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    width: min(420px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    background: #1a1a1a;
    color: #f5f5f5;
    border: 2px solid rgba(0, 255, 136, 0.45);
    border-radius: 14px;
    padding: 22px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  `;

  const title = document.createElement('h2');
  title.id = 'pwa-install-coach-title';
  title.textContent = copy.title;
  title.style.cssText = 'margin: 0 0 12px; font-size: 20px; font-weight: 700;';

  const intro = document.createElement('p');
  intro.textContent = copy.intro;
  intro.style.cssText = 'margin: 0 0 16px; line-height: 1.45; opacity: 0.92;';

  const steps = document.createElement('ol');
  steps.style.cssText = 'margin: 0 0 16px; padding-left: 22px; line-height: 1.5;';

  for (const text of copy.steps) {
    const li = document.createElement('li');
    li.textContent = text;
    li.style.marginBottom = '8px';
    steps.appendChild(li);
  }

  panel.appendChild(title);
  panel.appendChild(intro);
  panel.appendChild(steps);

  if (copy.showIpadHint) {
    const hint = document.createElement('p');
    hint.innerHTML =
      '<strong>Tip:</strong> Look for the Share icon at the top of Safari, not the address bar menu on desktop.';
    hint.style.cssText = 'margin: 0 0 14px; font-size: 14px; opacity: 0.85;';
    panel.appendChild(hint);

    const shotSrc = branding?.pwa.screenshots.find((s) => s.formFactor === 'narrow')?.src;
    if (shotSrc) {
      const img = document.createElement('img');
      img.src = withAppBasePath(shotSrc);
      img.alt = `${appName} preview`;
      img.style.cssText =
        'display: block; width: 100%; border-radius: 10px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.15);';
      panel.insertBefore(img, hint);
    }
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;';

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'Not now';
  dismissBtn.style.cssText = `
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: transparent;
    color: white;
    cursor: pointer;
    font-size: 14px;
  `;
  dismissBtn.addEventListener('click', () => {
    dismissCoach();
    removeExistingModal();
  });

  const primaryBtn = document.createElement('button');
  primaryBtn.type = 'button';
  primaryBtn.textContent = copy.primaryLabel;
  primaryBtn.style.cssText = `
    padding: 10px 18px;
    border-radius: 8px;
    border: 1px solid rgba(0, 255, 136, 0.6);
    background: rgba(0, 255, 136, 0.2);
    color: white;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
  `;
  primaryBtn.addEventListener('click', () => {
    dismissCoach();
    removeExistingModal();
  });

  actions.appendChild(dismissBtn);
  actions.appendChild(primaryBtn);
  panel.appendChild(actions);
  overlay.appendChild(panel);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      dismissCoach();
      removeExistingModal();
    }
  });

  return overlay;
}

export function showInstallInstructions(): void {
  if (!isInstallOfferAvailable()) {
    return;
  }

  const mode = resolveInstallCoachMode();
  if (mode === 'chromium') {
    void triggerChromiumInstallPrompt();
    return;
  }

  removeExistingModal();
  document.body.appendChild(buildInstallModal(mode));
}

/** Contextual coach after repeat visits — iPad Safari only. */
export function maybeShowInstallCoach(): void {
  if (!isIPadSafariInstallable()) {
    return;
  }
  if (isCoachDismissed()) {
    return;
  }
  if (getVisitCount() < MIN_VISITS_BEFORE_COACH) {
    return;
  }
  showInstallInstructions();
}
