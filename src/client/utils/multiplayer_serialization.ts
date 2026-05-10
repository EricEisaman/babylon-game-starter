// ============================================================================
// MULTIPLAYER SERIALIZATION UTILITIES
// ============================================================================
//
// Character rotation on the wire is **quaternion [x,y,z,w] only**. Item / physics-object
// transforms on the wire are **pose-only**: `{ pos: [x,y,z], rot: [x,y,z,w] }`
// (Invariant P) — see MULTIPLAYER_SYNCH.md §5.2 and the `sampleMeshPose` /
// `applyPoseToMesh` helpers below. Scale is never replicated: every client spawns the
// mesh with identical local `scaling` from its config, and that static scale factor is
// the same on all clients (negative-sign flips for GLB re-orientation included).
// Euler angles appear only in asset/config authoring and local character control; they
// are NEVER read or written on item paths (Invariant E).
//
// Historical notes:
//  - Earlier revisions shipped a 16-float world matrix and decomposed on the receiver.
//    That was ~2× the bandwidth and forced an expensive decomposition on both ends;
//    it also reintroduced the negative-scale decomposition trap whenever the sender's
//    world matrix contained a mirrored scale (collectibles with `-x`, `-z` sign flips).
//    See MULTIPLAYER_SYNCH.md §5.2 for the rationale behind pose-only transport.
//  - Earlier revisions provided an `applyMatrixToBody` helper that drove
//    `PhysicsBody.setTargetTransform`. Per MULTIPLAYER_SYNCH.md §B.9 (mesh-direct
//    kinematic apply), replicas now always write the mesh transform and let Havok's
//    pre-step sync propagate to the body. `applyMatrixToBody` has been removed to
//    prevent regressions.

import type { CharacterController } from '../controllers/character_controller';
import type { QuaternionSerializable, Vector3Serializable } from '../types/multiplayer';

export type { QuaternionSerializable } from '../types/multiplayer';

/**
 * Serializes BABYLON.Quaternion to [x, y, z, w]
 * Standard order: x, y, z, w (not w, x, y, z)
 */
function serializeQuaternion(q: BABYLON.Quaternion): QuaternionSerializable {
  return [q.x, q.y, q.z, q.w];
}

/**
 * Deserializes [x, y, z, w] back to BABYLON.Quaternion
 */
export function deserializeQuaternion(q: QuaternionSerializable): BABYLON.Quaternion {
  return new BABYLON.Quaternion(q[0], q[1], q[2], q[3]);
}

/**
 * Normalizes a quaternion to unit length
 */
export function normalizeQuaternion(q: QuaternionSerializable): QuaternionSerializable {
  const lengthSq = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
  if (lengthSq === 0) {
    return [0, 0, 0, 1]; // Identity quaternion
  }
  const length = Math.sqrt(lengthSq);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

// ----------------------------------------------------------------------------
// Item / physics-object pose helpers (Invariants P and E)
// ----------------------------------------------------------------------------

/** World-coord clamp bound mirrored from `multiplayer_wire_guards.MAX_ABS_WORLD_COORD`. */
const POSE_COORD_CLAMP = 5e6;

function clampPoseComponent(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(-POSE_COORD_CLAMP, Math.min(POSE_COORD_CLAMP, n));
}

/** Wire pose — position + unit quaternion, no scale. See Invariant P in MULTIPLAYER_SYNCH.md §5.2. */
export interface WirePose {
  readonly pos: Vector3Serializable;
  readonly rot: QuaternionSerializable;
}

/**
 * Sample a mesh's world pose as `{ pos, rot }` directly from its local channels
 * (`mesh.position`, `mesh.rotationQuaternion`). This is the sole transform payload
 * carried on the item wire (Invariant P).
 *
 * **Unparented-mesh assumption.** Every replicated item mesh is unparented at spawn
 * (`CollectiblesManager.createCollectibleInstance` / `createPhysicsInstance` and
 * environment physics objects add the mesh directly to the scene). For an unparented
 * mesh, `mesh.position` equals its world position and `mesh.rotationQuaternion` is
 * the world rotation factor before scale — exactly what we need. We therefore avoid
 * the cost of `computeWorldMatrix` + `decompose` on every sample.
 *
 * **Scale is never sampled.** The mesh's local `scaling` (including any negative-sign
 * flips authored at spawn, e.g. `-x, -z` for GLB re-orientation of collectibles) is
 * a static configuration value — every client sets the same value at spawn from the
 * same `environment.items[*].instances[*].scale`. Shipping it would be a waste of
 * bandwidth and CPU, and it is exactly what used to trigger the negative-scale
 * decomposition trap when we shipped a world matrix instead.
 *
 * Rotation is normalized on send so downstream consumers can assume unit quaternions
 * without re-measuring length. If the mesh has no `rotationQuaternion` (rare — only
 * if someone mutated `mesh.rotation` directly, which we forbid on item paths per
 * Invariant E), we emit the identity rotation.
 */
export function sampleMeshPose(mesh: BABYLON.AbstractMesh): WirePose {
  const p = mesh.position;
  const q = mesh.rotationQuaternion;
  const rot: QuaternionSerializable = q ? normalizeQuaternion([q.x, q.y, q.z, q.w]) : [0, 0, 0, 1];
  return {
    pos: [clampPoseComponent(p.x), clampPoseComponent(p.y), clampPoseComponent(p.z)],
    rot
  };
}

/**
 * Write a wire `{ pos, rot }` pair onto a mesh's local channels (Invariant P). This is
 * the canonical replica-apply primitive — see MULTIPLAYER_SYNCH.md §B.9 for why we do
 * NOT drive `body.setTargetTransform` here.
 *
 * The sender and receiver both assume the mesh is unparented and has the same local
 * `scaling` (set at spawn from the shared config). Writing `pos` and
 * `rotationQuaternion` verbatim therefore reproduces the sender's world transform
 * exactly, without any matrix decomposition on either end and without clobbering the
 * local scale. This side-steps the negative-scale decomposition trap (see
 * MULTIPLAYER_SYNCH.md §5.2) that the 16-float-matrix wire format was vulnerable to:
 * the receiver's scale is its own authored value, and the rotation quaternion is the
 * sender's *pre-scale* local rotation, so no mirrored-axis ambiguity ever arises.
 *
 * When the mesh has an associated ANIMATED physics body, Havok's pre-step sync copies
 * these values to the body before the next physics tick so collision queries see the
 * correct pose. The Euler `mesh.rotation` channel is never written (Invariant E). This
 * function NEVER writes linear / angular velocity — that would violate the non-owner
 * kinematic invariant (§4.7).
 */
export function applyPoseToMesh(mesh: BABYLON.AbstractMesh, pose: WirePose): void {
  const [px, py, pz] = pose.pos;
  mesh.position.set(px, py, pz);
  mesh.rotationQuaternion ??= new BABYLON.Quaternion();
  const [rx, ry, rz, rw] = pose.rot;
  mesh.rotationQuaternion.set(rx, ry, rz, rw);
}

/**
 * Locomotion-facing yaw only — matches `CharacterController` capsule bearing.
 * Prefer this for multiplayer wire rotation so we never ship baked GLB root quaternions or
 * animation-posture drift from `playerMesh` after locomotion clips run.
 */
export function yawRadiansToWireQuaternion(yawRadians: number): QuaternionSerializable {
  const q = BABYLON.Quaternion.FromEulerAngles(0, yawRadians, 0);
  return normalizeQuaternion(serializeQuaternion(q));
}

/**
 * Throttles function calls to a maximum frequency
 */
export class ThrottledFunction {
  private lastCallTime = 0;
  private throttleMs: number;

  constructor(throttleMs: number) {
    this.throttleMs = Math.max(0, throttleMs);
  }

  public shouldCall(): boolean {
    const now = Date.now();
    if (now - this.lastCallTime >= this.throttleMs) {
      this.lastCallTime = now;
      return true;
    }
    return false;
  }

  public reset(): void {
    this.lastCallTime = 0;
  }
}

/**
 * Maps gameplay `CharacterController#getCurrentState()` labels to BGS-MP-SYNC §5.1.1 semantic tokens.
 */
function toMultiplayerAnimationStateToken(gameplayStateLabel: string): string {
  const locomotionMap: Record<string, string> = {
    Idle: 'idle',
    Walking: 'walk',
    Running: 'run',
    Jumping: 'jump',
    Falling: 'fall'
  };
  return locomotionMap[gameplayStateLabel] ?? gameplayStateLabel.toLowerCase();
}

/**
 * Derives the wire-format animation token from the clip the local
 * {@link AnimationController} is *actually* playing, not from raw `velocity.y`.
 *
 * Why: `CharacterController#getCurrentState()` returns `'Jumping'` for any
 * `velocity.y > 0.1`, including terrain micro-bumps that the local
 * `AnimationController.handleJumpDelay` deliberately suppresses (see
 * `animation_controller.ts`). Using the raw label on the wire causes remote
 * viewers to flicker into the jump pose for a tick on bumpy environments
 * (e.g. RV Life) while the local avatar correctly stays in its run clip.
 *
 * Mapping:
 *  - role `'jump'` -> `'jump'`
 *  - role `'idle'` -> `'idle'`
 *  - role `'walk'` -> `'run'` if {@link CharacterController.isRunningInput} else `'walk'`
 *  - role `null` (init / custom-key clip) -> velocity-based fallback
 *    via {@link toMultiplayerAnimationStateToken}, preserving prior behavior.
 */
export function deriveWireAnimToken(ctrl: CharacterController): string {
  const role = ctrl.animationController.getCurrentRole();
  if (role === 'jump') {
    return 'jump';
  }
  if (role === 'idle') {
    return 'idle';
  }
  if (role === 'walk') {
    return ctrl.isRunningInput() ? 'run' : 'walk';
  }
  return toMultiplayerAnimationStateToken(ctrl.getCurrentState());
}
