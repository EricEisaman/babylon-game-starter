// ============================================================================
// SMOOTH FOLLOW CAMERA CONTROLLER
// ============================================================================

import { CONFIG } from '../config/game_config';

import type { CameraViewMode } from '../types/environment';

export type { CameraViewMode };

export class SmoothFollowCameraController {
  private readonly scene: BABYLON.Scene;
  private readonly camera: BABYLON.TargetCamera;
  private readonly target: BABYLON.AbstractMesh;
  private offset: BABYLON.Vector3;
  /** Reset baseline for `resetCameraToDefaultOffset`; tracks the active environment's offset. */
  private readonly defaultOffset: BABYLON.Vector3;
  private readonly dragSensitivity: number;

  // Top-down view state. `viewMode` selects which update path runs each frame;
  // `cyclingEnabled` gates user switching (only true for `cameraMode: 'cycle'` envs).
  private viewMode: CameraViewMode = 'thirdPerson';
  private cyclingEnabled = false;
  private topDownOffset: BABYLON.Vector3 = CONFIG.CAMERA.TOP_DOWN_OFFSET.clone();
  private topDownLookAt = true;
  private topDownFollow = true;
  /** Reused per-frame target for the top-down camera to avoid allocations. */
  private readonly topDownScratch = new BABYLON.Vector3();

  public isDragging = false;
  public dragDeltaX = 0;
  public dragDeltaZ = 0;

  private pointerObserver: BABYLON.Observer<BABYLON.PointerInfo> | null = null;
  private beforeRenderObserver: BABYLON.Observer<BABYLON.Scene> | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private isTwoFingerPanning = false;
  private lastPanPositions: [number, number, number, number] | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // Character rotation lerp variables
  public isRotatingCharacter = false;
  private characterRotationStartY = 0;
  private characterRotationTargetY = 0;
  private characterRotationStartTime = 0;
  private characterRotationDuration = 0.5; // 0.5 seconds
  private shouldStartRotationOnWalk = false;

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.TargetCamera,
    target: BABYLON.AbstractMesh,
    offset: BABYLON.Vector3 = CONFIG.CAMERA.OFFSET,
    dragSensitivity: number = CONFIG.CAMERA.DRAG_SENSITIVITY
  ) {
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.offset = offset.clone();
    this.defaultOffset = offset.clone();
    this.dragSensitivity = dragSensitivity;

    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    this.pointerObserver = this.scene.onPointerObservable.add(this.handlePointer);
    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(this.updateCamera);

    this.canvas = this.scene.getEngine().getRenderingCanvas();
    if (this.canvas) {
      this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
      this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    }
  }

  private handlePointer = (pointerInfo: BABYLON.PointerInfo): void => {
    // Top-down camera ignores drag-pan/rotate so it stays locked overhead.
    if (this.viewMode === 'topDown') {
      return;
    }

    switch (pointerInfo.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN:
        this.isDragging = true;
        this.lastPointerX = pointerInfo.event.clientX;
        this.lastPointerY = pointerInfo.event.clientY;
        this.dragDeltaX = 0;
        this.dragDeltaZ = 0;
        break;

      case BABYLON.PointerEventTypes.POINTERUP:
        this.isDragging = false;
        this.dragDeltaX = 0;
        this.dragDeltaZ = 0;
        // Mark that we should start rotation lerp on first walk activation
        this.shouldStartRotationOnWalk = true;
        break;

      case BABYLON.PointerEventTypes.POINTERMOVE:
        if (this.isDragging) {
          this.handlePointerMove(pointerInfo);
        }
        break;
    }
  };

  private handlePointerMove(pointerInfo: BABYLON.PointerInfo): void {
    const deltaX = pointerInfo.event.movementX || pointerInfo.event.clientX - this.lastPointerX;
    const deltaY = pointerInfo.event.movementY || pointerInfo.event.clientY - this.lastPointerY;

    this.lastPointerX = pointerInfo.event.clientX;
    this.lastPointerY = pointerInfo.event.clientY;

    this.dragDeltaX = -deltaX * this.dragSensitivity;
    this.dragDeltaZ = deltaY * this.dragSensitivity;

    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    const right = this.camera.getDirection(BABYLON.Vector3.Right());
    this.camera.position.addInPlace(right.scale(this.dragDeltaX));

    const up = this.camera.getDirection(BABYLON.Vector3.Up());
    this.camera.position.addInPlace(up.scale(this.dragDeltaZ));

    this.camera.setTarget(this.target.position);
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.offset.z += e.deltaX * this.dragSensitivity * 6;
    this.offset.z = BABYLON.Clamp(this.offset.z, CONFIG.CAMERA.ZOOM_MIN, CONFIG.CAMERA.ZOOM_MAX);
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      const t0 = e.touches.item(0);
      const t1 = e.touches.item(1);
      if (!t0 || !t1) {
        return;
      }
      this.isTwoFingerPanning = true;
      this.lastPanPositions = [t0.clientX, t0.clientY, t1.clientX, t1.clientY] as const;
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (!this.isTwoFingerPanning || e.touches.length !== 2 || !this.lastPanPositions) {
      return;
    }

    e.preventDefault();
    this.handleTwoFingerPan(e);
  };

  private handleTwoFingerPan(e: TouchEvent): void {
    const t0 = e.touches.item(0);
    const t1 = e.touches.item(1);
    if (!t0 || !t1) {
      return;
    }
    const currentPositions: [number, number, number, number] = [
      t0.clientX,
      t0.clientY,
      t1.clientX,
      t1.clientY
    ];

    if (!this.lastPanPositions) return;
    const lastMidX = (this.lastPanPositions[0] + this.lastPanPositions[2]) / 2;
    const lastMidY = (this.lastPanPositions[1] + this.lastPanPositions[3]) / 2;
    const currMidX = (currentPositions[0] + currentPositions[2]) / 2;
    const currMidY = (currentPositions[1] + currentPositions[3]) / 2;

    const deltaX = currMidX - lastMidX;
    const deltaY = currMidY - lastMidY;

    const right = this.camera.getDirection(BABYLON.Vector3.Right());
    const forward = this.camera.getDirection(BABYLON.Vector3.Forward());

    this.offset.addInPlace(right.scale(-deltaX * this.dragSensitivity * 4));
    this.offset.addInPlace(forward.scale(deltaY * this.dragSensitivity * 4));

    this.lastPanPositions = currentPositions;
  }

  private handleTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length < 2) {
      this.isTwoFingerPanning = false;
      this.lastPanPositions = null;
    }
  };

  private updateCamera = (): void => {
    // Top-down view runs its own positioning and skips third-person follow + the
    // face-away-from-camera character rotation lerp entirely.
    if (this.viewMode === 'topDown') {
      this.updateTopDownCamera();
      return;
    }

    if (!this.isDragging) {
      // Only smooth follow if we're not waiting for walk activation
      if (!this.shouldStartRotationOnWalk) {
        this.smoothFollowTarget();
      }
    } else {
      this.updateOffsetY();
    }

    // Update character rotation lerp
    this.updateCharacterRotationLerp();
  };

  private updateTopDownCamera(): void {
    // Follow: hold `topDownOffset` above the character. Fixed: sit at the absolute position.
    if (this.topDownFollow) {
      this.target.position.addToRef(this.topDownOffset, this.topDownScratch);
    } else {
      this.topDownScratch.copyFrom(this.topDownOffset);
    }

    BABYLON.Vector3.LerpToRef(
      this.camera.position,
      this.topDownScratch,
      CONFIG.CAMERA.FOLLOW_SMOOTHING,
      this.camera.position
    );

    // lockedTarget would override setTarget, so clear it for the top-down path.
    this.camera.lockedTarget = null;

    if (!this.topDownLookAt) {
      // Look straight down (orientation independent of the character).
      this.camera.position.addToRef(BABYLON.Vector3.Down(), this.topDownScratch);
      this.camera.setTarget(this.topDownScratch);
      return;
    }

    if (this.topDownFollow) {
      // Follow + look-at: derive the look point from the fixed offset (camera - offset) rather
      // than the live character position. The smoothing lerp makes the camera trail the character
      // laterally; aiming at the live position would tilt the view horizontally and yaw the camera
      // every frame. Using the constant offset keeps a fixed orientation (no Y-axis rotation) while
      // still framing the character in steady state.
      this.camera.position.subtractToRef(this.topDownOffset, this.topDownScratch);
      this.camera.setTarget(this.topDownScratch);
    } else {
      // Fixed position + look-at: the camera is stationary, so it rotates to keep the moving
      // character framed.
      this.camera.setTarget(this.target.position);
    }
  }

  private smoothFollowTarget(): void {
    // If character is rotating, pause the smooth follow camera
    if (this.isRotatingCharacter) {
      return;
    }

    const yRot = BABYLON.Quaternion.FromEulerAngles(0, this.target.rotation.y, 0);
    const rotatedOffset = this.offset.rotateByQuaternionToRef(yRot, BABYLON.Vector3.Zero());
    const desiredPos = this.target.position.add(rotatedOffset);

    // Calculate dynamic smoothing based on offset.z
    // Closer camera (smaller offset.z) = more responsive (higher smoothing value)
    // Farther camera (larger offset.z) = more relaxed (lower smoothing value)
    const normalizedOffset =
      (this.offset.z - CONFIG.CAMERA.ZOOM_MIN) / (CONFIG.CAMERA.ZOOM_MAX - CONFIG.CAMERA.ZOOM_MIN);
    const dynamicSmoothing = BABYLON.Scalar.Lerp(0.05, 0.25, normalizedOffset);

    BABYLON.Vector3.LerpToRef(
      this.camera.position,
      desiredPos,
      dynamicSmoothing,
      this.camera.position
    );

    this.camera.lockedTarget = this.target.position;
  }

  private updateOffsetY(): void {
    this.offset.y = this.camera.position.y - this.target.position.y;
  }

  private startCharacterRotationLerp(): void {
    // Calculate direction from character to camera
    const toCamera = this.camera.position.subtract(this.target.position).normalize();

    // Calculate the desired Y rotation (yaw) to face AWAY from the camera
    const targetYaw = Math.atan2(-toCamera.x, -toCamera.z);

    // Calculate the shortest rotation path
    const currentYaw = this.target.rotation.y;
    let rotationDifference = targetYaw - currentYaw;

    // Normalize to shortest path (-π to π)
    while (rotationDifference > Math.PI) rotationDifference -= 2 * Math.PI;
    while (rotationDifference < -Math.PI) rotationDifference += 2 * Math.PI;

    // Start the lerp with the shortest path
    this.isRotatingCharacter = true;
    this.characterRotationStartY = currentYaw;
    this.characterRotationTargetY = currentYaw + rotationDifference;
    this.characterRotationStartTime = Date.now();
  }

  private updateCharacterRotationLerp(): void {
    if (!this.isRotatingCharacter) return;

    const currentTime = Date.now();
    const elapsed = (currentTime - this.characterRotationStartTime) / 1000; // Convert to seconds
    const progress = Math.min(elapsed / this.characterRotationDuration, 1.0);

    // Use smooth easing function
    const easedProgress = this.easeInOutCubic(progress);

    // Lerp the rotation
    const currentRotation = BABYLON.Scalar.Lerp(
      this.characterRotationStartY,
      this.characterRotationTargetY,
      easedProgress
    );

    this.target.rotation.y = currentRotation;

    // Update quaternion if needed
    if (this.target.rotationQuaternion) {
      BABYLON.Quaternion.FromEulerAnglesToRef(
        this.target.rotation.x,
        currentRotation,
        this.target.rotation.z,
        this.target.rotationQuaternion
      );
    }

    // Stop lerping when complete
    if (progress >= 1.0) {
      this.isRotatingCharacter = false;
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  public checkForWalkActivation(): void {
    if (this.shouldStartRotationOnWalk) {
      this.shouldStartRotationOnWalk = false;
      // The face-away-from-camera lerp only makes sense in third person.
      if (this.viewMode === 'thirdPerson') {
        this.startCharacterRotationLerp();
      }
    }
  }

  // --- Top-down / view mode API ------------------------------------------

  /** Configures the top-down camera offset/position, look-at, and follow behavior. */
  public configureTopDown(offset: BABYLON.Vector3, lookAt: boolean, follow: boolean): void {
    this.topDownOffset.copyFrom(offset);
    this.topDownLookAt = lookAt;
    this.topDownFollow = follow;
  }

  /** Enables/disables user view switching (only true for `cameraMode: 'cycle'` environments). */
  public setCyclingEnabled(enabled: boolean): void {
    this.cyclingEnabled = enabled;
  }

  public isCyclingEnabled(): boolean {
    return this.cyclingEnabled;
  }

  public getViewMode(): CameraViewMode {
    return this.viewMode;
  }

  /** Sets the active view mode and resets transient third-person follow state. */
  public setViewMode(mode: CameraViewMode): void {
    if (this.viewMode === mode) {
      return;
    }
    this.viewMode = mode;
    this.forceActivateSmoothFollow();
  }

  /** Toggles between third person and top down. No-op unless cycling is enabled. */
  public toggleViewMode(): void {
    if (!this.cyclingEnabled) {
      return;
    }
    this.setViewMode(this.viewMode === 'thirdPerson' ? 'topDown' : 'thirdPerson');
  }

  /**
   * Force activate smooth following, useful after environment transitions
   */
  public forceActivateSmoothFollow(): void {
    this.shouldStartRotationOnWalk = false;
    this.isRotatingCharacter = false;
    this.isDragging = false;
    this.dragDeltaX = 0;
    this.dragDeltaZ = 0;
  }

  /**
   * Sets the camera offset
   * @param offset The new camera offset vector
   */
  public setOffset(offset: BABYLON.Vector3): void {
    this.offset.copyFrom(offset);
    // The env-configured offset is now the reset baseline so post-load reset / the `1` key honor it.
    this.defaultOffset.copyFrom(offset);
  }

  /**
   * Reset camera to default offset from player
   */
  public resetCameraToDefaultOffset(): void {
    // Reset to the active environment's offset baseline (falls back to the global default).
    this.offset.copyFrom(this.defaultOffset);

    // Force activate smooth follow to ensure camera moves to new position
    this.forceActivateSmoothFollow();
  }

  public dispose(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
    }
    if (this.beforeRenderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('wheel', this.handleWheel);
    }
  }
}
