// ============================================================================
// MULTIPLAYER BOOTSTRAP — join session, send sync (leader), show remote proxies
// ============================================================================

import { ASSETS } from '../config/assets';
import { CONFIG } from '../config/game_config';
import {
  applyRemoteConfiguredCollections,
  applyRemoteConfiguredItemState,
  envScopedInstanceId,
  parseEnvScopedInstanceId,
  sampleConfiguredItems
} from '../sync/configured_items_sync';
import {
  ENV_PHYSICS_ITEM_MARKER,
  applyRemoteEnvironmentPhysicsState,
  makeEnvironmentPhysicsInstanceId,
  meshNameFromEnvironmentInstanceId,
  sampleEnvironmentPhysicsStates,
  setEnvironmentPhysicsMeshKinematic
} from '../sync/environment_physics_sync';
import { ItemAuthorityTracker } from '../sync/item_authority_tracker';
import { ItemSync } from '../sync/item_sync';
import { coerceCharacterState, coerceItemInstanceState } from '../sync/multiplayer_wire_guards';
import { ProximityClaimObserver, type ProximityItem } from '../sync/proximity_claim_observer';
import {
  deriveWireAnimToken,
  yawRadiansToWireQuaternion
} from '../utils/multiplayer_serialization';

import { CollectiblesManager } from './collectibles_manager';
import { getMultiplayerManager } from './multiplayer_manager';
import {
  applyRemotePeerState,
  refreshRemotePeerVisibilityForLocalEnvironment,
  removeRemotePeer
} from './remote_peer_proxy';

import type { SceneManager } from './scene_manager';
import type { CharacterController } from '../controllers/character_controller';
import type {
  CharacterState,
  CharacterStateUpdate,
  EnvItemAuthorityChangedMessage,
  ItemAuthorityChangedMessage,
  ItemCollectionEvent,
  ItemInstanceState,
  ItemStateUpdate
} from '../types/multiplayer';

const SYNC_INTERVAL_MS = 80;
const WORLD_PHYS_SYNC_MS = 120;

function vec3FromMesh(m: BABYLON.AbstractMesh): [number, number, number] {
  const p = m.position;
  return [p.x, p.y, p.z];
}

function vel3(ctrl: CharacterController): [number, number, number] {
  const v = ctrl.getVelocity();
  return [v.x, v.y, v.z];
}

function deriveBoostType(ctrl: CharacterController): 'superJump' | 'invisibility' | undefined {
  const st = ctrl.getBoostStatus();
  if (st.includes('Super Jump')) {
    return 'superJump';
  }
  if (st.includes('Invisibility')) {
    return 'invisibility';
  }
  return undefined;
}

function sampleLocalState(
  clientId: string,
  ctrl: CharacterController,
  environmentName: string
): CharacterState | null {
  const mesh = ctrl.getPlayerMesh();
  if (!mesh || mesh.isDisposed()) {
    return null;
  }
  const characterModelId = ctrl.getCharacterModelId().trim();
  if (!characterModelId) {
    return null;
  }
  return {
    clientId,
    environmentName: environmentName.trim(),
    characterModelId,
    position: vec3FromMesh(mesh),
    rotation: yawRadiansToWireQuaternion(ctrl.getFacingYawRadians()),
    velocity: vel3(ctrl),
    /** Wire token mirrors the locally-played clip — see {@link deriveWireAnimToken} for rationale. */
    animationState: deriveWireAnimToken(ctrl),
    animationFrame: ctrl.animationController.getNormalizedPlaybackPhase(),
    isJumping: ctrl.animationController.getCurrentRole() === 'jump',
    isBoosting: ctrl.isBoosting() || ctrl.getBoostStatus() !== 'Ready',
    boostType: deriveBoostType(ctrl),
    boostTimeRemaining: ctrl.getBoostTimeRemainingMs(),
    timestamp: Date.now()
  };
}

async function waitForPlayableMesh(ctrl: CharacterController): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const m = ctrl.getPlayerMesh();
    if (m && !m.isDisposed() && m.name === 'player') {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * After the default environment + async character GLB load, joins multiplayer (if enabled),
 * streams each tab's local character pose (server broadcasts to everyone), and draws other clients as proxies.
 */
export async function initMultiplayerAfterCharacterReady(
  sceneManager: SceneManager,
  environmentName: string
): Promise<void> {
  if (!CONFIG.MULTIPLAYER.ENABLED) {
    return;
  }

  const ctrl = sceneManager.getCharacterController();
  if (!ctrl) {
    return;
  }

  await waitForPlayableMesh(ctrl);

  const defaultChar = ASSETS.CHARACTERS[0];
  const trimmedModelId = ctrl.getCharacterModelId().trim();
  const characterModelId = trimmedModelId !== '' ? trimmedModelId : (defaultChar?.name ?? 'player');

  const mp = getMultiplayerManager();
  const scene = sceneManager.getScene();

  /** Subscribe before join so SSE snapshot(s) sent on connect are not dropped. */
  const unsubState = mp.on('character-state-update', (msg: CharacterStateUpdate) => {
    const myId = mp.getClientID();
    if (!myId) {
      return;
    }
    if (!msg?.updates?.length) {
      return;
    }
    for (const rawSt of msg.updates) {
      const st = coerceCharacterState(rawSt);
      if (!st || st.clientId === myId) {
        continue;
      }
      applyRemotePeerState(scene, st, sceneManager.getCurrentEnvironment());
    }
  });

  const unsubLeft = mp.on('client-left', (event) => {
    const id = event.clientId;
    if (id) {
      removeRemotePeer(id);
    }
  });

  const authorityTracker = new ItemAuthorityTracker();

  // ---- Per-item motion-type flip (hoisted pre-join for listener use) ----
  //
  // MULTIPLAYER_SYNCH.md §4 invariant "DYNAMIC only on current owner's client, kinematic
  // everywhere else". This helper is used by (1) the ItemAuthorityTracker.onChange subscriber
  // post-join to flip motion types on explicit-owner transitions, (2) the `env-item-authority-
  // changed` listener registered BEFORE join to re-seed motion types for an env-authority
  // transition (including the snapshot replay on SSE open), and (3) directly by the
  // `item-authority-changed` listener for idempotent-safe re-derivation (Fix 6).
  const applyMotionTypeForInstance = (instanceId: string, dynamic: boolean): void => {
    const envNow = sceneManager.getCurrentEnvironment();
    const parsed = parseEnvScopedInstanceId(instanceId);
    if (parsed && parsed.envName === envNow) {
      CollectiblesManager.setItemKinematic(parsed.localId, !dynamic);
      return;
    }
    const meshName = meshNameFromEnvironmentInstanceId(envNow, instanceId);
    if (meshName) {
      setEnvironmentPhysicsMeshKinematic(scene, meshName, !dynamic);
    }
  };

  // Defense-in-depth: primary motion-type assignment happens at spawn time in
  // `CollectiblesManager.createCollectibleInstance` / `createPhysicsInstance` via the
  // `resolveInitialOwnership` callback registered below (Invariant P —
  // MULTIPLAYER_SYNCH.md §4.8). This helper still runs on SSE-open authority snapshot,
  // env load/switch, and right after `setSelfClientId` to catch items whose authority
  // could not be resolved at spawn (late-arriving snapshots, items created before the
  // tracker was ready, env re-entries).
  const seedMotionTypesForEnv = (envName: string): void => {
    if (!envName || !sceneManager.isEnvironmentLoaded()) {
      return;
    }
    for (const [localId] of CollectiblesManager.getPhysicsItemEntries()) {
      const instanceId = envScopedInstanceId(envName, localId);
      const dyn = authorityTracker.isOwnedBySelf(instanceId);
      CollectiblesManager.setItemKinematic(localId, !dyn);
    }
    // Fix 8 (seed collectibles). MULTIPLAYER_SYNCH.md §6.2 rule 4 "ANIMATED-default-
    // then-promote" applies to EVERY massful physics item in the env, including
    // collectibles (presents). `CollectiblesManager` tracks collectibles and
    // non-collectible physics items in two separate maps; the loop above only walks
    // the latter. Without this second loop, presents get the ANIMATED safety belt
    // in `createCollectibleInstance` but nothing ever promotes them to DYNAMIC on
    // the resolved owner, leaving them frozen in the air forever. Parity with
    // `configured_items_sync.ts` which already walks both iterators when sampling.
    //
    // Massless guard: a mass=0 collectible body is STATIC, and promoting STATIC to
    // DYNAMIC in Havok is meaningless (no mass = no integration). The physics-items
    // loop above lacks this guard in practice because every registered physics item
    // has mass > 0, but collectibles can legitimately be massless pickups, so we
    // filter on the current motion type being ANIMATED or DYNAMIC — i.e., a body
    // that went through the ANIMATED-default safety belt and is eligible for the
    // authority-driven flip.
    for (const [localId, entry] of CollectiblesManager.getCollectibleEntries()) {
      const phys = entry.body?.body;
      if (!phys || phys.isDisposed) {
        continue;
      }
      const current = phys.getMotionType();
      if (
        current !== BABYLON.PhysicsMotionType.ANIMATED &&
        current !== BABYLON.PhysicsMotionType.DYNAMIC
      ) {
        continue;
      }
      const instanceId = envScopedInstanceId(envName, localId);
      const dyn = authorityTracker.isOwnedBySelf(instanceId);
      CollectiblesManager.setItemKinematic(localId, !dyn);
    }
    const envCfg = ASSETS.ENVIRONMENTS.find((e) => e.name === envName);
    if (envCfg) {
      for (const po of envCfg.physicsObjects) {
        if (po.mass <= 0 || !po.name) {
          continue;
        }
        const instanceId = makeEnvironmentPhysicsInstanceId(envName, po.name);
        const dyn = authorityTracker.isOwnedBySelf(instanceId);
        setEnvironmentPhysicsMeshKinematic(scene, po.name, !dyn);
      }
    }
  };

  // Merged item-state dictionary: instanceId → most recent ItemInstanceState received.
  // Using a Map rather than storing the last raw ItemStateUpdate message ensures that
  // switching environments always re-applies the FULL accumulated position for every
  // known item, not just the items present in the most recent (often 1-2 item) dirty
  // broadcast. Without this, a 9-item bootstrap followed by live 2-item partial updates
  // would leave 7 items at their scene spawn heights on environment entry.
  const knownItemStates = new Map<string, ItemInstanceState>();

  // Build a synthetic ItemStateUpdate from all currently known item states.
  // Used when re-applying state on env switch / items-ready / auth-changed.
  const buildFullSnapshot = (): ItemStateUpdate => ({
    updates: Array.from(knownItemStates.values()),
    collections: [],
    timestamp: Date.now()
  });

  const applyItemSnapshot = (msg: ItemStateUpdate): void => {
    const envName = sceneManager.getCurrentEnvironment();
    const selfId = authorityTracker.getSelfClientId();
    if (msg.updates?.length) {
      for (const rawSt of msg.updates) {
        const st = coerceItemInstanceState(rawSt);
        if (!st) {
          continue;
        }
        // Fix 4 (defence-in-depth self-drop). Even if the publish gate ever admits a row
        // this client authored, the server stamps `ownerClientId` onto every accepted
        // update (handlers.go handleItemStateUpdate). Dropping server-stamped self rows
        // prevents the broken feedback loop where a kinematic body keeps re-applying its
        // own sampled transform back onto itself.
        if (selfId && st.ownerClientId === selfId) {
          continue;
        }
        if (authorityTracker.isOwnedBySelf(st.instanceId)) {
          continue;
        }
        if (st.itemName === ENV_PHYSICS_ITEM_MARKER) {
          applyRemoteEnvironmentPhysicsState(scene, envName, st);
        } else {
          applyRemoteConfiguredItemState(envName, st);
        }
      }
    }
    if (msg.collections?.length) {
      applyRemoteConfiguredCollections(envName, msg.collections);
    }
  };

  const unsubItems = mp.on('item-state-update', (msg: ItemStateUpdate) => {
    if (!msg || (!msg.updates?.length && !msg.collections?.length)) {
      return;
    }
    if (msg.updates?.length) {
      for (const rawSt of msg.updates) {
        const st = coerceItemInstanceState(rawSt);
        if (st) {
          knownItemStates.set(st.instanceId, st);
        }
      }
    }
    applyItemSnapshot(msg);
    // MULTIPLAYER_SYNCH.md §5.2.2 rule 4 AOI-enter bootstrap: once the first
    // item-state-update for the current env has been absorbed, treat the env's
    // authority snapshot as applied for the purposes of the publish gate. This
    // future-proofs the client for the freshness-matrix implementation and also
    // relaxes the gate for the base synchronizer's "unowned + synchronizer"
    // fallback once a steady state is reached.
    const envNow = sceneManager.getCurrentEnvironment();
    if (envNow) {
      authorityTracker.markSnapshotApplied(envNow);
    }
  });

  const unsubAuthority = mp.on('item-authority-changed', (msg: ItemAuthorityChangedMessage) => {
    if (!msg?.instanceId) {
      return;
    }
    authorityTracker.applyAuthorityChange(msg);
    // §6.2 rule 5 trigger c (partial): each landed item-authority-changed
    // contributes to the authority snapshot for its env. For items we can parse
    // an env from, mark that env's snapshot as applied so the publish gate
    // relaxes as soon as the server has had a chance to replay its itemOwners
    // map on SSE open.
    const parsed = parseEnvScopedInstanceId(msg.instanceId);
    if (parsed?.envName) {
      authorityTracker.markSnapshotApplied(parsed.envName);
    }
    // Fix 6 (idempotent motion re-apply). `applyAuthorityChange` short-circuits
    // when the resolved state has not transitioned (e.g. snapshot replays that
    // re-state an already-known owner). The onChange listener therefore does
    // NOT fire in those cases, so we re-derive the motion type here
    // unconditionally to keep the DYNAMIC-only-on-owner invariant robust
    // against duplicate or out-of-order authority signals.
    if (authorityTracker.getSelfClientId()) {
      const selfOwnsNow = authorityTracker.isOwnedBySelf(msg.instanceId);
      applyMotionTypeForInstance(msg.instanceId, selfOwnsNow);
      // Fix 8 (post-transition pose re-apply). When authority moves off self,
      // the local DYNAMIC body may have simulated the item to a pose that
      // diverges from the authority's pose. The new owner's next sample will
      // only broadcast if it trips the server's 5 mm / 0.5° dirty filter
      // (handlers.go `isDirtyRow`), so a resting item stays stuck at the
      // diverged local pose unless we re-apply the last known remote snapshot
      // here. Mirrors what `env-item-authority-changed` already does via
      // `applyItemSnapshot(buildFullSnapshot())` for the whole env.
      if (!selfOwnsNow) {
        const last = knownItemStates.get(msg.instanceId);
        if (last) {
          applyItemSnapshot({
            updates: [last],
            collections: [],
            timestamp: Date.now()
          });
        }
      }
    }
  });

  // Fix 2 (pre-join env-auth listener). MULTIPLAYER_SYNCH.md §6.2 rule 5 trigger b:
  // `env-item-authority-changed` must be captured on SSE open. The server emits it
  // via `pushAuthoritySnapshotToSession` during the `mp.join()` handshake, so this
  // listener MUST be attached before `await mp.join()` below — the previous post-join
  // placement caused the snapshot replay to be dropped, leaving every client with an
  // empty envAuthority map and breaking the tier-2 owner resolution.
  const unsubEnvAuthority = mp.on(
    'env-item-authority-changed',
    (msg: EnvItemAuthorityChangedMessage) => {
      const envName = msg?.environmentName; // §6.9 field name
      if (!envName) {
        return;
      }
      const newAuth = msg?.newAuthorityId ?? null;
      authorityTracker.applyEnvAuthorityChange(envName, newAuth);
      authorityTracker.markSnapshotApplied(envName);
      // Only re-seed motion types once self identity is known; until then the tier-2
      // resolution in `isOwnedBySelf` cannot distinguish "self is env-auth" from
      // "peer is env-auth". The bootstrap calls seedMotionTypesForEnv explicitly
      // after `setSelfClientId` (Fix 3) to cover the snapshot-replay-arrived-first
      // race.
      if (authorityTracker.getSelfClientId() && envName === sceneManager.getCurrentEnvironment()) {
        seedMotionTypesForEnv(envName);
        // Re-apply the last received item snapshot now that items have been set to their
        // correct motion types. This covers the race where the item-transform bootstrap
        // arrived BEFORE the auth snapshot (server now sends auth first, but this is
        // defense-in-depth): with the mesh-direct apply (§B.9), the mesh write itself
        // always succeeds, but on a still-DYNAMIC body the post-step would overwrite it
        // with simulated position. Re-applying after seedMotionTypesForEnv flips items
        // to ANIMATED ensures the authoritative positions stick.
        if (knownItemStates.size > 0) {
          applyItemSnapshot(buildFullSnapshot());
        }
      }
    }
  );

  try {
    await mp.join(environmentName, characterModelId);
  } catch (e) {
    console.warn('[MultiplayerBootstrap] join skipped or failed:', e);
    unsubState();
    unsubLeft();
    unsubItems();
    unsubAuthority();
    unsubEnvAuthority();
    return;
  }

  const clientId = mp.getClientID();
  if (!clientId) {
    unsubState();
    unsubLeft();
    unsubItems();
    unsubAuthority();
    unsubEnvAuthority();
    return;
  }

  authorityTracker.setSelfClientId(clientId);

  // Invariant P (MULTIPLAYER_SYNCH.md §4.8 "pre-scene ownership"): register the
  // tracker lookup that `CollectiblesManager.createCollectibleInstance` /
  // `createPhysicsInstance` consult at spawn time so each massful item is born in its
  // final motion type. `seedMotionTypesForEnv` + `onEnvironmentItemsReady` remain as
  // defense-in-depth for unresolved / late-arriving authority.
  CollectiblesManager.resolveInitialOwnership = (envScopedInstanceId: string): boolean | null => {
    if (!authorityTracker.getSelfClientId()) {
      return null;
    }
    const parsed = parseEnvScopedInstanceId(envScopedInstanceId);
    if (!parsed) {
      return null;
    }
    if (!authorityTracker.hasSnapshotAppliedFor(parsed.envName)) {
      return null;
    }
    return authorityTracker.isOwnedBySelf(envScopedInstanceId);
  };

  // MULTIPLAYER_SYNCH.md §4.5 SSE-open ordering: `datastarClient.connect()` resolves
  // on the SSE `onopen` callback — i.e. the moment the HTTP connection is established,
  // which is BEFORE any SSE message events are delivered. The browser's event loop
  // processes `onopen` synchronously (as a Promise microtask chain), and SSE message
  // events are queued as separate tasks. Therefore `env-item-authority-changed` from
  // `pushAuthoritySnapshotToSession` has NOT yet been processed when execution reaches
  // here.
  //
  // Consequence: `authorityTracker.envAuthority` is still empty. Calling
  // `seedMotionTypesForEnv` at this point would compute `isOwnedBySelf = false` for
  // every item (because the env-authority tier cannot resolve without `envAuthority`
  // being populated), silently kinematising every item — including those owned by the
  // local client as env-authority — at their spawn/scatter positions. Those scatter
  // positions are then published as dirty rows and cached by the server. When a late
  // joiner's bootstrap snapshot is served from that cache they receive the scatter
  // positions instead of the settled floor positions.
  //
  // Fix: only call `seedMotionTypesForEnv` / `applyItemSnapshot` here when
  // `envAuthority` is already populated for this env (i.e. the SSE snapshot arrived
  // before mp.join() resolved — unlikely in practice, but technically possible on a
  // very fast connection). When auth is not yet known, the `env-item-authority-changed`
  // listener (registered before `mp.join()`, see Fix 2 comment above) will call
  // `seedMotionTypesForEnv` with correct authority as soon as the SSE event arrives,
  // which happens in the very next event-loop task after this synchronous block exits.
  //
  // markSnapshotApplied is still called immediately so the "unowned + base-synchronizer"
  // publish-gate fallback (§6.2 rule 5 trigger c) can fire for environments whose
  // authority is legitimately absent from the server (no other client present).
  const envOnJoin = sceneManager.getCurrentEnvironment();
  if (envOnJoin) {
    authorityTracker.markSnapshotApplied(envOnJoin);
    if (
      sceneManager.isEnvironmentLoaded() &&
      authorityTracker.getEnvAuthority(envOnJoin) !== null
    ) {
      // Auth is already resolved (rare fast-path). Seed motion types and apply any
      // buffered snapshot now so items land in their correct kinematic/dynamic state
      // without waiting for the next event-loop task.
      seedMotionTypesForEnv(envOnJoin);
      if (knownItemStates.size > 0) {
        applyItemSnapshot(buildFullSnapshot());
      }
    }
    // If env authority is NOT yet known: items remain in their default DYNAMIC state
    // (spawn physics). The `env-item-authority-changed` listener handles the seed
    // correctly once the SSE event arrives, guaranteeing the env-authority's items
    // stay DYNAMIC and non-owner items are correctly kinematised before any
    // mesh-direct apply lands (MULTIPLAYER_SYNCH.md Appendix B.2 invariant 1
    // "seed-before-apply" and §B.9 for the apply primitive itself).
  }

  const worldPhysicsItemSync = new ItemSync(WORLD_PHYS_SYNC_MS);
  let lastTrackedEnvironment = sceneManager.getCurrentEnvironment();
  let lastEnvironmentLoaded = sceneManager.isEnvironmentLoaded();
  /** When local scene changes only — remote proxies show/hide via cached peer state. */
  let lastPeerVisibilityEnv = '';

  /**
   * Feed every local collection into the world ItemSync so the broadcast includes
   * `collections` + keeps the item's `isCollected` flag true in its next updates snapshot.
   * Collections are first-write-wins on the server, so any client may publish — we do not
   * gate on base-synchronizer role here.
   */
  CollectiblesManager.onItemCollected = (
    localId: string,
    itemName: string,
    creditsEarned: number
  ): void => {
    const envName = sceneManager.getCurrentEnvironment();
    if (!envName) {
      return;
    }
    const instanceId = envScopedInstanceId(envName, localId);
    const ev: ItemCollectionEvent = {
      instanceId,
      itemName,
      collectedByClientId: clientId,
      creditsEarned,
      timestamp: Date.now()
    };
    worldPhysicsItemSync.recordCollection(ev);
    worldPhysicsItemSync.markItemCollected(instanceId, true);
  };

  const unsubSyncChanged = mp.on('synchronizer-changed', () => {
    if (mp.isSynchronizer()) {
      worldPhysicsItemSync.clearAll();
    }
  });

  // `applyMotionTypeForInstance` is hoisted above the pre-join listeners so Fix 6 can
  // call it from the `item-authority-changed` listener registered before `mp.join()`.
  // The tracker.onChange subscriber here handles the transition case (owner actually
  // flipped); the idempotent-snapshot safety-net lives in the pre-join listener.
  const unsubAuthorityChange = authorityTracker.onChange((evt) => {
    applyMotionTypeForInstance(evt.instanceId, evt.selfOwnsNow);
    // When authority moves away from self, drop any pending publish row so the
    // next throttle window does not replay a stale pose the server will reject.
    // `includeRow` would also gate this on the next sample tick, but evicting
    // eagerly avoids one extra "unauthorized row" round-trip and makes the
    // ItemSync map converge to exactly-what-we-may-publish at transition time.
    if (evt.selfOwnedBefore && !evt.selfOwnsNow) {
      worldPhysicsItemSync.removeItemState(evt.instanceId);
    }
  });

  // ---- Proximity claim observer ----
  const claimCfg = CONFIG.MULTIPLAYER;
  const proximity = new ProximityClaimObserver(mp, authorityTracker, {
    claimRadiusMeters: claimCfg.CLAIM_RADIUS_METERS,
    claimGraceMs: claimCfg.CLAIM_GRACE_MS,
    getCharacterPosition: () => {
      const m = ctrl.getPlayerMesh();
      return m && !m.isDisposed() ? m.position : null;
    },
    shouldPause: () => !sceneManager.isEnvironmentLoaded()
  });

  const rebuildProximityItems = (envName: string): void => {
    if (!envName || !sceneManager.isEnvironmentLoaded()) {
      proximity.clear();
      return;
    }
    const items: ProximityItem[] = [];

    for (const [localId, entry] of CollectiblesManager.getPhysicsItemEntries()) {
      const instanceId = envScopedInstanceId(envName, localId);
      items.push({
        instanceId,
        getPosition: () => {
          const m = entry.mesh;
          if (!m || m.isDisposed()) {
            return null;
          }
          try {
            return m.getAbsolutePosition ? m.getAbsolutePosition() : m.absolutePosition;
          } catch {
            return null;
          }
        }
      });
    }

    const envCfg = ASSETS.ENVIRONMENTS.find((e) => e.name === envName);
    if (envCfg) {
      for (const po of envCfg.physicsObjects) {
        if (po.mass <= 0 || !po.name || po.name.trim() === '') {
          continue;
        }
        const instanceId = makeEnvironmentPhysicsInstanceId(envName, po.name);
        items.push({
          instanceId,
          getPosition: () => {
            const m = scene.getMeshByName(po.name);
            if (!m || m.isDisposed()) {
              return null;
            }
            try {
              return m.getAbsolutePosition ? m.getAbsolutePosition() : m.absolutePosition;
            } catch {
              return null;
            }
          }
        });
      }
    }

    proximity.setItems(items);
  };

  // Fix 7 (items-ready re-seed). Defends against a race where the render-loop's one-shot
  // env-switch seed fires before `CollectiblesManager.setupEnvironmentItems()` finishes
  // async GLB instantiation, leaving presents/cake stranded in ANIMATED-default and no
  // subsequent branch re-runs `seedMotionTypesForEnv` (both `lastTrackedEnvironment` and
  // `lastEnvironmentLoaded` latched on the racing tick). With `scene_manager.loadEnvironment`
  // now deferring `environmentLoaded=true` until after `setupEnvironmentItems`, this hook
  // is belt-and-suspenders insurance so any future reordering or newly-added async item
  // pipeline still triggers a re-seed instead of silently regressing the DYNAMIC-only-on-
  // owner invariant.
  CollectiblesManager.onEnvironmentItemsReady = (envName: string): void => {
    if (envName === sceneManager.getCurrentEnvironment()) {
      seedMotionTypesForEnv(envName);
      rebuildProximityItems(envName);
      // Re-apply full accumulated item state now that (a) physics bodies exist and (b) motion
      // types have been resolved. Using the merged knownItemStates rather than just the last
      // raw message ensures all items are placed correctly, not only those in the most recent
      // partial broadcast.
      if (knownItemStates.size > 0) {
        applyItemSnapshot(buildFullSnapshot());
      }
    }
  };

  // `seedMotionTypesForEnv` and `unsubEnvAuthority` are hoisted above `mp.join()` so
  // the env-authority snapshot replay that arrives during the SSE handshake is captured
  // (Fix 2). The initial post-join seed runs immediately after `setSelfClientId` above
  // (Fix 3) to cover the common case where the env snapshot landed during join but
  // tier-2 resolution was still disabled because self identity was not yet set.

  // ---- Sample gate: publish only rows this client is authorized to publish ----
  const includeRow = (st: ItemInstanceState): boolean => {
    if (authorityTracker.isOwnedBySelf(st.instanceId)) {
      return true;
    }
    // "Unowned + base-synchronizer" fallback gates the default publisher for items
    // whose explicit owner is unset. Per MULTIPLAYER_SYNCH.md §4.8
    // *No-authority-means-non-owner*, the client MUST NOT exercise this fallback
    // until it has observed at least one authority signal for the env — otherwise
    // a racing newcomer could establish a false claim on the server side in the
    // window between SSE open and authority-snapshot application.
    //
    // Fix 5 (tighten publish gate). When the env HAS a known env-authority, tier 2
    // is the sole publisher for unclaimed items in that env per §4.8. The
    // synchronizer fallback must therefore refuse to publish unowned rows whenever
    // `envAuthority[envForRow]` is set (regardless of whether it names self —
    // tier-2 ownership already flows through `isOwnedBySelf` above). This prevents
    // the synchronizer from echoing kinematic transforms for items whose publisher
    // is the env-authority, which otherwise creates a self-feedback loop on
    // synchronizer-env-authority collisions.
    if (authorityTracker.isUnowned(st.instanceId) && mp.isSynchronizer()) {
      const parsed = parseEnvScopedInstanceId(st.instanceId);
      const envForRow = parsed?.envName ?? sceneManager.getCurrentEnvironment();
      if (!envForRow || !authorityTracker.hasSnapshotAppliedFor(envForRow)) {
        return false;
      }
      if (authorityTracker.getEnvAuthority(envForRow)) {
        // Tier-2 owns this row; base-synchronizer must not also publish.
        return false;
      }
      return true;
    }
    return false;
  };

  let lastSend = 0;
  let lastPublishDiagMs = 0;

  const obs = scene.onBeforeRenderObservable.add(() => {
    if (!mp.isMultiplayerActive()) {
      return;
    }

    const envNow = sceneManager.getCurrentEnvironment();
    const envLoadedNow = sceneManager.isEnvironmentLoaded();
    if (envNow !== lastTrackedEnvironment) {
      // Env-switch: MULTIPLAYER_SYNCH.md §6.2 rule 4 requires the new env to
      // start in ANIMATED-default and wait for its own authority snapshot.
      // Clear snapshot-applied for BOTH the outgoing env (so revisits re-absorb
      // cleanly) and preserve/establish it lazily for the new env via
      // `markSnapshotApplied` calls triggered by the first authority signal or
      // item-state-update for the new env.
      authorityTracker.clearSnapshotAppliedFor(lastTrackedEnvironment);
      lastTrackedEnvironment = envNow;
      worldPhysicsItemSync.clearAll();
      proximity.clear();
      lastEnvironmentLoaded = envLoadedNow;
      // If the tracker already knows the env-authority for the new env (populated by the
      // PATCH /api/multiplayer/env-switch optimistic apply or a preceding SSE echo), open
      // the publish gate on the very next tick by marking the snapshot as applied. Without
      // this, the `includeRow` gate would reject every row until an explicit item-state
      // snapshot arrived for this env, stalling the first ~hundreds of ms of publishing.
      if (authorityTracker.getEnvAuthority(envNow)) {
        authorityTracker.markSnapshotApplied(envNow);
      }
      if (envLoadedNow) {
        seedMotionTypesForEnv(envNow);
        rebuildProximityItems(envNow);
      }
    } else if (envLoadedNow && !lastEnvironmentLoaded) {
      // Environment finished (re)loading. Seed motion types FIRST so items that
      // were spawned DYNAMIC (race: env loaded before mp.join resolved, before
      // resolveInitialOwnership was registered) become ANIMATED (kinematic) before
      // we write mesh transforms via applyItemSnapshot (§B.9 mesh-direct apply).
      // On a still-DYNAMIC body, Havok's post-step would override the written mesh
      // position with simulated-falling position — so the seed must precede the
      // apply to keep the authoritative pose stable.
      lastEnvironmentLoaded = true;
      seedMotionTypesForEnv(envNow);
      rebuildProximityItems(envNow);
      if (knownItemStates.size > 0) {
        applyItemSnapshot(buildFullSnapshot());
      }
    } else {
      lastEnvironmentLoaded = envLoadedNow;
    }

    if (envNow !== lastPeerVisibilityEnv) {
      lastPeerVisibilityEnv = envNow;
      refreshRemotePeerVisibilityForLocalEnvironment(scene, envNow);
    }

    if (envLoadedNow) {
      proximity.tick();

      const physStates = sampleEnvironmentPhysicsStates(scene, envNow);
      for (const st of physStates) {
        if (includeRow(st)) {
          worldPhysicsItemSync.updateItemState(st);
        } else {
          // Evict stale rows the moment we stop being authorised to publish them
          // (see §7.5 authority filter): otherwise `ItemSync.createStateUpdate`
          // keeps replaying the last-owned pose every throttle window, producing
          // perpetual "Filtered N unauthorized row(s)" noise on the server and
          // blocking the DYNAMIC→ANIMATED invariant on the peer side.
          worldPhysicsItemSync.removeItemState(st.instanceId);
        }
      }
      const itemStates = sampleConfiguredItems(envNow);
      let includedCount = 0;
      let excludedCount = 0;
      for (const st of itemStates) {
        if (st.isCollected) {
          worldPhysicsItemSync.updateItemState(st);
          includedCount++;
          continue;
        }
        if (includeRow(st)) {
          worldPhysicsItemSync.updateItemState(st);
          includedCount++;
        } else {
          worldPhysicsItemSync.removeItemState(st.instanceId);
          excludedCount++;
        }
      }
      const worldUpdate = worldPhysicsItemSync.createStateUpdate(Date.now());
      if (
        worldUpdate &&
        ((worldUpdate.updates?.length ?? 0) > 0 || (worldUpdate.collections?.length ?? 0) > 0)
      ) {
        void mp.updateItemState(worldUpdate);
      }

      // Periodic publish-gate diagnostic: log once every 10 s so silent publish
      // failures surface without flooding the console (Appendix B.8).
      const nowMs = Date.now();
      if (nowMs - lastPublishDiagMs >= 10_000) {
        lastPublishDiagMs = nowMs;
        const selfId = authorityTracker.getSelfClientId();
        const envAuth = authorityTracker.getEnvAuthority(envNow);
        const snapshotApplied = authorityTracker.hasSnapshotAppliedFor(envNow);
        const isSelf = selfId && envAuth === selfId;
        console.warn(
          `[SYNC_GATE] env="${envNow}" selfId="${selfId}" envAuth="${envAuth}" isEnvAuth=${isSelf} ` +
            `snapshotApplied=${snapshotApplied} isSynchronizer=${mp.isSynchronizer()} ` +
            `items=${itemStates.length} included=${includedCount} excluded=${excludedCount} ` +
            `updateRows=${worldUpdate?.updates?.length ?? 0}`
        );
      }
    }

    const now = performance.now();
    if (now - lastSend < SYNC_INTERVAL_MS) {
      return;
    }
    lastSend = now;
    const state = sampleLocalState(clientId, ctrl, envNow);
    if (!state) {
      return;
    }
    const update: CharacterStateUpdate = { updates: [state], timestamp: Date.now() };
    void mp.updateCharacterState(update);
  });

  scene.onDisposeObservable.add(() => {
    scene.onBeforeRenderObservable.remove(obs);
    unsubState();
    unsubLeft();
    unsubItems();
    unsubAuthority();
    unsubEnvAuthority();
    unsubSyncChanged();
    unsubAuthorityChange();
    proximity.clear();
    if (CollectiblesManager.onItemCollected) {
      CollectiblesManager.onItemCollected = null;
    }
    if (CollectiblesManager.onEnvironmentItemsReady) {
      CollectiblesManager.onEnvironmentItemsReady = null;
    }
    if (CollectiblesManager.resolveInitialOwnership) {
      CollectiblesManager.resolveInitialOwnership = null;
    }
  });
}
