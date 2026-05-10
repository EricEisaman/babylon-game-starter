# Multiplayer serialization and deserialization

This document is the complete reference for serialization, deserialization, and mesh-transform application in the multiplayer client.

> [!IMPORTANT]
> **Item paths are pose-only.** Every `ItemInstanceState` row on the wire carries exactly two transform fields — `pos` (3 floats, world-space position) and `rot` (4 floats, unit quaternion `[x,y,z,w]`) — per Invariants P and E in [`MULTIPLAYER_SYNCH.md §5.2`](MULTIPLAYER_SYNCH.md#52-item-state). Owners sample via `sampleMeshPose(mesh)`; non-owners apply via `applyPoseToMesh(mesh, pose)`. There is no `matrix`, spelled-out `position`, Euler `rotation`, `velocity`, or `scale` field on item paths. The Euler / quaternion serializers described elsewhere in this doc are used by **character sync only**.

## Contents

- [Overview](#overview)
- [Serialization formats](#serialization-formats)
- [Client-side pipeline](#client-side-pipeline)
- [Server-side validation](#server-side-validation)
- [Mesh application methods](#mesh-application-methods)
- [Common issues and solutions](#common-issues--solutions)
- [Checklist](#checklist)

---

## Overview

The multiplayer serialization system handles conversion between Babylon.js native types and network-friendly JSON primitives. The architecture ensures:

- **Type Safety:** Full TypeScript type coverage
- **Validation:** Multi-layer client + server validation
- **Efficiency:** Minimal bandwidth (arrays instead of objects)
- **Robustness:** Safe fallbacks for invalid data
- **Interpolation:** Smooth movement with LERP and SLERP

### Key Files Involved

| File | Purpose |
|------|---------|
| `src/client/utils/multiplayer_serialization.ts` | Serialization utilities & validation |
| `src/client/types/multiplayer.ts` | TypeScript interfaces & types |
| `src/client/managers/multiplayer_bootstrap.ts` | Character/item sampling and SSE routing |
| `src/client/managers/remote_peer_proxy.ts` | Remote character loading and mesh application |
| `src/client/sync/item_sync.ts` | Item state tracking & mesh application |
| `src/client/sync/configured_items_sync.ts` | Configured collectible/item sampling and apply routing |
| `src/client/sync/environment_physics_sync.ts` | Environment physics-object sampling and apply routing |
| `src/server/multiplayer/utils.go` | Server-side validation |

---

## Serialization Formats

### Vector3: [x, y, z]

**Native Type:** `BABYLON.Vector3`  
**Serializable:** `Vector3Serializable = [number, number, number]`  
**Network Size:** 3 numbers (24 bytes JSON)

```typescript
const pos = new BABYLON.Vector3(1.5, 2.3, -4.2);
const serialized = [pos.x, pos.y, pos.z];  // [1.5, 2.3, -4.2]

// Deserialization
const deserialized = new BABYLON.Vector3(serialized[0], serialized[1], serialized[2]);
// BABYLON.Vector3 { x: 1.5, y: 2.3, z: -4.2 }

// Server/client guards reject non-finite and out-of-bounds values before apply.
```

### Quaternion: [x, y, z, w]

**Native Type:** `BABYLON.Quaternion`  
**Serializable:** `QuaternionSerializable = [number, number, number, number]`  
**Network Size:** 4 numbers (32 bytes JSON)  
**Convention:** [x, y, z, w] (not w, x, y, z)

```typescript
const quat = new BABYLON.Quaternion(0.1, 0.2, 0.3, 0.95);
const serialized = [quat.x, quat.y, quat.z, quat.w];  // [0.1, 0.2, 0.3, 0.95]

// Deserialization
const deserialized = deserializeQuaternion(serialized);
// BABYLON.Quaternion { x: 0.1, y: 0.2, z: 0.3, w: 0.95 }

// Normalization (if needed)
const normalized = normalizeQuaternion([0.1, 0.2, 0.3, 0.95]);
```

### Euler Angles: [x, y, z] (radians)

**Native Type:** `BABYLON.Vector3` (used as rotation)  
**Serializable:** `Vector3Serializable = [number, number, number]`  
**Status:** Authoring/local-control representation only; multiplayer payloads use quaternions.

```typescript
// Local-only authoring/control representation
const rotation = mesh.rotation;  // BABYLON.Vector3 with Euler angles
const localEuler = [rotation.x, rotation.y, rotation.z];  // [0.1, 1.5, -0.2]

// Character/item wire paths send quaternion [x, y, z, w], not Euler triples.
```

### Color3: [r, g, b]

**Native Type:** `BABYLON.Color3`  
**Serializable:** `ColorSerializable = [number, number, number]`  
**Range:** [0, 1] per component  
**Network Size:** 3 numbers (24 bytes JSON)

```typescript
const color = new BABYLON.Color3(1.0, 0.5, 0.2);
const serialized = [color.r, color.g, color.b];  // [1.0, 0.5, 0.2]

// Server guards require each component to be finite and in [0, 1].
```

### Color4: [r, g, b, a]

**Native Type:** `BABYLON.Color4`  
**Serializable:** `ColorSerializable = [number, number, number, number]`  
**Range:** [0, 1] per component  
**Network Size:** 4 numbers (32 bytes JSON)

```typescript
const color = new BABYLON.Color4(1.0, 0.5, 0.2, 0.8);
const serialized = [color.r, color.g, color.b, color.a];  // [1.0, 0.5, 0.2, 0.8]

const deserialized = new BABYLON.Color4(serialized[0], serialized[1], serialized[2], serialized[3]);
```

---

## Client-Side Pipeline

### Phase 1: State Sampling

**Module:** `src/client/managers/multiplayer_bootstrap.ts`

```typescript
function sampleLocalState(clientId, ctrl, environmentName): CharacterState | null {
  const mesh = ctrl.getPlayerMesh();
  if (!mesh || mesh.isDisposed()) return null;

  return {
    clientId,
    environmentName,
    characterModelId: ctrl.getCharacterModelId(),
    position: [mesh.position.x, mesh.position.y, mesh.position.z],
    rotation: yawRadiansToWireQuaternion(ctrl.getFacingYawRadians()),
    velocity: [ctrl.getVelocity().x, ctrl.getVelocity().y, ctrl.getVelocity().z],
    animationState: deriveWireAnimToken(ctrl),
    animationFrame: ctrl.animationController.getNormalizedPlaybackPhase(),
    isJumping: ctrl.animationController.getCurrentRole() === 'jump',
    isBoosting: ctrl.isBoosting() || ctrl.getBoostStatus() !== 'Ready',
    boostType: deriveBoostType(ctrl),
    boostTimeRemaining: ctrl.getBoostTimeRemainingMs(),
    timestamp: Date.now()
  };
}
```

### Phase 2: Network Transfer

**Message Format:** StateUpdate (bulk updates from synchronizer)

```json
{
  "updates": [
    {
      "clientId": "client-1234567890-abc123",
      "position": [10.5, 5.2, -15.3],
      "rotation": [0, 0.707, 0, 0.707],
      "velocity": [2.1, 0.0, -1.5],
      "animationState": "walk",
      "animationFrame": 0.45,
      "isJumping": false,
      "isBoosting": false,
      "boostType": null,
      "boostTimeRemaining": 0,
      "timestamp": 1713607420000
    }
  ],
  "timestamp": 1713607420000
}
```

**Bandwidth:** ~300 bytes per character update  
**Frequency:** 50-100ms throttle = 10-20 updates/second  
**Expected BW:** 3-6 KB/s per character

### Phase 3: Reception & Application

**Module:** `src/client/managers/multiplayer_manager.ts`

```typescript
// Subscribe to signals
this.datastarClient.onSignal<CharacterStateUpdate>(
  'character-state-update',
  (data) => {
    // Broadcast to listeners
    this.emit('character-state-update', data);
  }
);

// Listeners apply to meshes
multiplayerManager.on('character-state-update', (update: CharacterStateUpdate) => {
  for (const charState of update.updates) {
    applyRemotePeerState(scene, charState, sceneManager.getCurrentEnvironment());
  }
});
```

### Phase 4: Mesh Application

**Module:** `src/client/managers/remote_peer_proxy.ts`

```typescript
function applyRemotePeerState(scene, state, currentEnvironmentName): void {
  if (state.environmentName !== currentEnvironmentName) {
    return;
  }
  // Ensures the remote avatar exists, then writes position plus quaternion rotation.
}
```

---

## Server-Side Validation

**Module:** `src/server/multiplayer/utils.go`

### Vector3 Validation

```go
// Checks: finite numbers, within 10000 unit bounds
func validateVector3(x, y, z float64) bool {
  const maxDistance = 10000.0
  distSq := x*x + y*y + z*z
  return !math.IsNaN(x) && !math.IsNaN(y) && !math.IsNaN(z) &&
    !math.IsInf(x, 0) && !math.IsInf(y, 0) && !math.IsInf(z, 0) &&
    distSq <= maxDistance*maxDistance
}
```

### Euler Angles Validation

```go
// Checks: finite numbers, within [-2π, 2π] range
func validateEulerAngles(x, y, z float64) bool {
  const maxAngle = 2 * math.Pi
  return !math.IsNaN(x) && !math.IsNaN(y) && !math.IsNaN(z) &&
    !math.IsInf(x, 0) && !math.IsInf(y, 0) && !math.IsInf(z, 0) &&
    math.Abs(x) <= maxAngle && math.Abs(y) <= maxAngle && math.Abs(z) <= maxAngle
}
```

### Quaternion Validation

```go
// Checks: finite numbers, normalized to length ≈ 1.0 (tolerance ±0.01)
func validateQuaternion(x, y, z, w float64) bool {
  if math.IsNaN(x) || math.IsNaN(y) || math.IsNaN(z) || math.IsNaN(w) {
    return false
  }
  if math.IsInf(x, 0) || math.IsInf(y, 0) || math.IsInf(z, 0) || math.IsInf(w, 0) {
    return false
  }

  lengthSq := x*x + y*y + z*z + w*w
  const tolerance = 0.01
  return math.Abs(lengthSq-1.0) < tolerance
}
```

### Color Validation

```go
// Checks: 3-4 components, all in [0, 1], finite
func validateColor(components []float64) bool {
  if len(components) < 3 || len(components) > 4 {
    return false
  }
  for _, c := range components {
    if math.IsNaN(c) || math.IsInf(c, 0) || c < 0 || c > 1 {
      return false
    }
  }
  return true
}
```

### Timestamp Validation

```go
// Checks: received timestamp is within 30 seconds of server time
func validateTimestamp(timestamp int64) bool {
  now := time.Now().UnixMilli()
  diff := now - timestamp
  return diff >= 0 && diff < 30000
}
```

---

## Mesh Application Methods

### Character Mesh Application

**File:** `src/client/managers/remote_peer_proxy.ts`

```typescript
/**
 * Complete character state application
 * 
 * What gets applied:
 * - Position (direct)
 * - Rotation (quaternion)
 * - Remote avatar visibility scoped by environment
 * 
 * What doesn't get applied directly:
 * - Velocity (handled by physics controller)
 */
function applyRemotePeerState(
  scene: BABYLON.Scene,
  state: CharacterState,
  currentEnvironmentName: string
): void {
  // Ensures the peer mesh exists, then applies `position` plus quaternion `rotation`.
}
```

**Expected Result:**

```text
Before: remoteMesh.position = [0, 0, 0], remoteMesh.rotationQuaternion = identity
After:  remoteMesh.position = [10.5, 5.2, -15.3], remoteMesh.rotationQuaternion = state.rotation
```

### Item Mesh Application

**File:** `src/client/sync/item_sync.ts`

```typescript
/**
 * Complete item state application (Invariants P and E).
 *
 * Transform application is pose-only: the row carries two fields, `pos`
 * (3-float world-space position) and `rot` (4-float unit quaternion
 * `[x,y,z,w]`). We write them directly onto `mesh.position` and
 * `mesh.rotationQuaternion`; Havok's pre-step (`disablePreStep = false`,
 * the Babylon default) copies mesh → body on the next tick for kinematic
 * replicas. We NEVER write to `mesh.rotation` (Euler), never replicate
 * velocity, and never replicate `mesh.scaling` — the receiver's local
 * scale (including the negative-axis flips applied in
 * `createCollectibleInstance` for GLB re-orientation) is the single
 * source of truth for scale.
 *
 * Collection status:
 * - isCollected: true  → mesh.isVisible = false, mesh.setEnabled(false)
 * - isCollected: false → mesh.isVisible = true, mesh.setEnabled(true)
 */
static applyRemoteItemState(
  itemMesh: BABYLON.AbstractMesh,
  state: ItemInstanceState
): void {
  if (!itemMesh) return;

  if (!state.isCollected) {
    // Pose-only apply — write directly onto the mesh.
    //   - Position: mesh.position.set(pos[0], pos[1], pos[2])
    //   - Rotation: mesh.rotationQuaternion.set(rot[0..3])
    //   - Scale:    untouched (local config value on every client).
    applyPoseToMesh(itemMesh, { pos: state.pos, rot: state.rot });
  }

  try {
    if (state.isCollected) {
      itemMesh.isVisible = false;
      itemMesh.setEnabled(false);
    } else {
      itemMesh.isVisible = true;
      itemMesh.setEnabled(true);
    }
  } catch (e) {
    console.warn('[ItemSync] Failed to apply collection status:', e);
  }
}
```

### Light / Effect / Sky Channels

The Go server and `MultiplayerManager` still expose effects, lights, and sky SSE channels.
The current client does not publish or apply those channels. Treat them as extension points:
add a focused sampler/apply module and wire it through `multiplayer_bootstrap.ts` before
documenting them as active runtime behavior.

---

## Common Issues & Solutions

### Issue 1: NaN/Infinity Values in Transforms

**Symptom:** Mesh disappears or renders at world origin

**Cause:** 
```javascript
// Bad: Physics calculations produce NaN
velocity.y += Infinity;
position.x = 0 / 0;  // NaN

// Network sent these invalid values
```

**Solution:**
```typescript
// Validation in serialization
function serializeSafeVector3(v: BABYLON.Vector3): Vector3Serializable {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
    console.warn('Invalid vector:', v);
    return [0, 0, 0];  // Safe fallback
  }
  return [v.x, v.y, v.z];
}

// Server-side validation
if (!validateVector3(x, y, z)) {
  http.Error(w, "Invalid position", http.StatusBadRequest);
  return;
}
```

### Issue 2: Gimbal Lock in Euler Angles

**Symptom:** Character rotation jerks or spins unexpectedly

**Cause:**
```javascript
// Euler angles can flip 180° discontinuously
rotation = [Math.PI/2, angle, 0];  // Lock! X=90° causes gimbal lock
```

**Solution:**
```typescript
// Use quaternion interpolation for smooth rotations
const from = yawRadiansToWireQuaternion(0.1);
const to = yawRadiansToWireQuaternion(0.15);
const interpolated = BABYLON.Quaternion.Slerp(
  deserializeQuaternion(from),
  deserializeQuaternion(to),
  0.5
);

// Detect problematic angles
private hasGimbalLock(euler: Vector3Serializable): boolean {
  return Math.abs(euler[0] - Math.PI/2) < 0.01 ||
         Math.abs(euler[0] + Math.PI/2) < 0.01;
}
```

### Issue 3: Out-of-Bounds Positions

**Symptom:** Object thrown to world edge (10000+ units)

**Cause:**
```javascript
// Physics calculation error sends mesh far away
position.x = 999999.123;

// Network sent without validation
```

**Solution:**
```typescript
// Client-side clamping
function clampWorldPosition(pos: Vector3Serializable, maxDist = 10000): Vector3Serializable {
  const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
  if (dist > maxDist) {
    const scale = maxDist / dist;
    return [pos[0] * scale, pos[1] * scale, pos[2] * scale];
  }
  return pos;
}

// Server-side rejection
if !validateVector3(state.Position.X, state.Position.Y, state.Position.Z) {
  return fmt.Errorf("position out of bounds")
}
```

### Issue 4: Denormalized Quaternions

**Symptom:** Rotations accumulate error over time

**Cause:**
```javascript
// Multiple interpolations without renormalization
let q = [0.1, 0.2, 0.3, 0.9];  // length ≈ 0.999
q = slerp(q, other, 0.5);      // length ≈ 0.998
q = slerp(q, other2, 0.5);     // length ≈ 0.997
// Eventually length drifts significantly
```

**Solution:**
```typescript
// Normalize after deserialization
function deserializeNormalizedQuaternion(q: QuaternionSerializable): BABYLON.Quaternion {
  const normalized = normalizeQuaternion(q);
  return new BABYLON.Quaternion(normalized[0], normalized[1], normalized[2], normalized[3]);
}

// Periodic renormalization
const lengthSq = storedQuat[0] ** 2 + storedQuat[1] ** 2 + storedQuat[2] ** 2 + storedQuat[3] ** 2;
if (Math.abs(lengthSq - 1) >= 0.01) {
  storedQuat = normalizeQuaternion(storedQuat);
}
```

### Issue 5: Animation Frame Mismatch

**Symptom:** Remote characters animation out of sync

**Cause:**
```javascript
// Client sends animationFrame: 0.45
// But remote doesn't have animation group reference
```

**Solution:**
```typescript
// Remote peer application writes transform state; animation state/frame are
// carried on CharacterState for higher-level remote avatar handling.

// Higher-level integration (TODO):
multiplayerManager.on('character-state-update', (update) => {
  for (const state of update.updates) {
    // Find animation group for remote character
    const animGroup = remoteCharacter.getAnimationGroup(state.animationState);
    
    // Seek to frame position
    if (animGroup) {
      animGroup.setWeightedSpeed(speed);
      animGroup.goToFrame(state.animationFrame * animGroup.to);
    }
  }
});
```

---

## Checklist

### Serialization completeness

- [x] Vector3 serialization: `[x, y, z]`
- [x] Quaternion serialization: `[x, y, z, w]`
- [x] Quaternion rotation serialization: `[x, y, z, w]`
- [x] Color3 serialization: `[r, g, b]`
- [x] Color4 serialization: `[r, g, b, a]`
- [x] CharacterState includes all fields
- [x] ItemInstanceState includes all fields
- [x] LightState includes all fields
- [x] ParticleEffectState includes all fields
- [x] SkyEffectState includes all fields

### Deserialization safety

- [x] Vector3 deserialization with bounds check
- [x] Quaternion deserialization with normalization
- [x] Quaternion deserialization with normalization
- [x] Color deserialization with component validation
- [x] Timestamp validation (within 30s)
- [x] Animation state validation
- [x] Boost type validation

### Mesh application

- [x] Character position application
- [x] Character rotation application (quaternion support)
- [x] Item position application
- [x] Item rotation application
- [x] Item collection status application
- [x] Light intensity application
- [x] Light color application
- [x] Light position/direction application
- [x] Light type-specific properties applied

### Error handling

- [x] Try-catch around all mesh assignments
- [x] Validation before network transmission
- [x] Server-side validation with error responses
- [x] Logging for failed applications
- [x] Safe fallbacks for invalid data

### Validation layers

**Client-Side (Pre-Network):**
- [x] Finite-number checks before writing local state
- [x] Bounds checks in wire guards and server validation
- [x] Color component range checks for dormant color channels
- [x] Quaternion normalization through `normalizeQuaternion()`

**Server-Side (Post-Network):**
- [x] `validateVector3()` - Finite + bounds
- [x] `validateEulerAngles()` - Range + finite
- [x] `validateQuaternion()` - Normalization + finite
- [x] `validateColor()` - Component + range
- [x] `validateTimestamp()` - Recency check
- [x] `validateAnimationState()` - Enum check
- [x] `validateLightType()` - Enum check
- [x] `validateBoostType()` - Enum check

### Performance optimization

- [x] Throttled state sampling (50-100ms)
- [x] Significant change detection (position, rotation, animation)
- [x] Bulk update messages (not per-entity)
- [x] Array serialization (minimal JSON overhead)
- [x] Direct mesh assignment (no intermediate objects)

### Type safety

- [x] `Vector3Serializable` type defined
- [x] `QuaternionSerializable` type defined
- [x] `ColorSerializable` type defined
- [x] All state interfaces readonly
- [x] TypeScript strict mode compatible
- [x] No `any` types in serialization code

---

## Integration

Multiplayer integration is wired in [`src/client/managers/multiplayer_bootstrap.ts`](src/client/managers/multiplayer_bootstrap.ts), which subscribes to SSE signals and routes remote state into active sync/apply helpers. Extending multiplayer state typically means adding a focused `src/client/sync/` module with its own `sampleState` / `applyRemoteState` pair, or extending an existing module and adding a listener inside the bootstrap. See [`MULTIPLAYER.md`](MULTIPLAYER.md#how-the-client-is-wired) for the end-to-end picture.

## References

- [Babylon.js `Quaternion` API](https://doc.babylonjs.com/typedoc/classes/BABYLON.Quaternion)
- [Euler angles](https://en.wikipedia.org/wiki/Euler_angles)
- [Gimbal lock](https://en.wikipedia.org/wiki/Gimbal_lock)
- [SLERP](https://en.wikipedia.org/wiki/Slerp)
- [Snapshot compression (Gaffer on Games)](https://gafferongames.com/post/snapshot_compression/)

## Troubleshooting

For issues with serialization or deserialization:

1. Check server logs for validation failures ([`src/server/multiplayer/utils.go`](src/server/multiplayer/utils.go)).
2. Check the browser console for application failures — the `[ItemSync]`, `[RemotePeerProxy]`, and multiplayer manager prefixes are the relevant ones.
3. Confirm timestamps are within 30 seconds of server time; the server rejects older payloads.
4. Confirm rotations are in **radians**, not degrees.
5. Confirm item payloads carry `{ pos, rot }` only — no `matrix`, `rotation` (Euler), `velocity`, or `scale` on the item wire (Invariant P).
