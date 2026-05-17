// ============================================================================
// MOBILE INPUT MANAGER
// ============================================================================

// /// <reference path="../types/babylon.d.ts" />

import { MOBILE_CONTROLS } from '../config/mobile_controls';
import { repositionAllOverlayButtons } from '../ui/overlay_button_utils';
// No imports needed

export class MobileInputManager {
  private static isInitialized = false;
  private static joystickContainer: HTMLDivElement | null = null;
  private static joystickStick: HTMLDivElement | null = null;
  private static joystickActive = false;
  private static joystickTouchId: number | null = null;

  private static jumpButton: HTMLDivElement | null = null;
  private static boostButton: HTMLDivElement | null = null;
  private static jumpActive = false;
  private static boostActive = false;
  private static jumpTouchId: number | null = null;
  private static boostTouchId: number | null = null;

  private static inputDirection = new BABYLON.Vector3(0, 0, 0);
  private static wantJump = false;
  private static wantBoost = false;

  private static preventDefaultIfCancelable(e: Event): void {
    if (e.cancelable) {
      e.preventDefault();
    }
  }

  /**
   * Initializes mobile touch controls
   * @param canvas The Babylon.js canvas element
   */
  public static initialize(canvas: HTMLCanvasElement): void {
    if (this.isInitialized) {
      return;
    }

    // Clean up any existing controls first
    this.cleanupExistingControls();

    // Ensure canvas takes full screen on mobile
    this.setupMobileCanvas(canvas);

    this.createJoystick(canvas);
    this.createActionButtons(canvas);
    this.setupTouchEventListeners();

    // Apply visibility settings from config
    this.applyVisibilitySettings();
    repositionAllOverlayButtons();

    this.isInitialized = true;
  }

  /**
   * Cleans up any existing mobile controls to prevent duplicates
   */
  private static cleanupExistingControls(): void {
    // Remove any existing joystick containers
    const existingJoysticks = document.querySelectorAll('#mobile-joystick');
    existingJoysticks.forEach((element) => {
      element.remove();
    });

    // Remove any existing jump buttons
    const existingJumpButtons = document.querySelectorAll('#mobile-jump-button');
    existingJumpButtons.forEach((element) => {
      element.remove();
    });

    // Remove any existing boost buttons
    const existingBoostButtons = document.querySelectorAll('#mobile-boost-button');
    existingBoostButtons.forEach((element) => {
      element.remove();
    });

    // Reset state
    this.joystickContainer = null;
    this.joystickStick = null;
    this.jumpButton = null;
    this.boostButton = null;
    this.joystickActive = false;
    this.jumpActive = false;
    this.boostActive = false;
    this.joystickTouchId = null;
    this.jumpTouchId = null;
    this.boostTouchId = null;
    this.inputDirection.set(0, 0, 0);
    this.wantJump = false;
    this.wantBoost = false;
  }

  /**
   * Sets up the canvas for full-screen or half-screen mobile display,
   * depending on whether "frame.html" is present in the URL.
   * @param canvas The canvas element
   */
  private static setupMobileCanvas(canvas: HTMLCanvasElement): void {
    const container = canvas.parentElement;
    if (!container) return;

    // Determine fullpage takeover based on URL
    const fullpage = window.location.href.includes('frame.html');

    if (!fullpage) {
      return;
    }
    // Apply width and height to canvas
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '1';

    // Apply same width/height/position to container
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.overflow = 'hidden';

    // Prevent body scrolling/overflow
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';

    // Force a canvas resize immediately
    window.dispatchEvent(new Event('resize'));

    // Listen for device orientation changes and resize accordingly
    this.setupOrientationHandler();
  }

  /**
   * Sets up orientation change handling for mobile
   */
  private static setupOrientationHandler(): void {
    const handleOrientationChange = () => {
      // Use requestAnimationFrame to ensure orientation change is complete
      requestAnimationFrame(() => {
        // Force canvas resize using window resize event
        window.dispatchEvent(new Event('resize'));
      });
    };

    // Listen for orientation changes
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);
  }

  /**
   * Creates the virtual joystick for movement
   * @param canvas The canvas element
   */
  private static createJoystick(canvas: HTMLCanvasElement): void {
    const container = canvas.parentElement;
    if (!container) return;

    // Create joystick container
    this.joystickContainer = document.createElement('div');
    this.joystickContainer.id = 'mobile-joystick';
    this.joystickContainer.style.cssText = `
            position: fixed;
            bottom: ${MOBILE_CONTROLS.POSITIONS.JOYSTICK.BOTTOM}px;
            left: ${MOBILE_CONTROLS.POSITIONS.JOYSTICK.LEFT}px;
            width: ${MOBILE_CONTROLS.JOYSTICK_RADIUS * 2}px;
            height: ${MOBILE_CONTROLS.JOYSTICK_RADIUS * 2}px;
            border-radius: 50%;
            background-color: ${MOBILE_CONTROLS.COLORS.JOYSTICK_BG};
            opacity: ${MOBILE_CONTROLS.OPACITY};
            border: 2px solid rgba(255, 255, 255, 0.3);
            z-index: ${MOBILE_CONTROLS.GAME_CONTROL_Z_INDEX};
            pointer-events: auto;
            user-select: none;
            touch-action: none;
        `;

    // Create joystick stick
    this.joystickStick = document.createElement('div');
    this.joystickStick.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background-color: ${MOBILE_CONTROLS.COLORS.JOYSTICK_STICK};
            transform: translate(-50%, -50%);
            pointer-events: none;
            transition: transform 0.1s ease;
        `;

    this.joystickContainer.appendChild(this.joystickStick);
    container.appendChild(this.joystickContainer);
  }

  /**
   * Creates action buttons (jump, boost)
   * @param canvas The canvas element
   */
  private static createActionButtons(canvas: HTMLCanvasElement): void {
    const container = canvas.parentElement;
    if (!container) return;

    // Create jump button
    this.jumpButton = document.createElement('div');
    this.jumpButton.id = 'mobile-jump-button';
    this.jumpButton.textContent = 'JUMP';
    this.jumpButton.style.cssText = `
            position: fixed;
            bottom: ${MOBILE_CONTROLS.POSITIONS.JUMP_BUTTON.BOTTOM}px;
            right: ${MOBILE_CONTROLS.POSITIONS.JUMP_BUTTON.RIGHT}px;
            width: ${MOBILE_CONTROLS.BUTTON_SIZE}px;
            height: ${MOBILE_CONTROLS.BUTTON_SIZE}px;
            border-radius: 50%;
            background-color: ${MOBILE_CONTROLS.COLORS.BUTTON_BG};
            color: ${MOBILE_CONTROLS.COLORS.BUTTON_TEXT};
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            opacity: ${MOBILE_CONTROLS.OPACITY};
            border: 2px solid rgba(255, 255, 255, 0.3);
            z-index: ${MOBILE_CONTROLS.GAME_CONTROL_Z_INDEX};
            pointer-events: auto;
            user-select: none;
            touch-action: none;
            transition: all 0.2s ease;
        `;

    // Create boost button
    this.boostButton = document.createElement('div');
    this.boostButton.id = 'mobile-boost-button';
    this.boostButton.textContent = 'BOOST';
    this.boostButton.style.cssText = `
            position: fixed;
            bottom: ${MOBILE_CONTROLS.POSITIONS.BOOST_BUTTON.BOTTOM}px;
            right: ${MOBILE_CONTROLS.POSITIONS.BOOST_BUTTON.RIGHT}px;
            width: ${MOBILE_CONTROLS.BUTTON_SIZE}px;
            height: ${MOBILE_CONTROLS.BUTTON_SIZE}px;
            border-radius: 50%;
            background-color: ${MOBILE_CONTROLS.COLORS.BUTTON_BG};
            color: ${MOBILE_CONTROLS.COLORS.BUTTON_TEXT};
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            opacity: ${MOBILE_CONTROLS.OPACITY};
            border: 2px solid rgba(255, 255, 255, 0.3);
            z-index: ${MOBILE_CONTROLS.GAME_CONTROL_Z_INDEX};
            pointer-events: auto;
            user-select: none;
            touch-action: none;
            transition: all 0.2s ease;
        `;

    container.appendChild(this.jumpButton);
    container.appendChild(this.boostButton);
  }

  /**
   * Sets up touch event listeners
   */
  private static setupTouchEventListeners(): void {
    // Joystick touch events
    if (this.joystickContainer) {
      this.joystickContainer.addEventListener(
        'touchstart',
        this.handleJoystickTouchStart.bind(this),
        { passive: false }
      );
      this.joystickContainer.addEventListener(
        'touchmove',
        this.handleJoystickTouchMove.bind(this),
        { passive: false }
      );
      this.joystickContainer.addEventListener('touchend', this.handleJoystickTouchEnd.bind(this), {
        passive: false
      });
      this.joystickContainer.addEventListener(
        'touchcancel',
        this.handleJoystickTouchEnd.bind(this),
        { passive: false }
      );
      this.joystickContainer.addEventListener(
        'pointerdown',
        this.handleJoystickTouchStart.bind(this),
        { passive: false }
      );
      this.joystickContainer.addEventListener(
        'pointermove',
        this.handleJoystickTouchMove.bind(this),
        { passive: false }
      );
      this.joystickContainer.addEventListener('pointerup', this.handleJoystickTouchEnd.bind(this), {
        passive: false
      });
      this.joystickContainer.addEventListener('mouseup', this.handleJoystickTouchEnd.bind(this), {
        passive: false
      });
    }

    // Button touch events
    if (this.jumpButton) {
      this.jumpButton.addEventListener('touchstart', this.handleJumpTouchStart.bind(this), {
        passive: false
      });
      this.jumpButton.addEventListener('touchend', this.handleJumpTouchEnd.bind(this), {
        passive: false
      });
      this.jumpButton.addEventListener('touchcancel', this.handleJumpTouchEnd.bind(this), {
        passive: false
      });
      this.jumpButton.addEventListener('pointerdown', this.handleJumpTouchStart.bind(this), {
        passive: false
      });
      this.jumpButton.addEventListener('pointerup', this.handleJumpTouchEnd.bind(this), {
        passive: false
      });
      this.jumpButton.addEventListener('mouseup', this.handleJumpTouchEnd.bind(this), {
        passive: false
      });
    }

    if (this.boostButton) {
      this.boostButton.addEventListener('touchstart', this.handleBoostTouchStart.bind(this), {
        passive: false
      });
      this.boostButton.addEventListener('touchend', this.handleBoostTouchEnd.bind(this), {
        passive: false
      });
      this.boostButton.addEventListener('touchcancel', this.handleBoostTouchEnd.bind(this), {
        passive: false
      });
      this.boostButton.addEventListener('pointerdown', this.handleBoostTouchStart.bind(this), {
        passive: false
      });
      this.boostButton.addEventListener('pointerup', this.handleBoostTouchEnd.bind(this), {
        passive: false
      });
      this.boostButton.addEventListener('mouseup', this.handleBoostTouchEnd.bind(this), {
        passive: false
      });
    }
  }

  private static touchIdFromEvent(e: TouchEvent | PointerEvent): number | null {
    if ('touches' in e && e.changedTouches.length > 0) {
      return e.changedTouches.item(0)?.identifier ?? null;
    }
    if ('pointerId' in e) {
      return e.pointerId;
    }
    return null;
  }

  private static touchEndedForId(
    e: TouchEvent | PointerEvent | MouseEvent,
    trackedId: number | null
  ): boolean {
    if (trackedId === null) {
      return false;
    }
    if ('changedTouches' in e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches.item(i)?.identifier === trackedId) {
          return true;
        }
      }
      return false;
    }
    if ('pointerId' in e) {
      return e.pointerId === trackedId;
    }
    return e.type === 'mouseup';
  }

  /**
   * Handles joystick touch/pointer start
   * @param e Touch or Pointer event
   */
  private static handleJoystickTouchStart(e: TouchEvent | PointerEvent): void {
    this.preventDefaultIfCancelable(e);
    if ('touches' in e && e.touches.length > 0) {
      const touch = e.touches.item(0);
      if (!touch) {
        return;
      }
      this.joystickActive = true;
      this.joystickTouchId = touch.identifier;
      this.updateJoystickPosition(touch);
    } else if ('pointerId' in e) {
      this.joystickActive = true;
      this.joystickTouchId = e.pointerId;
      this.updateJoystickPositionFromPointer(e);
    }
  }

  /**
   * Handles joystick touch/pointer move
   * @param e Touch or Pointer event
   */
  private static handleJoystickTouchMove(e: TouchEvent | PointerEvent): void {
    this.preventDefaultIfCancelable(e);
    if (!this.joystickActive) return;

    if ('touches' in e) {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches.item(i);
        if (touch?.identifier === this.joystickTouchId) {
          this.updateJoystickPosition(touch);
          break;
        }
      }
    } else if ('pointerId' in e && e.pointerId === this.joystickTouchId) {
      this.updateJoystickPositionFromPointer(e);
    }
  }

  /**
   * Handles joystick touch/pointer end
   * @param e Touch, Pointer, or Mouse event
   */
  private static handleJoystickTouchEnd(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (!this.touchEndedForId(e, this.joystickTouchId)) {
      return;
    }
    this.preventDefaultIfCancelable(e);
    this.joystickActive = false;
    this.joystickTouchId = null;
    this.resetJoystick();
    this.inputDirection.set(0, 0, 0);
  }

  /**
   * Updates joystick position and calculates input direction
   * @param touch Touch object
   */
  private static updateJoystickPosition(touch: Touch): void {
    if (!this.joystickStick || !this.joystickContainer) return;

    const rect = this.joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const deltaX = touchX - centerX;
    const deltaY = touchY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Apply deadzone
    if (distance < MOBILE_CONTROLS.JOYSTICK_DEADZONE) {
      this.resetJoystick();
      return;
    }

    // Clamp to joystick radius
    const maxDistance = MOBILE_CONTROLS.JOYSTICK_RADIUS - 15; // Leave space for stick
    const clampedDistance = Math.min(distance, maxDistance);

    // Calculate normalized direction
    const normalizedX = deltaX / distance;
    const normalizedY = deltaY / distance;

    // Update stick position - use percentage-based positioning
    const stickX = normalizedX * clampedDistance;
    const stickY = normalizedY * clampedDistance;

    this.joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

    // Update input direction (invert Y for forward/backward)
    this.inputDirection.x = normalizedX;
    this.inputDirection.z = -normalizedY;
  }

  /**
   * Updates joystick position based on pointer event
   * @param e Pointer event
   */
  private static updateJoystickPositionFromPointer(e: PointerEvent): void {
    if (!this.joystickStick || !this.joystickContainer) return;

    const rect = this.joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;

    const deltaX = touchX - centerX;
    const deltaY = touchY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Apply deadzone
    if (distance < MOBILE_CONTROLS.JOYSTICK_DEADZONE) {
      this.resetJoystick();
      return;
    }

    // Clamp to joystick radius
    const maxDistance = MOBILE_CONTROLS.JOYSTICK_RADIUS - 15; // Leave space for stick
    const clampedDistance = Math.min(distance, maxDistance);

    // Calculate normalized direction
    const normalizedX = deltaX / distance;
    const normalizedY = deltaY / distance;

    // Update stick position - use percentage-based positioning
    const stickX = normalizedX * clampedDistance;
    const stickY = normalizedY * clampedDistance;

    this.joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

    // Update input direction (invert Y for forward/backward)
    this.inputDirection.x = normalizedX;
    this.inputDirection.z = -normalizedY;
  }

  /**
   * Resets joystick to center position
   */
  private static resetJoystick(): void {
    if (this.joystickStick) {
      this.joystickStick.style.transform = 'translate(-50%, -50%)';
    }
    this.inputDirection.set(0, 0, 0);
  }

  /**
   * Handles jump button touch/pointer start
   * @param e Touch or Pointer event
   */
  private static handleJumpTouchStart(e: TouchEvent | PointerEvent): void {
    this.preventDefaultIfCancelable(e);
    const touchId = this.touchIdFromEvent(e);
    if (this.jumpActive && this.jumpTouchId !== null && touchId !== this.jumpTouchId) {
      return;
    }
    this.jumpActive = true;
    this.jumpTouchId = touchId;
    this.wantJump = true;

    if (this.jumpButton) {
      this.jumpButton.style.backgroundColor = MOBILE_CONTROLS.COLORS.BUTTON_ACTIVE;
    }
  }

  /**
   * Handles jump button touch/pointer end
   * @param e Touch, Pointer, or Mouse event
   */
  private static handleJumpTouchEnd(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (!this.touchEndedForId(e, this.jumpTouchId)) {
      return;
    }
    this.preventDefaultIfCancelable(e);
    this.jumpActive = false;
    this.jumpTouchId = null;
    this.wantJump = false;
    if (this.jumpButton) {
      this.jumpButton.style.backgroundColor = MOBILE_CONTROLS.COLORS.BUTTON_BG;
    }
  }

  /**
   * Handles boost button touch/pointer start
   * @param e Touch or Pointer event
   */
  private static handleBoostTouchStart(e: TouchEvent | PointerEvent): void {
    this.preventDefaultIfCancelable(e);
    const touchId = this.touchIdFromEvent(e);
    if (this.boostActive && this.boostTouchId !== null && touchId !== this.boostTouchId) {
      return;
    }
    this.boostActive = true;
    this.boostTouchId = touchId;
    this.wantBoost = true;

    if (this.boostButton) {
      this.boostButton.style.backgroundColor = MOBILE_CONTROLS.COLORS.BUTTON_ACTIVE;
    }
  }

  /**
   * Handles boost button touch/pointer end
   * @param e Touch, Pointer, or Mouse event
   */
  private static handleBoostTouchEnd(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (!this.touchEndedForId(e, this.boostTouchId)) {
      return;
    }
    this.preventDefaultIfCancelable(e);
    this.boostActive = false;
    this.boostTouchId = null;
    this.wantBoost = false;
    if (this.boostButton) {
      this.boostButton.style.backgroundColor = MOBILE_CONTROLS.COLORS.BUTTON_BG;
    }
  }

  /**
   * Gets the current input direction from mobile controls
   * @returns Input direction vector
   */
  public static getInputDirection(): BABYLON.Vector3 {
    return this.inputDirection.clone();
  }

  /**
   * Gets whether jump is requested from mobile controls
   * @returns True if jump is requested
   */
  public static getWantJump(): boolean {
    return this.wantJump;
  }

  /**
   * Gets whether boost is requested from mobile controls
   * @returns True if boost is requested
   */
  public static getWantBoost(): boolean {
    return this.wantBoost;
  }

  /**
   * Checks if mobile controls are active
   * @returns True if mobile controls are being used
   */
  public static isMobileActive(): boolean {
    return this.joystickActive || this.jumpActive || this.boostActive;
  }

  /**
   * Shows or hides mobile controls
   * @param visible Whether to show the controls
   */
  public static setVisibility(visible: boolean): void {
    if (this.joystickContainer) {
      this.joystickContainer.style.display = visible ? 'block' : 'none';
    }
    if (this.jumpButton) {
      this.jumpButton.style.display = visible ? 'flex' : 'none';
    }
    if (this.boostButton) {
      this.boostButton.style.display = visible ? 'flex' : 'none';
    }
  }

  /**
   * Updates the position of mobile controls
   * @param controlType The type of control ('joystick', 'jump', 'boost')
   * @param position The new position object with top/bottom/left/right properties
   */
  public static updateControlPosition(
    controlType: 'joystick' | 'jump' | 'boost',
    position: { top?: number; bottom?: number; left?: number; right?: number }
  ): void {
    let element: HTMLDivElement | null = null;

    switch (controlType) {
      case 'joystick':
        element = this.joystickContainer;
        break;
      case 'jump':
        element = this.jumpButton;
        break;
      case 'boost':
        element = this.boostButton;
        break;
    }

    if (element) {
      if (position.top !== undefined) {
        element.style.top = `${position.top}px`;
      }
      if (position.bottom !== undefined) {
        element.style.bottom = `${position.bottom}px`;
      }
      if (position.left !== undefined) {
        element.style.left = `${position.left}px`;
      }
      if (position.right !== undefined) {
        element.style.right = `${position.right}px`;
      }
    }
  }

  /**
   * Updates the visibility of individual controls
   * @param controlType The type of control ('joystick', 'jump', 'boost')
   * @param visible Whether to show the control
   */
  public static setControlVisibility(
    controlType: 'joystick' | 'jump' | 'boost',
    visible: boolean
  ): void {
    let element: HTMLDivElement | null = null;

    switch (controlType) {
      case 'joystick':
        element = this.joystickContainer;
        break;
      case 'jump':
        element = this.jumpButton;
        break;
      case 'boost':
        element = this.boostButton;
        break;
    }

    if (element) {
      element.style.display = visible ? (controlType === 'joystick' ? 'block' : 'flex') : 'none';
    }
  }

  /**
   * Applies visibility settings from the config
   */
  private static applyVisibilitySettings(): void {
    this.setControlVisibility('joystick', MOBILE_CONTROLS.VISIBILITY.SHOW_JOYSTICK);
    this.setControlVisibility('jump', MOBILE_CONTROLS.VISIBILITY.SHOW_JUMP_BUTTON);
    this.setControlVisibility('boost', MOBILE_CONTROLS.VISIBILITY.SHOW_BOOST_BUTTON);
  }

  /**
   * Disposes mobile input manager
   */
  public static dispose(): void {
    // Clean up all existing controls
    this.cleanupExistingControls();

    // Reset initialization flag
    this.isInitialized = false;
  }
}
