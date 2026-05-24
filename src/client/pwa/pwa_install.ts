// ============================================================================
// CHROMIUM INSTALL PROMPT (Vite only — not in playground export)
// ============================================================================

import { captureChromiumInstallPrompt } from '../utils/pwa_install_coach';

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

export function initChromiumInstallPrompt(): void {
  if (isPlaygroundRuntime()) {
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    captureChromiumInstallPrompt(event);
  });
}
