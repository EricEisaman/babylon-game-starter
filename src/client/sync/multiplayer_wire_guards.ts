// ============================================================================
// MULTIPLAYER WIRE GUARDS — validate/coerce SSE & REST payloads defensively
// ============================================================================

import { normalizeQuaternion } from '../utils/multiplayer_serialization';

import type {
  CharacterState,
  ItemInstanceState,
  QuaternionSerializable
} from '../types/multiplayer';

/** World-space limits (meters); rejects absurd/grief payloads before Havok sees them. */
const MAX_ABS_WORLD_COORD = 5e6;

export function clampCoordComponent(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(-MAX_ABS_WORLD_COORD, Math.min(MAX_ABS_WORLD_COORD, n));
}

/** Position or linear velocity in world units (clamped). */
function coerceWorldVector3(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) {
    return null;
  }
  const a = Number(raw[0]);
  const b = Number(raw[1]);
  const c = Number(raw[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    return null;
  }
  return [clampCoordComponent(a), clampCoordComponent(b), clampCoordComponent(c)];
}

/**
 * Wire rotation for **character sync** and **item sync**: unit quaternion [x, y, z, w].
 * Items carry a `pos` + `rot` pose pair on the wire — Invariant P in
 * [MULTIPLAYER_SYNCH.md §5.2](../../../MULTIPLAYER_SYNCH.md#52-item-state). `rot` is
 * validated and normalized via this function.
 */
function coerceQuaternion(raw: unknown): QuaternionSerializable | null {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return null;
  }
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  const w = Number(raw[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) {
    return null;
  }
  return normalizeQuaternion([x, y, z, w]);
}

export function coerceItemInstanceState(raw: unknown): ItemInstanceState | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const rawInstanceId = Reflect.get(raw, 'instanceId');
  const rawItemName = Reflect.get(raw, 'itemName');
  const instanceId = typeof rawInstanceId === 'string' ? rawInstanceId.trim() : '';
  const itemName = typeof rawItemName === 'string' ? rawItemName.trim() : '';
  if (!instanceId || !itemName) {
    return null;
  }

  const rawIsCollected = Reflect.get(raw, 'isCollected');
  const isCollected = Boolean(rawIsCollected);

  // Invariant P (pose-only): a live (non-collected) row MUST carry a valid `pos` and
  // `rot`. Collection-only rows (isCollected=true) are tolerated without a pose
  // because the receiver hides the mesh and the transform is irrelevant.
  const pos = coerceWorldVector3(Reflect.get(raw, 'pos'));
  const rot = coerceQuaternion(Reflect.get(raw, 'rot'));
  if ((!pos || !rot) && !isCollected) {
    return null;
  }

  const tsNum = Number(Reflect.get(raw, 'timestamp'));
  const timestamp = Number.isFinite(tsNum) ? tsNum : Date.now();

  let collectedBy: string | undefined;
  const rawCollectedBy = Reflect.get(raw, 'collectedByClientId');
  if (typeof rawCollectedBy === 'string' && rawCollectedBy.trim() !== '') {
    collectedBy = rawCollectedBy.trim();
  }

  let ownerClientId: string | null | undefined;
  const rawOwnerClientId = Reflect.get(raw, 'ownerClientId');
  if (typeof rawOwnerClientId === 'string' && rawOwnerClientId.trim() !== '') {
    ownerClientId = rawOwnerClientId.trim();
  } else if (rawOwnerClientId === null) {
    ownerClientId = null;
  }

  return {
    instanceId,
    itemName,
    pos: pos ?? [0, 0, 0],
    rot: rot ?? [0, 0, 0, 1],
    isCollected,
    collectedByClientId: collectedBy,
    ownerClientId,
    timestamp
  };
}

export function coerceCharacterState(raw: unknown): CharacterState | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const rawClientId = Reflect.get(raw, 'clientId');
  const clientId = typeof rawClientId === 'string' ? rawClientId.trim() : '';
  if (!clientId) {
    return null;
  }

  const rawCharacterModelId = Reflect.get(raw, 'characterModelId');
  let characterModelId = typeof rawCharacterModelId === 'string' ? rawCharacterModelId.trim() : '';
  if (!characterModelId) {
    characterModelId = 'Red';
  }

  const rawEnvironmentName = Reflect.get(raw, 'environmentName');
  const environmentName = typeof rawEnvironmentName === 'string' ? rawEnvironmentName.trim() : '';

  const position = coerceWorldVector3(Reflect.get(raw, 'position'));
  const rotation = coerceQuaternion(Reflect.get(raw, 'rotation'));
  const velocity = coerceWorldVector3(Reflect.get(raw, 'velocity'));
  if (!position || !rotation || !velocity) {
    return null;
  }

  const rawAnimationState = Reflect.get(raw, 'animationState');
  let animationState = typeof rawAnimationState === 'string' ? rawAnimationState.trim() : '';
  if (!animationState) {
    animationState = 'idle';
  }

  const afNum = Number(Reflect.get(raw, 'animationFrame'));
  const animationFrame = Number.isFinite(afNum) ? Math.min(1, Math.max(0, afNum)) : 0;

  const isJumping = Boolean(Reflect.get(raw, 'isJumping'));
  const isBoosting = Boolean(Reflect.get(raw, 'isBoosting'));

  let boostType: 'superJump' | 'invisibility' | undefined;
  const rawBoostType = Reflect.get(raw, 'boostType');
  if (rawBoostType === 'superJump' || rawBoostType === 'invisibility') {
    boostType = rawBoostType;
  }

  const btNum = Number(Reflect.get(raw, 'boostTimeRemaining'));
  const boostTimeRemaining = Number.isFinite(btNum) ? Math.max(0, btNum) : 0;

  const tsNum = Number(Reflect.get(raw, 'timestamp'));
  const timestamp = Number.isFinite(tsNum) ? tsNum : Date.now();

  return {
    clientId,
    environmentName,
    characterModelId,
    position,
    rotation,
    velocity,
    animationState,
    animationFrame,
    isJumping,
    isBoosting,
    boostType,
    boostTimeRemaining,
    timestamp
  };
}
