// ============================================================================
// CHARACTER CONTROLLER
// ============================================================================

// /// <reference path="../types/babylon.d.ts" />

import { CHARACTER_STATES } from '../config/character_states';
import { CONFIG } from '../config/game_config';
import { INPUT_KEYS } from '../config/input_keys';
import { MobileInputManager } from '../input/mobile_input_manager';
import { DeviceDetector } from '../utils/device_detector';

import { AnimationController } from './animation_controller';

import type { SmoothFollowCameraController } from './smooth_follow_camera_controller';
import type { CharacterState } from '../config/character_states';
import type { ManagedAudioSound } from '../types/audio';
import type { Character } from '../types/character';

export class CharacterController {
  private readonly scene: BABYLON.Scene;
  private readonly characterController: BABYLON.PhysicsCharacterController;
  private displayCapsule: BABYLON.AbstractMesh;
  private playerMesh: BABYLON.AbstractMesh;

  private state: CharacterState = CHARACTER_STATES.IN_AIR;
  private wantJump = false;
  private inputDirection = new BABYLON.Vector3(0, 0, 0);
  /** Reused for zeroing physics velocity without per-call allocations. */
  private readonly zeroLinearVelocity = new BABYLON.Vector3(0, 0, 0);
  private targetRotationY = 0;
  private keysDown = new Set<string>();
  private cameraController: SmoothFollowCameraController | null = null;
  private boostActive = false;
  private superJumpActive = false;
  private invisibilityActive = false;
  /** Wall-clock end of timed super-jump effect (ms); 0 when unused */
  private superJumpEndsAtMs = 0;
  /** Wall-clock end of timed invisibility effect (ms); 0 when unused */
  private invisibilityEndsAtMs = 0;
  private playerParticleSystem: BABYLON.IParticleSystem | null = null;
  private thrusterSound: ManagedAudioSound | null = null;
  public animationController: AnimationController;

  // Mobile device detection - computed once at initialization
  private readonly isMobileDevice: boolean;
  private readonly isIPadWithKeyboard: boolean;
  private physicsPaused = false;
  private currentCharacter: Character | null = null;
  private lastAppliedInvisibility: boolean | null = null;
  private customAnimationHandlers = new Map<string, { name: string; loop: boolean }>(); // Map: key → custom animation config
  private activeLoopingCustomAnimationKey: string | null = null;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;

    // Enhanced device detection
    this.isMobileDevice = DeviceDetector.isMobileDevice();
    this.isIPadWithKeyboard = DeviceDetector.isIPadWithKeyboard();

    // Create character physics controller with default position (will be updated when character is loaded)
    this.characterController = new BABYLON.PhysicsCharacterController(
      new BABYLON.Vector3(0, 0, 0), // Default position, will be updated
      {
        capsuleHeight: 1.8, // Default height, will be updated when character is loaded
        capsuleRadius: 0.6 // Default radius, will be updated when character is loaded
      },
      scene
    );

    // Create display capsule for debug
    this.displayCapsule = BABYLON.MeshBuilder.CreateCapsule(
      'CharacterDisplay',
      {
        height: 1.8, // Default height, will be updated when character is loaded
        radius: 0.6 // Default radius, will be updated when character is loaded
      },
      scene
    );
    this.displayCapsule.isVisible = CONFIG.DEBUG.CAPSULE_VISIBLE;
    this.displayCapsule.setEnabled(false); // Disable immediately to prevent visibility on load

    // Initialize player mesh (will be replaced by loaded model)
    this.playerMesh = this.displayCapsule;

    // Initialize animation controller
    this.animationController = new AnimationController(scene);

    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    this.scene.onKeyboardObservable.add(this.handleKeyboard);
    this.scene.onBeforeRenderObservable.add(this.updateCharacter);
    this.scene.onAfterPhysicsObservable.add(this.updatePhysics);

    // Initialize mobile controls if on mobile device
    if (this.isMobileDevice) {
      const canvas = this.scene.getEngine().getRenderingCanvas();
      if (canvas) {
        MobileInputManager.initialize(canvas);
      }
    }
  }

  /**
   * Checks whether a custom animation entry has the expected runtime fields.
   */
  private isCustomAnimationConfig(value: object): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      Reflect.has(value, 'name') &&
      Reflect.has(value, 'key') &&
      Reflect.has(value, 'loop') &&
      typeof Reflect.get(value, 'name') === 'string' &&
      typeof Reflect.get(value, 'key') === 'string' &&
      typeof Reflect.get(value, 'loop') === 'boolean'
    );
  }

  /**
   * Sets up key-triggered handlers for custom animations defined in the current character
   * Only custom animations (object format) are configured here.
   * Called when a character is fully loaded.
   */
  private setupCustomAnimationHandlers(): void {
    // Clear any previous handlers
    this.customAnimationHandlers.clear();

    if (!this.currentCharacter) return;

    const { animations } = this.currentCharacter;

    // Iterate through animation entries
    for (const [animKey, animValue] of Object.entries(animations)) {
      // Skip standard animations (idle, walk, jump)
      if (animKey === 'idle' || animKey === 'walk' || animKey === 'jump') {
        continue;
      }

      if (typeof animValue !== 'object' || animValue === null) {
        continue;
      }

      // Check if this is a custom animation config
      if (!this.isCustomAnimationConfig(animValue)) {
        continue;
      }

      const triggerKeyValue = Reflect.get(animValue, 'key');
      const animationNameValue = Reflect.get(animValue, 'name');
      const loopValue = Reflect.get(animValue, 'loop');

      if (
        typeof triggerKeyValue !== 'string' ||
        typeof animationNameValue !== 'string' ||
        typeof loopValue !== 'boolean'
      ) {
        continue;
      }

      const triggerKey = triggerKeyValue.toLowerCase();
      const animationName = animationNameValue;
      const loop = loopValue;

      // Map key → custom animation config for quick lookup in handleKeyDown
      this.customAnimationHandlers.set(triggerKey, { name: animationName, loop });
    }
  }

  private handleKeyboard = (kbInfo: BABYLON.KeyboardInfo): void => {
    const key = kbInfo.event.key.toLowerCase();

    switch (kbInfo.type) {
      case BABYLON.KeyboardEventTypes.KEYDOWN:
        // Ignore OS key-repeat events for held keys
        if (this.keysDown.has(key)) {
          return;
        }
        this.keysDown.add(key);
        this.handleKeyDown(key);
        break;

      case BABYLON.KeyboardEventTypes.KEYUP:
        this.keysDown.delete(key);
        this.handleKeyUp(key);
        break;
    }
  };

  // Key match helpers for INPUT_KEYS
  private isForwardKey = (k: string): boolean => {
    return INPUT_KEYS.FORWARD.some((key) => key === k);
  };

  private isBackwardKey = (k: string): boolean => {
    return INPUT_KEYS.BACKWARD.some((key) => key === k);
  };

  private isStrafeLeftKey = (k: string): boolean => {
    return INPUT_KEYS.STRAFE_LEFT.some((key) => key === k);
  };

  private isStrafeRightKey = (k: string): boolean => {
    return INPUT_KEYS.STRAFE_RIGHT.some((key) => key === k);
  };

  private isJumpKey = (k: string): boolean => {
    return INPUT_KEYS.JUMP.some((key) => key === k);
  };

  private isBoostKey = (k: string): boolean => {
    return INPUT_KEYS.BOOST.some((key) => key === k);
  };

  private isDebugKey = (k: string): boolean => {
    return INPUT_KEYS.DEBUG.some((key) => key === k);
  };

  private isHUDToggleKey = (k: string): boolean => {
    return INPUT_KEYS.HUD_TOGGLE.some((key) => key === k);
  };

  private isHUDPositionKey = (k: string): boolean => {
    return INPUT_KEYS.HUD_POSITION.some((key) => key === k);
  };

  private isResetCameraKey = (k: string): boolean => {
    return INPUT_KEYS.RESET_CAMERA.some((key) => key === k);
  };

  private isLeftKey = (k: string): boolean => {
    return INPUT_KEYS.LEFT.some((key) => key === k);
  };

  private isRightKey = (k: string): boolean => {
    return INPUT_KEYS.RIGHT.some((key) => key === k);
  };

  private handleKeyDown(key: string): void {
    // Check for custom animation trigger first - takes priority
    const customAnimation = this.customAnimationHandlers.get(key);
    if (customAnimation) {
      // Trigger the custom animation with configured loop behavior
      this.animationController.playAnimation(customAnimation.name, customAnimation.loop);

      // Keep looped custom animations active while the key is held.
      if (customAnimation.loop) {
        this.activeLoopingCustomAnimationKey = key;
      }

      return; // Don't process other keybinds for this key
    }

    // Movement input
    if (this.isForwardKey(key)) {
      this.inputDirection.z = 1;
    } else if (this.isBackwardKey(key)) {
      this.inputDirection.z = -1;
    } else if (this.isStrafeLeftKey(key)) {
      this.inputDirection.x = -1;
    } else if (this.isStrafeRightKey(key)) {
      this.inputDirection.x = 1;
    } else if (this.isJumpKey(key)) {
      this.wantJump = true;
    } else if (this.isBoostKey(key)) {
      this.boostActive = true;
      this.updateParticleSystem();
    } else if (this.isDebugKey(key)) {
      this.toggleDebugDisplay();
    } else if (this.isHUDToggleKey(key)) {
      this.toggleHUD();
    } else if (this.isHUDPositionKey(key)) {
      this.cycleHUDPosition();
    } else if (this.isResetCameraKey(key)) {
      this.resetCameraToDefaultOffset();
    }

    // Only update mobile input for iPads with keyboards, not for regular keyboard input
    if (this.isIPadWithKeyboard) {
      this.updateMobileInput();
    }
  }

  private handleKeyUp(key: string): void {
    // Release held-loop lock for custom animations when key is released.
    if (this.activeLoopingCustomAnimationKey === key) {
      this.activeLoopingCustomAnimationKey = null;
    }

    // Reset movement input
    if (this.isForwardKey(key) || this.isBackwardKey(key)) {
      this.inputDirection.z = 0;
    }
    if (this.isLeftKey(key) || this.isRightKey(key)) {
      this.inputDirection.x = 0;
    }
    if (this.isStrafeLeftKey(key) || this.isStrafeRightKey(key)) {
      this.inputDirection.x = 0;
    }
    if (this.isJumpKey(key)) {
      this.wantJump = false;
    }
    if (this.isBoostKey(key)) {
      this.boostActive = false;
      this.updateParticleSystem();
    }

    // Only update mobile input for iPads with keyboards, not for regular keyboard input
    if (this.isIPadWithKeyboard) {
      this.updateMobileInput();
    }
  }

  private updateMobileInput(): void {
    // Only update mobile input if this is a mobile device
    if (!this.isMobileDevice) {
      return;
    }

    const mobileDirection = MobileInputManager.getInputDirection();
    if (this.isIPadWithKeyboard) {
      this.applyIPadMobileInput(mobileDirection);
    } else {
      this.applyStandardMobileInput(mobileDirection);
    }

    // Always update particle system to ensure proper on/off state
    this.updateParticleSystem();
  }

  private applyMobileRotation(mobileDirection: BABYLON.Vector3): void {
    if (this.state !== CHARACTER_STATES.IN_AIR && Math.abs(mobileDirection.x) > 0.1) {
      const rotationSpeed = this.currentCharacter?.rotationSpeed ?? 0.05;
      this.targetRotationY += mobileDirection.x * rotationSpeed;
    }
  }

  private hasKeyboardForwardMovement(): boolean {
    return (
      this.keysDown.has('w') ||
      this.keysDown.has('s') ||
      this.keysDown.has('arrowup') ||
      this.keysDown.has('arrowdown')
    );
  }

  private applyIPadMobileInput(mobileDirection: BABYLON.Vector3): void {
    // For iPads with keyboards, allow both keyboard and touch input to work together.
    this.applyMobileRotation(mobileDirection);

    // For movement (Z-axis), use keyboard if available, otherwise use touch.
    if (!this.hasKeyboardForwardMovement()) {
      this.inputDirection.z = Math.abs(mobileDirection.z) > 0.1 ? mobileDirection.z : 0;
    }

    // Use keyboard input if available, otherwise use touch input.
    if (!this.keysDown.has(' ')) {
      this.wantJump = MobileInputManager.getWantJump();
    }
    if (!this.keysDown.has('shift')) {
      this.boostActive = MobileInputManager.getWantBoost();
    }
  }

  private applyStandardMobileInput(mobileDirection: BABYLON.Vector3): void {
    // Standard mobile behavior - replace keyboard input with touch input.
    this.inputDirection.copyFrom(mobileDirection);
    this.applyMobileRotation(mobileDirection);

    // Set forward/backward movement based on Y-axis and reserve X for rotation.
    this.inputDirection.z = Math.abs(mobileDirection.z) > 0.1 ? mobileDirection.z : 0;
    this.inputDirection.x = 0;

    // On touch-capable devices with a physical keyboard, preserve keyboard actions.
    const keyboardJumpPressed = INPUT_KEYS.JUMP.some((key) => this.keysDown.has(key));
    const keyboardBoostPressed = INPUT_KEYS.BOOST.some((key) => this.keysDown.has(key));

    if (!keyboardJumpPressed) {
      this.wantJump = MobileInputManager.getWantJump();
    }
    if (!keyboardBoostPressed) {
      this.boostActive = MobileInputManager.getWantBoost();
    }
  }

  private toggleDebugDisplay(): void {
    this.displayCapsule.isVisible = !this.displayCapsule.isVisible;
  }

  private toggleHUD(): void {
    // This would need to be connected to HUDManager
  }

  private cycleHUDPosition(): void {
    // This would need to be connected to HUDManager
  }

  /** Same behavior as the reset-camera key (e.g. `1`): default follow offset + smooth follow reactivated. */
  public resetCameraToDefaultOffset(): void {
    if (this.cameraController) {
      this.cameraController.resetCameraToDefaultOffset();
    }
  }

  private updateParticleSystem(): void {
    if (this.playerParticleSystem) {
      if (this.boostActive) {
        this.playerParticleSystem.start();
      } else {
        this.playerParticleSystem.stop();
      }
    }

    // Update thruster sound
    if (this.thrusterSound) {
      if (this.boostActive) {
        if (!this.thrusterSound.isActive()) {
          this.thrusterSound.play();
        }
      } else {
        if (this.thrusterSound.isActive()) {
          this.thrusterSound.stop();
        }
      }
    }
  }

  private updateCharacter = (): void => {
    // Update mobile input every frame
    this.updateMobileInput();

    this.expireTimedBoostEffects();

    // Retry boost sound start while boost is held, in case the file finished loading
    // after the initial key/touch event attempted playback.
    if (this.boostActive) {
      this.updateParticleSystem();
    }

    // Apply invisibility effect if active
    this.updateInvisibilityEffect();

    this.updateRotation();
    this.updatePosition();
    this.updateAnimations();
  };

  private updateRotation(): void {
    // If camera is controlling rotation, don't interfere
    if (this.cameraController?.isRotatingCharacter === true) {
      // Update target rotation to match current rotation to prevent jerking
      this.targetRotationY = this.displayCapsule.rotation.y;
      return;
    }

    // Prevent rotation while in air for more realistic physics
    if (this.state === CHARACTER_STATES.IN_AIR) {
      return;
    }

    // Handle rotation based on input using active character's properties
    const rotationSpeed = this.currentCharacter?.rotationSpeed ?? 0.05;
    const rotationSmoothing = this.currentCharacter?.rotationSmoothing ?? 0.2;

    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
      this.targetRotationY -= rotationSpeed;
    }
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) {
      this.targetRotationY += rotationSpeed;
    }

    this.displayCapsule.rotation.y +=
      (this.targetRotationY - this.displayCapsule.rotation.y) * rotationSmoothing;
  }

  private updatePosition(): void {
    // Update display capsule position
    this.displayCapsule.position.copyFrom(this.characterController.getPosition());

    // Update player mesh position
    if (this.playerMesh) {
      this.playerMesh.position.copyFrom(this.characterController.getPosition());
      this.playerMesh.position.y += CONFIG.ANIMATION.PLAYER_Y_OFFSET;

      // Update player mesh rotation
      if (this.displayCapsule.rotationQuaternion) {
        this.playerMesh.rotationQuaternion ??= new BABYLON.Quaternion(0, 0, 0, 1);
        this.playerMesh.rotationQuaternion.copyFrom(this.displayCapsule.rotationQuaternion);
      } else {
        this.playerMesh.rotationQuaternion = null;
        this.playerMesh.rotation.copyFrom(this.displayCapsule.rotation);
      }
    }
  }

  private updateAnimations(): void {
    // While a looped custom animation key is held, suppress locomotion animation overrides.
    if (
      this.activeLoopingCustomAnimationKey !== null &&
      this.keysDown.has(this.activeLoopingCustomAnimationKey)
    ) {
      return;
    }

    const isMoving = this.isAnyMovementKeyPressed();

    // Update animation controller with character state
    this.animationController.updateAnimation(isMoving, this.state);

    // Update blend weights if currently blending
    this.animationController.updateBlend();

    // Check for walk activation to trigger character rotation
    if (isMoving && this.cameraController) {
      this.cameraController.checkForWalkActivation();
    }
  }

  private isAnyMovementKeyPressed(): boolean {
    // Check keyboard input
    const keyboardMoving =
      INPUT_KEYS.FORWARD.some((key) => this.keysDown.has(key)) ||
      INPUT_KEYS.BACKWARD.some((key) => this.keysDown.has(key)) ||
      INPUT_KEYS.LEFT.some((key) => this.keysDown.has(key)) ||
      INPUT_KEYS.RIGHT.some((key) => this.keysDown.has(key)) ||
      INPUT_KEYS.STRAFE_LEFT.some((key) => this.keysDown.has(key)) ||
      INPUT_KEYS.STRAFE_RIGHT.some((key) => this.keysDown.has(key));

    // Check mobile input
    if (this.isMobileDevice) {
      const mobileMoving =
        MobileInputManager.isMobileActive() &&
        MobileInputManager.getInputDirection().length() > 0.1;

      // For iPads with keyboards, either input can trigger movement
      if (this.isIPadWithKeyboard) {
        return keyboardMoving || mobileMoving;
      } else {
        // For pure mobile, only mobile input matters
        return mobileMoving;
      }
    }

    return keyboardMoving;
  }

  private updatePhysics = (): void => {
    if (!this.scene.deltaTime) return;

    const deltaTime = this.scene.deltaTime / 1000.0;
    if (deltaTime === 0) return;

    // Skip physics updates if paused
    if (this.physicsPaused) return;

    const down = BABYLON.Vector3.Down();
    const support = this.characterController.checkSupport(deltaTime, down);

    const characterOrientation = BABYLON.Quaternion.FromEulerAngles(
      0,
      this.displayCapsule.rotation.y,
      0
    );
    const desiredVelocity = this.calculateDesiredVelocity(deltaTime, support, characterOrientation);

    this.characterController.setVelocity(desiredVelocity);
    this.characterController.integrate(deltaTime, support, CONFIG.PHYSICS.CHARACTER_GRAVITY);
  };

  private calculateDesiredVelocity(
    deltaTime: number,
    supportInfo: BABYLON.CharacterSurfaceInfo,
    characterOrientation: BABYLON.Quaternion
  ): BABYLON.Vector3 {
    const nextState = this.getNextState(supportInfo);
    if (nextState !== this.state) {
      this.state = nextState;
    }

    const upWorld = CONFIG.PHYSICS.CHARACTER_GRAVITY.normalizeToNew();
    upWorld.scaleInPlace(-1.0);

    const forwardLocalSpace = BABYLON.Vector3.Forward();
    const forwardWorld = forwardLocalSpace.applyRotationQuaternion(characterOrientation);
    const currentVelocity = this.characterController.getVelocity();

    switch (this.state) {
      case CHARACTER_STATES.IN_AIR:
        return this.calculateAirVelocity(
          deltaTime,
          forwardWorld,
          upWorld,
          currentVelocity,
          characterOrientation
        );

      case CHARACTER_STATES.ON_GROUND:
        return this.calculateGroundVelocity(
          deltaTime,
          forwardWorld,
          upWorld,
          currentVelocity,
          supportInfo,
          characterOrientation
        );

      case CHARACTER_STATES.START_JUMP:
        return this.calculateJumpVelocity(currentVelocity, upWorld);

      default:
        return BABYLON.Vector3.Zero();
    }
  }

  private calculateAirVelocity(
    deltaTime: number,
    forwardWorld: BABYLON.Vector3,
    upWorld: BABYLON.Vector3,
    currentVelocity: BABYLON.Vector3,
    characterOrientation: BABYLON.Quaternion
  ): BABYLON.Vector3 {
    // Get character-specific physics attributes
    const character = this.currentCharacter;
    if (!character) {
      return currentVelocity;
    }

    const characterMass = character.mass;
    let outputVelocity = currentVelocity.clone();

    // If boost is active, allow input-based velocity modification while in air
    if (this.boostActive) {
      // Character-specific air speed using active character's properties
      const baseSpeed = character.speed.inAir * character.speed.boostMultiplier;
      const massAdjustedSpeed = baseSpeed / Math.sqrt(characterMass); // Additional mass adjustment for realistic physics
      const desiredVelocity = this.inputDirection
        .scale(massAdjustedSpeed)
        .applyRotationQuaternion(characterOrientation);
      outputVelocity = this.characterController.calculateMovement(
        deltaTime,
        forwardWorld,
        upWorld,
        currentVelocity,
        BABYLON.Vector3.Zero(),
        desiredVelocity,
        upWorld
      );
    } else {
      // Maintain initial jump velocity while in air - no input-based velocity modification
      // Only apply gravity and minimal air resistance to preserve realistic physics
    }

    // Minimal air resistance - consistent for all characters regardless of mass
    // Air resistance should be minimal to allow all characters to move normally in air
    // Mass doesn't significantly affect air resistance in this physics model
    const airResistance = 0.98; // Minimal air resistance (loses 2% of velocity per frame)
    outputVelocity.scaleInPlace(airResistance);

    // Preserve vertical velocity component from jump
    outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
    outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));

    // Apply gravity
    outputVelocity.addInPlace(CONFIG.PHYSICS.CHARACTER_GRAVITY.scale(deltaTime));

    return outputVelocity;
  }

  private calculateGroundVelocity(
    deltaTime: number,
    forwardWorld: BABYLON.Vector3,
    upWorld: BABYLON.Vector3,
    currentVelocity: BABYLON.Vector3,
    supportInfo: BABYLON.CharacterSurfaceInfo,
    characterOrientation: BABYLON.Quaternion
  ): BABYLON.Vector3 {
    // Get character-specific physics attributes
    const character = this.currentCharacter;
    if (!character) {
      return currentVelocity;
    }

    const characterMass = character.mass;

    // Character-specific speed calculations using active character's properties
    const baseSpeed = this.boostActive
      ? character.speed.onGround * character.speed.boostMultiplier
      : character.speed.onGround;
    const massAdjustedSpeed = baseSpeed / Math.sqrt(characterMass); // Additional mass adjustment for realistic physics

    const desiredVelocity = this.inputDirection
      .scale(massAdjustedSpeed)
      .applyRotationQuaternion(characterOrientation);
    const outputVelocity = this.characterController.calculateMovement(
      deltaTime,
      forwardWorld,
      supportInfo.averageSurfaceNormal,
      currentVelocity,
      supportInfo.averageSurfaceVelocity,
      desiredVelocity,
      upWorld
    );

    outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);

    // Character-specific friction (INVERTED LOGIC: friction = velocity loss per frame)
    // Use explicit friction if provided, otherwise use improved mass-adjusted formula
    let friction: number;
    if (character.friction !== undefined) {
      friction = character.friction;
    } else {
      // Improved mass-adjusted formula that caps friction at 0.99 and scales better
      const baseFriction = 0.95;
      friction = Math.min(baseFriction + (characterMass - 1.0) * 0.01, 0.99);
    }

    // Apply mass-based friction multiplier
    const effectiveFriction = Math.min(friction * (1.0 + (characterMass - 1.0) * 0.1), 0.99);

    // Apply friction based on input state
    const hasInput = this.inputDirection.length() >= 0.1;
    if (hasInput) {
      // With input: apply reduced friction (10% of friction value) to allow movement
      const movementFriction = effectiveFriction * 0.1;
      const velocityRetention = 1.0 - movementFriction;
      outputVelocity.scaleInPlace(velocityRetention);
    } else {
      // No input: apply full friction for strong stopping
      const velocityRetention = 1.0 - effectiveFriction;
      outputVelocity.scaleInPlace(velocityRetention);
    }

    const maxSpeed = massAdjustedSpeed * 2.0;

    // Clamp velocity to prevent excessive sliding
    const currentSpeed = outputVelocity.length();
    if (currentSpeed > maxSpeed) {
      outputVelocity.normalize().scaleInPlace(maxSpeed);
    }

    const inv1k = 1e-3;
    if (outputVelocity.dot(upWorld) > inv1k) {
      const velLen = outputVelocity.length();
      outputVelocity.normalizeFromLength(velLen);
      const horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);
      const c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
      const newOutputVelocity = c.cross(upWorld);
      newOutputVelocity.scaleInPlace(horizLen);
      return newOutputVelocity;
    }

    outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
    return outputVelocity;
  }

  private calculateJumpVelocity(
    currentVelocity: BABYLON.Vector3,
    upWorld: BABYLON.Vector3
  ): BABYLON.Vector3 {
    // Get character-specific physics attributes
    const character = this.currentCharacter;
    if (!character) {
      return currentVelocity;
    }

    const characterMass = character.mass;

    // Character-specific jump height using active character's properties
    let jumpHeight = this.boostActive ? 10.0 : character.jumpHeight; // Use character's jump height

    // Apply super jump effect if active
    if (this.superJumpActive) {
      jumpHeight *= 2.0; // Double jump height
    }
    const massAdjustedJumpHeight = jumpHeight / Math.sqrt(characterMass); // Additional mass adjustment for realistic physics

    // Calculate jump velocity using physics formula: v = sqrt(2 * g * h)
    const u = Math.sqrt(2 * CONFIG.PHYSICS.CHARACTER_GRAVITY.length() * massAdjustedJumpHeight);
    const curRelVel = currentVelocity.dot(upWorld);

    return currentVelocity.add(upWorld.scale(u - curRelVel));
  }

  private getNextState(supportInfo: BABYLON.CharacterSurfaceInfo): CharacterState {
    switch (this.state) {
      case CHARACTER_STATES.IN_AIR:
        return supportInfo.supportedState === BABYLON.CharacterSupportedState.SUPPORTED
          ? CHARACTER_STATES.ON_GROUND
          : CHARACTER_STATES.IN_AIR;

      case CHARACTER_STATES.ON_GROUND:
        if (supportInfo.supportedState !== BABYLON.CharacterSupportedState.SUPPORTED) {
          return CHARACTER_STATES.IN_AIR;
        }
        return this.wantJump ? CHARACTER_STATES.START_JUMP : CHARACTER_STATES.ON_GROUND;

      case CHARACTER_STATES.START_JUMP:
        return CHARACTER_STATES.IN_AIR;

      default:
        return CHARACTER_STATES.IN_AIR;
    }
  }

  public setPlayerMesh(mesh: BABYLON.AbstractMesh): void {
    this.playerMesh = mesh;
    mesh.scaling.setAll(CONFIG.ANIMATION.PLAYER_SCALE);
    this.lastAppliedInvisibility = null;

    // Hide display capsule when real character model is loaded
    if (mesh !== this.displayCapsule) {
      this.displayCapsule.isVisible = false;
    }
  }

  public getPlayerMesh(): BABYLON.AbstractMesh | null {
    return this.playerMesh;
  }

  /**
   * Horizontal facing used for movement / camera alignment (degrees of freedom on `displayCapsule`).
   * Use for multiplayer rotation — independent of skeletal animation euler/quaternion drift on `playerMesh`.
   */
  public getFacingYawRadians(): number {
    return this.displayCapsule.rotation.y;
  }

  public updateCharacterPhysics(character: Character, spawnPosition: BABYLON.Vector3): void {
    // Update character position to spawn point
    this.characterController.setPosition(spawnPosition);

    // Store current character for physics calculations
    this.currentCharacter = character;

    // Set up custom animation handlers for the loaded character
    this.setupCustomAnimationHandlers();

    // Update character-specific physics attributes
    // Note: PhysicsCharacterController doesn't allow runtime updates of capsule dimensions
    // The display capsule can be updated for visual feedback
    this.displayCapsule.scaling.setAll(1); // Reset scaling
    this.displayCapsule.scaling.y = character.height / 1.8; // Scale height
    this.displayCapsule.scaling.x = character.radius / 0.6; // Scale radius
    this.displayCapsule.scaling.z = character.radius / 0.6; // Scale radius

    // Reset physics state for new character
    this.characterController.setVelocity(this.zeroLinearVelocity);
    this.inputDirection.setAll(0);
    this.wantJump = false;
    this.boostActive = false;
    this.state = CHARACTER_STATES.IN_AIR;
  }

  public getDisplayCapsule(): BABYLON.AbstractMesh {
    return this.displayCapsule;
  }

  public setCameraController(cameraController: SmoothFollowCameraController): void {
    this.cameraController = cameraController;
  }

  public setPlayerParticleSystem(particleSystem: BABYLON.IParticleSystem | null): void {
    this.playerParticleSystem = particleSystem;
    // Start with particle system stopped if it exists
    if (particleSystem != null) {
      particleSystem.stop();
    }
  }

  public setThrusterSound(sound: ManagedAudioSound): void {
    this.thrusterSound = sound;
    // Start with sound stopped
    sound.stop();

    // If boost was already active before sound assignment/load, start immediately.
    if (this.boostActive && !sound.isActive()) {
      sound.play();
    }
  }

  /**
   * Gets whether the character is currently boosting
   * @returns True if character is boosting, false otherwise
   */
  public isBoosting(): boolean {
    return this.boostActive;
  }

  /**
   * Applies a super jump effect temporarily
   */
  public applySuperJumpEffect(): void {
    if (!this.currentCharacter) return;

    // Activate super jump effect
    this.superJumpActive = true;
    this.superJumpEndsAtMs = Date.now() + 5000;
  }

  /**
   * Applies an invisibility effect temporarily
   */
  public applyInvisibilityEffect(): void {
    if (!this.playerMesh) return;

    // Activate invisibility effect
    this.invisibilityActive = true;
    this.invisibilityEndsAtMs = Date.now() + 10000;
  }

  private expireTimedBoostEffects(): void {
    const now = Date.now();
    if (this.superJumpActive && this.superJumpEndsAtMs > 0 && now >= this.superJumpEndsAtMs) {
      this.superJumpActive = false;
      this.superJumpEndsAtMs = 0;
    }
    if (
      this.invisibilityActive &&
      this.invisibilityEndsAtMs > 0 &&
      now >= this.invisibilityEndsAtMs
    ) {
      this.invisibilityActive = false;
      this.invisibilityEndsAtMs = 0;
    }
  }

  /**
   * Milliseconds remaining for timed boost effects (super jump / invisibility).
   * Thruster hold has no countdown — returns 0 (BGS-MP-SYNC §5.1.1).
   */
  public getBoostTimeRemainingMs(): number {
    const now = Date.now();
    if (this.superJumpActive && this.superJumpEndsAtMs > 0) {
      return Math.max(0, this.superJumpEndsAtMs - now);
    }
    if (this.invisibilityActive && this.invisibilityEndsAtMs > 0) {
      return Math.max(0, this.invisibilityEndsAtMs - now);
    }
    return 0;
  }

  /** Opaque character model key for multiplayer (`characterModelId`, BGS-MP-SYNC §5.1.1). */
  public getCharacterModelId(): string {
    return this.currentCharacter?.name ?? '';
  }

  /**
   * Updates the invisibility effect
   */
  private updateInvisibilityEffect(): void {
    if (!this.playerMesh) return;

    // Avoid reapplying alpha values unless invisibility state changed.
    if (this.lastAppliedInvisibility === this.invisibilityActive) {
      return;
    }

    const alpha = this.invisibilityActive ? 0.25 : 1.0;
    const allMeshes = [this.playerMesh, ...this.playerMesh.getChildMeshes()];
    allMeshes.forEach((mesh) => {
      if (mesh.material) {
        mesh.material.alpha = alpha;
      }
    });

    this.lastAppliedInvisibility = this.invisibilityActive;
  }

  /**
   * Gets the current velocity of the character
   * @returns The current velocity vector
   */
  public getVelocity(): BABYLON.Vector3 {
    return this.characterController.getVelocity();
  }

  public getPosition(): BABYLON.Vector3 {
    return this.characterController.getPosition();
  }

  public setPosition(position: BABYLON.Vector3): void {
    this.characterController.setPosition(position);
  }

  public setRotation(rotation: BABYLON.Vector3): void {
    this.targetRotationY = rotation.y;
    this.displayCapsule.rotation.y = rotation.y;

    // Update player mesh rotation to match
    if (this.playerMesh) {
      if (this.displayCapsule.rotationQuaternion) {
        this.playerMesh.rotationQuaternion ??= new BABYLON.Quaternion(0, 0, 0, 1);
        this.playerMesh.rotationQuaternion.copyFrom(this.displayCapsule.rotationQuaternion);
      } else {
        this.playerMesh.rotationQuaternion = null;
        this.playerMesh.rotation.copyFrom(this.displayCapsule.rotation);
      }
    }
  }

  public setVelocity(velocity: BABYLON.Vector3): void {
    this.characterController.setVelocity(velocity);
  }

  public resetInputDirection(): void {
    this.inputDirection.setAll(0);
  }

  public getCurrentState(): string {
    // Return current character state based on movement and physics
    const velocity = this.characterController.getVelocity();
    const isMoving = velocity.length() > 0.1 || this.isAnyMovementKeyPressed();
    const isJumping = velocity.y > 0.1;
    const isFalling = velocity.y < -0.1;
    const isRunning = isMoving && this.inputDirection.length() > 0.5;

    if (isJumping) {
      return 'Jumping';
    } else if (isFalling) {
      return 'Falling';
    } else if (isMoving) {
      return isRunning ? 'Running' : 'Walking';
    } else {
      return 'Idle';
    }
  }

  /**
   * True when the player is actively driving forward/strafe input above the run threshold.
   *
   * Used by the multiplayer wire-format builder to distinguish `walk` from `run` while the
   * local {@link AnimationController} is in the `'walk'` role (it plays a single locomotion
   * clip; the remote-side just needs the magnitude to pick the matching playback rate).
   */
  public isRunningInput(): boolean {
    return this.inputDirection.length() > 0.5;
  }

  public getBoostStatus(): string {
    if (this.superJumpActive) {
      return 'Super Jump Active';
    }
    if (this.invisibilityActive) {
      return 'Invisibility Active';
    }
    return 'Ready';
  }

  /**
   * Pauses physics updates for the character
   */
  public pausePhysics(): void {
    this.physicsPaused = true;
    // Set velocity to zero to stop movement
    this.characterController.setVelocity(this.zeroLinearVelocity);
  }

  /**
   * Resumes physics updates for the character
   */
  public resumePhysics(): void {
    this.physicsPaused = false;
  }

  /**
   * Checks if physics is currently paused
   */
  public isPhysicsPaused(): boolean {
    return this.physicsPaused;
  }

  public dispose(): void {
    // Dispose mobile input manager
    MobileInputManager.dispose();
  }
}
