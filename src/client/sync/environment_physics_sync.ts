// ============================================================================
// ENVIRONMENT PHYSICS SYNC — replicate dynamic physicsObjects (Level Test cubes)
// ============================================================================
//
// Replicates transforms/velocities for `environment.physicsObjects` with mass > 0. Under the
// hybrid authority model these are **per-item authority** — each instance is owned by at most
// one client at a time and only its owner may publish rows. See MULTIPLAYER_SYNCH.md:
//   - §4.7 Item authority lifecycle
//     (../../../MULTIPLAYER_SYNCH.md#47-item-authority-lifecycle)
//   - §7.5 Item authority authorization
//     (../../../MULTIPLAYER_SYNCH.md#75-item-authority-authorization)
//
// `setEnvironmentPhysicsMeshKinematic()` flips individual bodies between ANIMATED
// (kinematic, receivers) and DYNAMIC (owner) as per-item authority changes.

import { ASSETS } from '../config/assets';
import { applyPoseToMesh, sampleMeshPose } from '../utils/multiplayer_serialization';

import type { ItemInstanceState } from '../types/multiplayer';

/** `ItemInstanceState.itemName` marker so clients route updates to meshes, not collectibles. */
export const ENV_PHYSICS_ITEM_MARKER = '__env_physics__';

export function makeEnvironmentPhysicsInstanceId(
  environmentName: string,
  meshName: string
): string {
  return `${environmentName}::${meshName}`;
}

export function meshNameFromEnvironmentInstanceId(
  environmentName: string,
  instanceId: string
): string | null {
  const prefix = `${environmentName}::`;
  if (!instanceId.startsWith(prefix)) {
    return null;
  }
  const rest = instanceId.slice(prefix.length);
  return rest.trim() !== '' ? rest : null;
}

/**
 * Builds serializable snapshots for configured environment physics meshes (mass > 0).
 * Each row carries the mesh pose as `{ pos, rot }` (Invariant P; no Euler, no separate
 * velocity, no world matrix — see MULTIPLAYER_SYNCH.md §5.2).
 */
export function sampleEnvironmentPhysicsStates(
  scene: BABYLON.Scene,
  environmentName: string
): ItemInstanceState[] {
  const env = ASSETS.ENVIRONMENTS.find((e) => e.name === environmentName);
  if (!env || environmentName.trim() === '') {
    return [];
  }

  const ts = Date.now();
  const out: ItemInstanceState[] = [];

  for (const po of env.physicsObjects) {
    if (po.mass <= 0 || !po.name || po.name.trim() === '') {
      continue;
    }
    const mesh = scene.getMeshByName(po.name);
    if (!mesh || mesh.isDisposed()) {
      continue;
    }

    const pose = sampleMeshPose(mesh);
    out.push({
      instanceId: makeEnvironmentPhysicsInstanceId(environmentName, po.name),
      itemName: ENV_PHYSICS_ITEM_MARKER,
      pos: pose.pos,
      rot: pose.rot,
      isCollected: false,
      timestamp: ts
    });
  }

  return out;
}

/**
 * Applies an authoritative `{ pos, rot }` pose snapshot onto a replicated environment body.
 *
 * Per MULTIPLAYER_SYNCH.md §4.7 (non-owner kinematic invariant), Invariants P/E, and
 * §B.9 (mesh-direct kinematic apply): the receiver writes the pose directly to the
 * mesh's local channels (`mesh.position` + `mesh.rotationQuaternion`). On the next
 * Havok tick the pre-step sync copies those channels onto the ANIMATED body, so
 * collisions see the correct pose without any `setTargetTransform` interpolation or
 * `disablePreStep` gymnastics, and without ever touching `mesh.scaling` (which is a
 * static per-client spawn value).
 *
 * It MUST NOT call `setLinearVelocity` / `setAngularVelocity` (non-owner bodies are
 * ANIMATED), MUST NOT call `setTargetTransform` (wrong primitive; see §B.9), and
 * MUST skip DYNAMIC bodies (means the local client is the resolved owner; remote
 * state for an owned item signals an authority mis-route upstream).
 */
export function applyRemoteEnvironmentPhysicsState(
  scene: BABYLON.Scene,
  currentEnvironmentName: string,
  state: ItemInstanceState
): void {
  try {
    if (!scene || scene.isDisposed) {
      return;
    }
  } catch {
    return;
  }

  if (state.itemName !== ENV_PHYSICS_ITEM_MARKER) {
    return;
  }

  if (
    !Array.isArray(state.pos) ||
    state.pos.length !== 3 ||
    !Array.isArray(state.rot) ||
    state.rot.length !== 4
  ) {
    return;
  }

  const meshName = meshNameFromEnvironmentInstanceId(currentEnvironmentName, state.instanceId);
  if (!meshName) {
    return;
  }

  const mesh = scene.getMeshByName(meshName);
  if (!mesh || mesh.isDisposed()) {
    return;
  }

  const node = mesh as BABYLON.TransformNode & {
    physicsBody?: BABYLON.PhysicsBody;
  };
  const body = node.physicsBody;

  if (body && !body.isDisposed && body.getMotionType() === BABYLON.PhysicsMotionType.DYNAMIC) {
    console.warn(
      `[EnvPhysicsSync] Received remote state for DYNAMIC (self-owned) env-physics item ${state.instanceId}; ignoring.`
    );
    return;
  }

  try {
    applyPoseToMesh(mesh, { pos: state.pos, rot: state.rot });
  } catch {
    /* Havok/plugin edge — skip frame */
  }
}

/**
 * Flips a single environment physics mesh's motion type. Used by the per-item authority
 * pipeline so a dynamic mesh is kinematic on non-owners and dynamic on the owner.
 * Returns true on a successful flip (or no-op when already in the requested state).
 */
export function setEnvironmentPhysicsMeshKinematic(
  scene: BABYLON.Scene,
  meshName: string,
  kinematic: boolean
): boolean {
  if (!meshName || meshName.trim() === '') {
    return false;
  }
  const mesh = scene.getMeshByName(meshName);
  if (!mesh || mesh.isDisposed()) {
    return false;
  }
  const node = mesh as BABYLON.TransformNode & { physicsBody?: BABYLON.PhysicsBody };
  const body = node.physicsBody;
  if (!body || body.isDisposed) {
    return false;
  }
  const motionType = kinematic
    ? BABYLON.PhysicsMotionType.ANIMATED
    : BABYLON.PhysicsMotionType.DYNAMIC;
  try {
    if (body.getMotionType() !== motionType) {
      body.setMotionType(motionType);
    }
    // Leave body.disablePreStep at its default (false). The non-owner apply path
    // writes mesh.position / rotationQuaternion directly (§B.9 mesh-direct
    // kinematic pattern); we need the pre-step sync enabled so those writes
    // reach the body before each physics step.
    if (kinematic) {
      body.setLinearVelocity(BABYLON.Vector3.Zero());
      body.setAngularVelocity(BABYLON.Vector3.Zero());
    }
    return true;
  } catch {
    return false;
  }
}
