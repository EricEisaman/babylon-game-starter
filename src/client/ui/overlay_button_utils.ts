// ============================================================================
// OVERLAY BUTTON UTILITIES (settings / inventory corner controls)
// ============================================================================

import { MOBILE_CONTROLS } from '../config/mobile_controls';
import { DeviceDetector } from '../utils/device_detector';

const DESKTOP_CORNER_BOTTOM = 20;
const OVERLAY_BUTTON_SIZE = 50;

export type OverlayCorner = 'bottom-left' | 'bottom-right';

export interface OverlayButtonStyleOptions {
  corner: OverlayCorner;
  zIndex: number;
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

/**
 * Bottom inset for corner overlay buttons: above mobile joystick / action buttons.
 */
export function getMobileCornerBottomInset(): number {
  if (!DeviceDetector.isMobileDevice()) {
    return DESKTOP_CORNER_BOTTOM;
  }

  const joystickBottom = MOBILE_CONTROLS.POSITIONS.JOYSTICK.BOTTOM;
  const joystickDiameter = MOBILE_CONTROLS.JOYSTICK_RADIUS * 2;
  const boostBottom = MOBILE_CONTROLS.POSITIONS.BOOST_BUTTON.BOTTOM;
  const boostSize = MOBILE_CONTROLS.BUTTON_SIZE;
  const controlStackHeight = Math.max(joystickBottom + joystickDiameter, boostBottom + boostSize);

  return controlStackHeight + DESKTOP_CORNER_BOTTOM;
}

/**
 * Applies shared fixed overlay button styles for reliable touch targets.
 */
export function applyOverlayButtonBaseStyles(
  el: HTMLElement,
  options: OverlayButtonStyleOptions
): void {
  const bottom = options.bottom ?? getMobileCornerBottomInset();
  const horizontal =
    options.corner === 'bottom-left'
      ? `left: ${options.left ?? DESKTOP_CORNER_BOTTOM}px;`
      : `right: ${options.right ?? DESKTOP_CORNER_BOTTOM}px;`;

  el.style.cssText = `
    position: fixed;
    bottom: ${bottom}px;
    ${horizontal}
    width: ${OVERLAY_BUTTON_SIZE}px;
    height: ${OVERLAY_BUTTON_SIZE}px;
    z-index: ${options.zIndex};
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
    transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  `;
}

const PRESS_BACKGROUND = 'rgba(0, 0, 0, 0.9)';
const PRESS_BORDER = 'rgba(255, 255, 255, 0.6)';
const DEFAULT_BACKGROUND = 'rgba(0, 0, 0, 0.7)';
const DEFAULT_BORDER = 'rgba(255, 255, 255, 0.3)';

/**
 * Blocks text/image selection and long-press callouts on overlay buttons.
 */
export function bindPreventTextSelection(el: HTMLElement): OverlayToggleBinding {
  const preventSelection = (e: Event): void => {
    e.preventDefault();
  };

  el.addEventListener('selectstart', preventSelection);
  el.addEventListener('dragstart', preventSelection);
  el.addEventListener('contextmenu', preventSelection);

  return {
    remove: () => {
      el.removeEventListener('selectstart', preventSelection);
      el.removeEventListener('dragstart', preventSelection);
      el.removeEventListener('contextmenu', preventSelection);
    }
  };
}

/**
 * Press feedback for overlay buttons (touch and mouse).
 */
export function bindOverlayPressFeedback(el: HTMLElement): OverlayToggleBinding {
  const onPress = (): void => {
    el.style.background = PRESS_BACKGROUND;
    el.style.borderColor = PRESS_BORDER;
    el.style.transform = 'scale(1.05)';
  };

  const onRelease = (): void => {
    el.style.background = DEFAULT_BACKGROUND;
    el.style.borderColor = DEFAULT_BORDER;
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
 * Toggle handler: pointerup primary, click fallback for keyboard activation.
 */
export function bindOverlayToggle(el: HTMLElement, onToggle: () => void): OverlayToggleBinding {
  let pointerTogglePending = false;

  const handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    pointerTogglePending = true;
    onToggle();
    window.setTimeout(() => {
      pointerTogglePending = false;
    }, 0);
  };

  const handleClick = (e: MouseEvent): void => {
    if (pointerTogglePending) {
      e.preventDefault();
      return;
    }
    onToggle();
  };

  el.addEventListener('pointerup', handlePointerUp);
  el.addEventListener('click', handleClick);

  return {
    remove: () => {
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('click', handleClick);
    }
  };
}

export interface OutsideCloseOptions {
  panel: HTMLElement;
  trigger: HTMLElement;
  isOpen: () => boolean;
  onClose: () => void;
}

/**
 * Close overlay when tapping outside panel and trigger (capture phase).
 */
export function bindOutsideClose(options: OutsideCloseOptions): OutsideCloseBinding {
  const handlePointerDown = (e: PointerEvent): void => {
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

  document.addEventListener('pointerdown', handlePointerDown, true);

  return {
    remove: () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    }
  };
}
