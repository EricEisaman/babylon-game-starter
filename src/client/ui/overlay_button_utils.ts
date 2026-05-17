// ============================================================================
// OVERLAY BUTTON UTILITIES (settings / inventory corner controls)
// ============================================================================

import { MOBILE_CONTROLS } from '../config/mobile_controls';
import { DeviceDetector } from '../utils/device_detector';

const DESKTOP_CORNER_INSET = 20;
const OVERLAY_BUTTON_SIZE = 50;
const ACTIVATION_DEBOUNCE_MS = 400;

export type OverlayCorner = 'bottom-left' | 'bottom-right';

export interface OverlayButtonStyleOptions {
  corner: OverlayCorner;
  zIndex: number;
}

export interface OverlayButtonLayout {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface OverlayToggleBinding {
  remove: () => void;
}

export interface OutsideCloseBinding {
  remove: () => void;
}

let outsideCloseMutedUntil = 0;

/** Ignore outside-close briefly after opening (avoids same-tap ghost close on mobile). */
export function muteOutsideClose(ms = 450): void {
  outsideCloseMutedUntil = Date.now() + ms;
}

export function shouldUseMobileOverlayLayout(): boolean {
  return DeviceDetector.isMobileDevice() || document.getElementById('mobile-joystick') != null;
}

export function getOverlayButtonLayout(corner: OverlayCorner): OverlayButtonLayout {
  const margin = DESKTOP_CORNER_INSET;

  if (shouldUseMobileOverlayLayout()) {
    if (corner === 'bottom-left') {
      return {
        bottom: MOBILE_CONTROLS.OVERLAY.SETTINGS.BOTTOM,
        left: MOBILE_CONTROLS.OVERLAY.SETTINGS.LEFT
      };
    }
    return {
      bottom: MOBILE_CONTROLS.OVERLAY.INVENTORY.BOTTOM,
      right: MOBILE_CONTROLS.OVERLAY.INVENTORY.RIGHT
    };
  }

  if (corner === 'bottom-left') {
    return { bottom: margin, left: margin };
  }
  return { bottom: margin, right: margin };
}

function layoutToCss(layout: OverlayButtonLayout): string {
  const parts: string[] = [];
  if (layout.top != null) {
    parts.push(`top: ${layout.top}px`);
  }
  if (layout.bottom != null) {
    parts.push(`bottom: ${layout.bottom}px`);
  }
  if (layout.left != null) {
    parts.push(`left: ${layout.left}px`);
  }
  if (layout.right != null) {
    parts.push(`right: ${layout.right}px`);
  }
  return parts.join('; ');
}

export function applyOverlayButtonBaseStyles(
  el: HTMLElement,
  options: OverlayButtonStyleOptions
): void {
  const layout = getOverlayButtonLayout(options.corner);
  const positionCss = layoutToCss(layout);
  const zIndex = shouldUseMobileOverlayLayout() ? MOBILE_CONTROLS.OVERLAY_Z_INDEX : options.zIndex;

  el.style.cssText = `
    position: fixed;
    ${positionCss};
    width: ${OVERLAY_BUTTON_SIZE}px;
    height: ${OVERLAY_BUTTON_SIZE}px;
    z-index: ${zIndex};
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    pointer-events: auto;
    border-radius: 50%;
    box-sizing: border-box;
    transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  `;
}

export function repositionOverlayButton(el: HTMLElement, corner: OverlayCorner): void {
  const layout = getOverlayButtonLayout(corner);
  el.style.top = '';
  el.style.bottom = layout.bottom != null ? `${layout.bottom}px` : '';
  el.style.left = layout.left != null ? `${layout.left}px` : '';
  el.style.right = layout.right != null ? `${layout.right}px` : '';
}

let settingsPanelOpen = false;
let inventoryPanelOpen = false;

/** Hide corner trigger so it does not cover controls. */
export function setOverlayTriggerVisible(el: HTMLElement | null, visible: boolean): void {
  if (!el) {
    return;
  }
  el.style.visibility = visible ? 'visible' : 'hidden';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}

function syncCornerOverlayTriggers(): void {
  const showTriggers = !settingsPanelOpen && !inventoryPanelOpen;
  const settings = document.getElementById('settings-button');
  const inventory = document.getElementById('inventory-button');
  setOverlayTriggerVisible(settings instanceof HTMLElement ? settings : null, showTriggers);
  setOverlayTriggerVisible(inventory instanceof HTMLElement ? inventory : null, showTriggers);
  if (showTriggers) {
    repositionAllOverlayButtons();
  }
}

export type OverlayPanelId = 'settings' | 'inventory';

const OVERLAY_PANEL_OPEN_EVENT = 'overlay-panel-open';

/** Settings / inventory listen and close themselves when the other opens. */
export function notifyOverlayPanelOpening(opened: OverlayPanelId): void {
  window.dispatchEvent(new CustomEvent(OVERLAY_PANEL_OPEN_EVENT, { detail: opened }));
}

export function onOtherOverlayPanelOpening(
  self: OverlayPanelId,
  closeSelf: () => void
): OverlayToggleBinding {
  const handler = (e: Event): void => {
    if (!(e instanceof CustomEvent)) {
      return;
    }
    const opened = e.detail;
    if (opened !== self) {
      closeSelf();
    }
  };
  window.addEventListener(OVERLAY_PANEL_OPEN_EVENT, handler);
  return {
    remove: () => {
      window.removeEventListener(OVERLAY_PANEL_OPEN_EVENT, handler);
    }
  };
}

/** Call when settings panel opens or closes. Hides both gear and backpack while any panel is open. */
export function setSettingsPanelOpen(open: boolean): void {
  settingsPanelOpen = open;
  syncCornerOverlayTriggers();
}

/** Call when inventory panel opens or closes. */
export function setInventoryPanelOpen(open: boolean): void {
  inventoryPanelOpen = open;
  syncCornerOverlayTriggers();
}

export function repositionAllOverlayButtons(): void {
  const settings = document.getElementById('settings-button');
  const inventory = document.getElementById('inventory-button');
  if (settings instanceof HTMLElement) {
    repositionOverlayButton(settings, 'bottom-left');
  }
  if (inventory instanceof HTMLElement) {
    repositionOverlayButton(inventory, 'bottom-right');
  }
}

const PRESS_BACKGROUND = 'rgba(0, 0, 0, 0.9)';
const PRESS_BORDER = 'rgba(255, 255, 255, 0.6)';
const DEFAULT_BACKGROUND = 'rgba(0, 0, 0, 0.7)';
const DEFAULT_BORDER = 'rgba(255, 255, 255, 0.3)';

export function bindPreventTextSelection(el: HTMLElement): OverlayToggleBinding {
  const preventSelection = (e: Event): void => {
    e.preventDefault();
  };

  el.addEventListener('selectstart', preventSelection);

  return {
    remove: () => {
      el.removeEventListener('selectstart', preventSelection);
    }
  };
}

export function bindOverlayPressFeedback(el: HTMLElement): OverlayToggleBinding {
  const onPress = (): void => {
    el.style.background = PRESS_BACKGROUND;
    el.style.borderColor = PRESS_BORDER;
    el.style.transform = 'scale(1.05)';
  };

  const onRelease = (): void => {
    if (el.dataset.panelOpen === 'true') {
      el.style.background = PRESS_BACKGROUND;
      el.style.borderColor = PRESS_BORDER;
    } else {
      el.style.background = DEFAULT_BACKGROUND;
      el.style.borderColor = DEFAULT_BORDER;
    }
    el.style.transform = 'scale(1)';
  };

  el.addEventListener('pointerdown', onPress);
  el.addEventListener('pointerup', onRelease);
  el.addEventListener('pointercancel', onRelease);
  el.addEventListener('pointerleave', onRelease);

  return {
    remove: () => {
      el.removeEventListener('pointerdown', onPress);
      el.removeEventListener('pointerup', onRelease);
      el.removeEventListener('pointercancel', onRelease);
      el.removeEventListener('pointerleave', onRelease);
    }
  };
}

/**
 * Reliable tap/click activation for corner buttons (debounced touchend + click).
 */
export function bindOverlayToggle(el: HTMLElement, onToggle: () => void): OverlayToggleBinding {
  let lastActivation = 0;

  const activate = (e: Event): void => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastActivation < ACTIVATION_DEBOUNCE_MS) {
      return;
    }
    lastActivation = now;
    onToggle();
  };

  el.addEventListener('touchend', activate, { passive: false });
  el.addEventListener('click', activate);

  return {
    remove: () => {
      el.removeEventListener('touchend', activate);
      el.removeEventListener('click', activate);
    }
  };
}

/** After children handle events, stop bubbling so canvas / document handlers do not run. */
export function isolatePanelPointerEvents(panel: HTMLElement): OverlayToggleBinding {
  const stopBubble = (e: Event): void => {
    e.stopPropagation();
  };

  panel.addEventListener('click', stopBubble);
  panel.addEventListener('touchend', stopBubble);

  return {
    remove: () => {
      panel.removeEventListener('click', stopBubble);
      panel.removeEventListener('touchend', stopBubble);
    }
  };
}

export interface OutsideCloseOptions {
  panel: HTMLElement;
  trigger: HTMLElement;
  isOpen: () => boolean;
  onClose: () => void;
}

export function bindOutsideClose(options: OutsideCloseOptions): OutsideCloseBinding {
  const handleClickOutside = (e: MouseEvent): void => {
    if (Date.now() < outsideCloseMutedUntil) {
      return;
    }
    if (!options.isOpen()) {
      return;
    }

    const target = e.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (options.panel.contains(target) || options.trigger.contains(target)) {
      return;
    }

    options.onClose();
  };

  document.addEventListener('click', handleClickOutside);

  return {
    remove: () => {
      document.removeEventListener('click', handleClickOutside);
    }
  };
}
