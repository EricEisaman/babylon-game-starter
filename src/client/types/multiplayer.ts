// ============================================================================
// MULTIPLAYER SYNCHRONIZED STATE TYPES
// ============================================================================

/**
 * Serializable Vector3 as [x, y, z]
 */
export type Vector3Serializable = [number, number, number];

/**
 * Serializable unit quaternion [x, y, z, w] — **only** wire format for rotation in multiplayer payloads.
 */
export type QuaternionSerializable = [number, number, number, number];

/**
 * Serializable Color3/Color4 as [r, g, b] or [r, g, b, a]
 */
export type ColorSerializable = [number, number, number] | [number, number, number, number];

/**
 * Client multiplayer state
 */
export interface MultiplayerClientState {
  readonly clientId: string;
  /** Updated in place when `synchronizer-changed` patch-signals arrive. */
  isSynchronizer: boolean;
  readonly sessionStarted: string; // ISO timestamp
  /** Updated in place when the client walks through a portal and {@link MultiplayerManager.switchEnvironment} propagates the change to the server. */
  environment: string; // Current environment name
  readonly character: string; // Current character name
}

/**
 * Join response from server (JSON matches Go `JoinResponse` snake_case tags).
 */
export interface JoinResponse {
  readonly client_id: string;
  readonly is_synchronizer: boolean;
  readonly existing_clients: number;
  /** Session token for SSE auth (`GET /api/multiplayer/stream?sid=…`). */
  readonly session_id: string;
}

// ============================================================================
// CHARACTER SYNCHRONIZATION
// ============================================================================

export interface CharacterState {
  readonly clientId: string;
  /** `ASSETS.ENVIRONMENTS[].name` for the peer’s loaded scene; must match viewer’s env to show proxies. */
  readonly environmentName: string;
  /** Stable asset key for the loaded character (e.g. ASSETS.CHARACTERS[].name); BGS-MP-SYNC §5.1.1 */
  readonly characterModelId: string;
  readonly position: Vector3Serializable;
  readonly rotation: QuaternionSerializable;
  readonly velocity: Vector3Serializable;
  /** Semantic locomotion token: idle | walk | run | jump | fall (BGS-MP-SYNC §5.1.1) */
  readonly animationState: string;
  /** Normalized playback phase in [0, 1] for the active clip (BGS-MP-SYNC §5.1.1) */
  readonly animationFrame: number;
  readonly isJumping: boolean;
  readonly isBoosting: boolean;
  readonly boostType?: 'superJump' | 'invisibility';
  /** Milliseconds remaining for timed boost effects; 0 when inactive (BGS-MP-SYNC §5.1.1) */
  readonly boostTimeRemaining: number; // ms
  readonly timestamp: number; // client sample time, unix ms
}

// ============================================================================
// ITEM SYNCHRONIZATION
// ============================================================================

/**
 * One row of item replication state. See
 * [MULTIPLAYER_SYNCH.md §5.2 / §8.2](../../../MULTIPLAYER_SYNCH.md#52-item-state)
 * for the normative shape.
 *
 * **Invariant P (pose-only transport).** The row carries the item's pose as exactly two
 * fields: `pos` (world-space position, 3 floats) and `rot` (unit quaternion, 4 floats).
 * The sender reads these from the mesh's LOCAL channels (`mesh.position` and
 * `mesh.rotationQuaternion`); for all replicated items the mesh is unparented at spawn,
 * so `mesh.position` **is** the world position and `mesh.rotationQuaternion` is the
 * pre-scale world rotation. The receiver writes the same two fields back onto the
 * mesh's local channels verbatim — no matrix decomposition on either end. Babylon's
 * TRS pipeline recomputes the world matrix from `position · rotationQuaternion · scaling`,
 * and since every client spawned the mesh with identical local `scaling` from the same
 * `environment.items[*].instances[*].scale` config, the world matrices match across
 * clients without replicating scale. This is what enables collectibles with negative
 * local scale (sign-flipped `-x`, `-z` for GLB re-orientation) to sync correctly — the
 * flip never crosses the wire so it cannot double itself on the receiver.
 *
 * **Invariant E (no Euler on item paths).** The Euler channel of the mesh
 * (`mesh.rotation.x/y/z`) is never sampled and never written on item paths. Authoring
 * configs may express rotation as Euler, but multiplayer samples and applies only
 * quaternion pose data on the item wire.
 *
 * Under the three-tier authority model
 * ([§4.7](../../../MULTIPLAYER_SYNCH.md#47-item-authority-lifecycle) +
 * [§4.8](../../../MULTIPLAYER_SYNCH.md#48-environment-item-authority-lifecycle)):
 *
 * - For **dynamic items** (mass > 0, `collectible: false`), rows MUST be sent by the current
 *   resolved owner (explicit owner, else env-authority). The server silently drops rows from
 *   non-owners per [§7.5](../../../MULTIPLAYER_SYNCH.md#75-item-authority-authorization).
 * - For **collectible items** (`collectible: true`), transform rows are bootstrap-only and are
 *   emitted by the env-authority. Collection is driven by {@link ItemCollectionEvent}
 *   first-write-wins.
 *
 * The optional `ownerClientId` field carries the server's view of authority at the moment of
 * broadcast. Receivers MUST tolerate the field being absent (legacy servers / senders).
 */
export interface ItemInstanceState {
  readonly instanceId: string;
  readonly itemName: string;
  /** World-space position `[x, y, z]`. Invariant P; live rows MUST carry this. */
  readonly pos: Vector3Serializable;
  /** Unit quaternion `[x, y, z, w]` for the mesh's local rotation. Invariant P; live rows MUST carry this. */
  readonly rot: QuaternionSerializable;
  readonly isCollected: boolean;
  readonly collectedByClientId?: string;
  /**
   * Server's view of item authority at broadcast time (MULTIPLAYER_SYNCH.md §8.2).
   * Absent/null when the item is unowned or when the server has not been upgraded.
   */
  readonly ownerClientId?: string | null;
  readonly timestamp: number;
}

export interface ItemCollectionEvent {
  readonly instanceId: string;
  readonly itemName: string;
  readonly collectedByClientId: string;
  readonly creditsEarned: number;
  readonly timestamp: number;
}

// ============================================================================
// PARTICLE EFFECT SYNCHRONIZATION
// ============================================================================

export interface ParticleEffectState {
  readonly effectId: string;
  readonly snippetName: string;
  readonly position: Vector3Serializable;
  readonly isActive: boolean;
  readonly frameIndex?: number; // For deterministic playback
  readonly ownerClientId?: string;
  readonly timestamp: number;
}

export interface EnvironmentParticleState {
  readonly name: string; // Named environment particle from config
  readonly position: Vector3Serializable;
  readonly isActive: boolean;
  readonly timestamp: number;
}

// ============================================================================
// LIGHT SYNCHRONIZATION
// ============================================================================

export type LightType = 'POINT' | 'DIRECTIONAL' | 'SPOT' | 'HEMISPHERIC' | 'RECTANGULAR_AREA';

export interface LightState {
  readonly lightId: string;
  readonly lightType: LightType;
  readonly position?: Vector3Serializable;
  readonly direction?: Vector3Serializable;
  readonly diffuseColor: ColorSerializable;
  readonly intensity: number;
  readonly specularColor?: ColorSerializable;
  readonly range?: number; // Point lights
  readonly radius?: number; // Area lights
  readonly angle?: number; // Spot lights
  readonly exponent?: number; // Spot lights
  readonly isEnabled: boolean;
  readonly timestamp: number;
}

// ============================================================================
// SKY EFFECT SYNCHRONIZATION
// ============================================================================

export type SkyEffectType = 'base' | 'heatLightning' | 'colorBlend' | 'colorTint';

export interface SkyEffectState {
  readonly effectType: SkyEffectType;
  readonly isActive: boolean;
  readonly visibility?: number; // For heat lightning: 0-1
  readonly colorModifier?: ColorSerializable;
  readonly intensity?: number;
  readonly durationMs?: number;
  readonly elapsedMs?: number;
  readonly timestamp: number;
}

// ============================================================================
// BULK UPDATE MESSAGES
// ============================================================================

/**
 * Bulk character updates from synchronizer
 */
export interface CharacterStateUpdate {
  readonly updates: readonly CharacterState[];
  readonly timestamp: number;
}

/**
 * Bulk item updates broadcast via `item-state-update`
 * ([MULTIPLAYER_SYNCH.md §6.2](../../../MULTIPLAYER_SYNCH.md#62-item-state-update)).
 *
 * Under the hybrid authority model this is NOT "synchronizer-only". Rows may originate from
 * multiple clients on the same tick — one row per dynamic `instanceId` from the current owner,
 * plus bootstrap rows for collectibles from the base synchronizer. The server applies the
 * per-row filter defined in
 * [§7.5](../../../MULTIPLAYER_SYNCH.md#75-item-authority-authorization) before broadcasting.
 * `collections` is first-write-wins: any client may submit, the server keeps the first per
 * `instanceId`.
 */
export interface ItemStateUpdate {
  readonly updates: readonly ItemInstanceState[];
  readonly collections?: readonly ItemCollectionEvent[];
  readonly timestamp: number;
}

/**
 * Bulk particle effect updates from synchronizer
 */
export interface EffectStateUpdate {
  readonly particleEffects?: readonly ParticleEffectState[];
  readonly environmentParticles?: readonly EnvironmentParticleState[];
  readonly timestamp: number;
}

/**
 * Bulk light updates from synchronizer
 */
export interface LightStateUpdate {
  readonly updates: readonly LightState[];
  readonly timestamp: number;
}

/**
 * Bulk sky effect updates from synchronizer
 */
export interface SkyEffectStateUpdate {
  readonly updates: readonly SkyEffectState[];
  readonly timestamp: number;
}

// ============================================================================
// SERVER MESSAGES
// ============================================================================

/**
 * Synchronizer changed notification
 */
export interface SynchronizerChangedMessage {
  readonly newSynchronizerId: string;
  readonly reason: 'connection' | 'disconnection' | 'failover';
  readonly timestamp: number;
}

/**
 * Connection status update (join/leave notifications)
 */
export interface ClientConnectionEvent {
  readonly eventType: 'joined' | 'left';
  readonly clientId: string;
  readonly totalClients: number;
  readonly timestamp: number;
}

/**
 * Server error message
 */
export type ServerErrorDetailValue =
  | string
  | number
  | boolean
  | null
  | readonly ServerErrorDetailValue[]
  | ServerErrorDetailObject;

// Recursive JSON-like object types need an index signature; `Record` aliases are rejected by TS 5.3 here.
export interface ServerErrorDetailObject {
  readonly [key: string]: ServerErrorDetailValue;
}

export interface ServerErrorMessage {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, ServerErrorDetailValue>>;
  readonly timestamp: number;
}

// ============================================================================
// CLIENT REQUEST TYPES
// ============================================================================

// ============================================================================
// ITEM AUTHORITY MESSAGES (MULTIPLAYER_SYNCH.md §8.6)
// ============================================================================

/** Request body for `PATCH /api/multiplayer/item-authority-claim` (§5.6). */
export interface ItemAuthorityClaim {
  readonly instanceId: string;
  readonly clientPosition?: { readonly x: number; readonly y: number; readonly z: number };
  readonly reason?: string;
  readonly timestamp: number;
}

/** Response body for the claim endpoint. */
export interface ItemAuthorityClaimResponse {
  readonly ok: true;
  readonly accepted: boolean;
  readonly instanceId: string;
  readonly ownerClientId: string | null;
  readonly currentOwnerId?: string;
  readonly serverTimestamp: number;
}

/** Request body for `PATCH /api/multiplayer/item-authority-release` (§5.7). */
export interface ItemAuthorityRelease {
  readonly instanceId: string;
  readonly reason?: string;
  readonly timestamp: number;
}

/** Response body for the release endpoint. */
export interface ItemAuthorityReleaseResponse {
  readonly ok: true;
  readonly released: boolean;
  readonly instanceId: string;
  readonly serverTimestamp: number;
}

/** SSE signal payload for `item-authority-changed` (§6.8). */
export interface ItemAuthorityChangedMessage {
  readonly instanceId: string;
  readonly previousOwnerId: string | null;
  readonly newOwnerId: string | null;
  readonly reason: 'claim' | 'release' | 'disconnect' | 'idle_timeout' | 'env_switch';
  readonly timestamp: number;
}

/**
 * SSE signal payload for `env-item-authority-changed` (§4.8). Broadcast when the env-authority
 * of an environment changes — on first join, on authority-owner disconnect/failover, and as a
 * snapshot replay on SSE open (so late joiners learn the current env-authority immediately).
 */
export interface EnvItemAuthorityChangedMessage {
  readonly environmentName: string; // §6.9 field name
  readonly newAuthorityId: string | null;
  readonly prevAuthorityId: string | null;
  readonly reason: 'arrival' | 'disconnect' | 'env_switch' | 'snapshot' | 'peer-joined';
  readonly timestamp: number;
}

/**
 * Client environment switch notification
 */
export interface ClientEnvironmentSwitchRequest {
  readonly clientId: string;
  readonly previousEnvironment: string;
  readonly newEnvironment: string;
}

/**
 * Client character switch notification
 */
export interface ClientCharacterSwitchRequest {
  readonly clientId: string;
  readonly previousCharacter: string;
  readonly newCharacter: string;
}
