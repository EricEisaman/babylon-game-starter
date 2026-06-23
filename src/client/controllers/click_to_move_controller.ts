// ============================================================================
// CLICK-TO-MOVE CONTROLLER
// ============================================================================
//
// Bridges pointer taps on the invisible collider mesh to navmesh pathfinding and
// the existing CharacterController. A POINTERTAP (taps only, never drags) picks
// the collider, snaps the point to the navmesh, computes a path from the capsule,
// and hands the waypoints to a NavPathFollower. Each frame the follower's
// direction is fed to CharacterController.setNavigationMove so the physics capsule
// walks the path. Manual movement (WASD / joystick) always cancels navigation.
//
// Because picks use POINTERTAP, the SmoothFollowCameraController's drag/zoom
// gestures (POINTERDOWN/MOVE/UP) keep working unchanged.

import { NavigationManager } from '../managers/navigation_manager';
import { devLog } from '../utils/dev_log';

import { NavPathFollower } from './nav_path_follower';

import type { CharacterController } from './character_controller';

export class ClickToMoveController {
  private readonly scene: BABYLON.Scene;
  private readonly characterController: CharacterController;
  private readonly pickableColliders: Set<BABYLON.AbstractMesh>;
  private readonly follower = new NavPathFollower();

  private pointerObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.PointerInfo>> = null;
  private beforeRenderObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
  private enabled = true;

  constructor(
    scene: BABYLON.Scene,
    characterController: CharacterController,
    colliderMeshes: readonly BABYLON.AbstractMesh[]
  ) {
    this.scene = scene;
    this.characterController = characterController;
    this.pickableColliders = new Set(colliderMeshes);

    this.pointerObserver = this.scene.onPointerObservable.add(this.handlePointer);
    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(this.update);
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.cancelActivePath();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private handlePointer = (pointerInfo: BABYLON.PointerInfo): void => {
    if (!this.enabled || pointerInfo.type !== BABYLON.PointerEventTypes.POINTERTAP) {
      return;
    }
    if (!NavigationManager.isReady()) {
      return;
    }

    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
      this.pickableColliders.has(mesh)
    );
    if (!pick?.hit || !pick.pickedPoint) {
      return;
    }

    const target = NavigationManager.findClosestPoint(pick.pickedPoint);
    if (!target) {
      return;
    }

    const start = this.characterController.getPosition();
    const startOnNav = NavigationManager.findClosestPoint(start) ?? start;
    const path = NavigationManager.computePath(startOnNav, target);
    if (!path || path.length === 0) {
      return;
    }

    this.follower.setPath(path);
    this.characterController.notifyNavigationStarted();
    devLog(`[ClickToMove] Path set with ${path.length} waypoints`);
  };

  private update = (): void => {
    if (!this.enabled || !this.follower.isActive()) {
      return;
    }

    // Manual input always wins: drop the path and let the held keys/touch drive.
    if (this.characterController.hasActiveManualMovementInput()) {
      this.follower.clear();
      this.characterController.cancelNavigationForManualInput();
      return;
    }

    const direction = this.follower.currentDirection(this.characterController.getPosition());
    if (direction) {
      this.characterController.setNavigationMove(direction);
    } else {
      this.follower.clear();
      this.characterController.stopNavigationMove();
    }
  };

  private cancelActivePath(): void {
    if (this.follower.isActive()) {
      this.follower.clear();
      this.characterController.stopNavigationMove();
    }
  }

  public dispose(): void {
    this.cancelActivePath();
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.beforeRenderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
      this.beforeRenderObserver = null;
    }
  }
}
