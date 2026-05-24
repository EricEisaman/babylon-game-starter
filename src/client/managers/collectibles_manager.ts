// ============================================================================
// COLLECTIBLES MANAGER
// ============================================================================

import { CreateSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';

import { isSimulationActive } from '../simulation/simulation_bootstrap';
import { StateSimulationManager } from '../simulation/state_simulation_manager';
import { fromAbstractSound } from '../types/audio';
import { InventoryUI } from '../ui/inventory_ui';

import { AudioManager } from './audio_manager';
import { BehaviorManager } from './behavior_manager';
import { InventoryManager } from './inventory_manager';
import { NodeMaterialManager } from './node_material_manager';
import { VisualEffectsManager } from './visual_effects_manager';

import type { CharacterController } from '../controllers/character_controller';
import type { EffectType } from '../types/effects';
import type { Environment, ItemConfig, ItemInstance, ColliderType } from '../types/environment';

export class CollectiblesManager {
  private static scene: BABYLON.Scene | null = null;
  private static characterController: CharacterController | null = null;
  private static collectibles = new Map<string, BABYLON.AbstractMesh>();
  private static collectibleBodies = new Map<string, BABYLON.PhysicsAggregate>();
  private static collectionSound: ReturnType<typeof fromAbstractSound> | null = null;
  private static totalCredits = 0;
  private static collectionObserver: BABYLON.Observer<BABYLON.Scene> | null = null;
  private static collectedItems = new Set<string>();
  private static readonly instanceBasisByItem = new Map<string, BABYLON.Mesh>();
  private static itemConfigs = new Map<string, ItemConfig>();

  // Tracking for non-collectible physics items
  private static physicsItems = new Map<string, BABYLON.AbstractMesh>();
  private static physicsItemBodies = new Map<string, BABYLON.PhysicsAggregate>();

  /**
   * Callback invoked after any item is collected locally. Set by the multiplayer
   * bootstrap so the synchronizer can record an `ItemCollectionEvent` for the wire.
   */
  public static onItemCollected:
    | ((instanceId: string, itemName: string, creditsEarned: number) => void)
    | null = null;

  /**
   * Fires once all configured items (collectibles + non-collectible physics instances) for
   * the environment have finished loading into the scene. The multiplayer bootstrap uses
   * this to re-run `seedMotionTypesForEnv` + `rebuildProximityItems` with a populated items
   * map, defending against the race where the render-loop's one-shot env-switch seed ran
   * before async GLB instantiation completed (see scene_manager.ts comment on the
   * deferred `environmentLoaded` flag).
   */
  public static onEnvironmentItemsReady: ((envName: string) => void) | null = null;

  /**
   * Pre-scene ownership lookup (Invariant P — MULTIPLAYER_SYNCH.md §4.8). Registered by
   * `multiplayer_bootstrap.ts` immediately after `setSelfClientId`. Given an env-scoped
   * instance id (`"<envName>::<localId>"`), returns:
   *   - `true`  → self is resolved as this item's owner → spawn DYNAMIC from birth.
   *   - `false` → a peer is resolved as owner → spawn ANIMATED (kinematic) from birth.
   *   - `null`  → tracker cannot resolve yet (single-player, tracker not ready, unknown
   *     env). Callers fall back to the ANIMATED-default-then-promote safety belt so the
   *     seed / `env-item-authority-changed` handler can flip later.
   * The manager stays tracker-agnostic by receiving the callback instead of importing
   * the tracker directly.
   */
  public static resolveInitialOwnership: ((envScopedInstanceId: string) => boolean | null) | null =
    null;

  /** Mirrors `ENV_ITEM_SEPARATOR` in `configured_items_sync.ts` (intentional duplication
   *  to keep the manager import-graph clean — the sync module already imports this manager). */
  private static readonly ENV_ITEM_SEPARATOR = '::';

  // Cached particle systems for efficiency
  private static cachedParticleSystem: BABYLON.ParticleSystem | null = null;
  private static particleSystemPool: BABYLON.ParticleSystem[] = [];
  private static readonly MAX_POOL_SIZE = 5;
  private static particleSystemReturnObservers = new Map<
    BABYLON.ParticleSystem,
    BABYLON.Observer<BABYLON.Scene>
  >();

  /**
   * Initializes the CollectiblesManager with a scene and character controller
   */
  public static initialize(
    scene: BABYLON.Scene,
    characterController: CharacterController
  ): Promise<void> {
    this.scene = scene;
    this.characterController = characterController;
    this.totalCredits = 0;
    BehaviorManager.setCreditHandlers({
      getTotalCredits: () => this.getTotalCredits(),
      adjustCredits: (amount) => {
        this.adjustCredits(amount);
      }
    });
    return Promise.resolve();
  }

  /**
   * Sets up environment items for the given environment
   */
  public static async setupEnvironmentItems(environment: Environment): Promise<void> {
    if (!this.scene || !environment.items) {
      return;
    }

    // Clear existing collectibles (dispose instances and instanceBasis)
    this.clearCollectibles();

    // Set up collectibles for this environment
    await this.setupCollectiblesForEnvironment(environment);

    if (this.onEnvironmentItemsReady) {
      try {
        this.onEnvironmentItemsReady(environment.name);
      } catch {
        /* bootstrap hook best-effort; must not break gameplay */
      }
    }
  }

  /**
   * Sets up collectibles for a specific environment
   */
  private static async setupCollectiblesForEnvironment(environment: Environment): Promise<void> {
    if (!this.scene || !environment.items) {
      return;
    }

    // Wait for physics to be properly initialized
    await this.waitForPhysicsInitialization();

    // Iterate through all items in environment (never gate GLB spawn on audio)
    for (const itemConfig of environment.items) {
      await this.loadItemModel(itemConfig);

      // Create instances for this item
      for (let i = 0; i < itemConfig.instances.length; i++) {
        const instance = itemConfig.instances[i];
        if (!instance) {
          continue;
        }
        const instanceId = `${itemConfig.name.toLowerCase()}_instance_${i + 1}`;

        if (itemConfig.collectible) {
          // Process as collectible item
          this.createCollectibleInstance(instanceId, instance, itemConfig, environment.name);
        } else {
          // Process as non-collectible physics item
          this.createPhysicsInstance(instanceId, instance, itemConfig, environment.name);
        }
      }
    }

    await this.ensureCollectionSound();

    // Set up collision detection only for collectible items
    this.setupCollisionDetection();
  }

  private static async ensureCollectionSound(): Promise<void> {
    if (this.collectionSound) {
      return;
    }

    const audioEngine = await AudioManager.getSharedAudioEngine();
    if (!audioEngine) {
      return;
    }

    try {
      const sound = await CreateSoundAsync(
        'collectionSound',
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/sounds/effects/collect.m4a',
        { volume: 0.7 },
        audioEngine
      );
      this.collectionSound = fromAbstractSound(sound);
    } catch (error) {
      console.warn('[CollectiblesManager] Collection sound unavailable:', error);
    }
  }

  private static getInstanceBasis(itemName: string): BABYLON.Mesh | null {
    return this.instanceBasisByItem.get(itemName) ?? null;
  }

  /**
   * Invariant P (pre-scene ownership) — resolves the initial motion type for a massful
   * physics item from the tracker lookup registered by `multiplayer_bootstrap.ts`.
   *
   * Returns `DYNAMIC` only when the tracker has already resolved this instance as owned
   * by self at spawn time (common case: owner's env-switch PATCH has returned and the
   * synthetic `env-item-authority-changed` has been absorbed before `loadEnvironment`
   * started). Otherwise returns `ANIMATED`, keeping the defense-in-depth belt intact so
   * the render-loop seed + `env-item-authority-changed` handler can promote later.
   *
   * In single-player / MP-disabled builds the callback is unset and we short-circuit to
   * `DYNAMIC` so massful items fall under gravity as expected.
   */
  private static resolveInitialMotionType(envScopedId: string): BABYLON.PhysicsMotionType {
    const cb = this.resolveInitialOwnership;
    if (!cb) {
      return BABYLON.PhysicsMotionType.DYNAMIC;
    }
    let owned: boolean | null = null;
    try {
      owned = cb(envScopedId);
    } catch {
      owned = null;
    }
    if (owned === true) {
      return BABYLON.PhysicsMotionType.DYNAMIC;
    }
    return BABYLON.PhysicsMotionType.ANIMATED;
  }

  /**
   * Waits for physics to be properly initialized
   */
  private static async waitForPhysicsInitialization(): Promise<void> {
    if (!this.scene) return;

    // Physics is initialized synchronously in SceneManager.setupPhysics()
    // before setupEnvironmentItems() is called, so no wait is needed
    return Promise.resolve();
  }

  /**
   * Loads an item model to use as instance basis
   */
  private static async loadItemModel(itemConfig: ItemConfig): Promise<void> {
    if (!this.scene) {
      return;
    }

    try {
      const result = await BABYLON.ImportMeshAsync(itemConfig.url, this.scene);

      // Process node materials for item meshes
      // await NodeMaterialManager.processImportResult(result);

      // Rename the root node for better organization
      if (result.meshes.length > 0) {
        // Find the root mesh (the one without a parent)
        const rootMesh = result.meshes.find((mesh) => !mesh.parent);
        if (rootMesh) {
          rootMesh.name = `${itemConfig.name.toLowerCase()}_basis`;
          rootMesh.setEnabled(false);
        }
      }

      // Check if any mesh has proper geometry
      const meshWithGeometry = result.meshes.find((mesh) => {
        if (mesh instanceof BABYLON.Mesh) {
          return mesh.geometry != null && mesh.geometry.getTotalVertices() > 0;
        }
        return false;
      });

      let basisMesh: BABYLON.Mesh | null = null;
      if (meshWithGeometry instanceof BABYLON.Mesh) {
        basisMesh = meshWithGeometry;
      } else if (result.meshes.length > 0) {
        const fallbackMesh = result.meshes.find((mesh) => mesh instanceof BABYLON.Mesh);
        if (fallbackMesh instanceof BABYLON.Mesh) {
          basisMesh = fallbackMesh;
        }
      }

      if (basisMesh) {
        basisMesh.isVisible = false;
        basisMesh.setEnabled(false);
        this.instanceBasisByItem.set(itemConfig.name, basisMesh);
      }
    } catch (error) {
      console.warn('[CollectiblesManager] Failed to load item model:', itemConfig.name, error);
    }
  }

  /**
   * Creates a collectible instance from the loaded model
   */
  private static createCollectibleInstance(
    id: string,
    instance: ItemInstance,
    itemConfig: ItemConfig,
    environmentName: string
  ): void {
    const instanceBasis = this.getInstanceBasis(itemConfig.name);
    if (!this.scene || !instanceBasis) {
      return;
    }

    try {
      // Create an instance from the loaded model
      const meshInstance = instanceBasis.createInstance(id);

      // Set the mesh name to instanceName if provided, otherwise use the generated ID
      meshInstance.name = instance.instanceName ?? id;

      // Set metadata to mark this as a collectible
      meshInstance.metadata = { isCollectible: true };

      // Remove the instance from its parent to make it independent
      if (meshInstance.parent) {
        meshInstance.setParent(null);
      }

      // Apply instance properties.
      // Invariant E (multiplayer_serialization.ts §"Pose-only transport"): the Euler
      // `mesh.rotation` channel MUST NEVER be written — `sampleMeshPose` reads only
      // `rotationQuaternion`, so a raw Euler assignment would leave peers with a
      // null quaternion and divergent rotations until a remote pose lands.
      meshInstance.position = instance.position;
      meshInstance.scaling.setAll(instance.scale);
      meshInstance.scaling._x *= -1;
      meshInstance.scaling._z *= -1;
      meshInstance.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(instance.rotation);

      // Make it visible and enabled
      meshInstance.isVisible = true;
      meshInstance.setEnabled(true);

      if (instance.materialSnippetId) {
        void NodeMaterialManager.applySnippetToMesh(meshInstance, instance.materialSnippetId);
      }

      // Get the scaled bounding box dimensions after applying instance scaling
      // const boundingBox = meshInstance.getBoundingInfo();
      // const scaledSize = boundingBox.boundingBox.extendSize.scale(2); // Multiply by 2 to get full size

      // Create physics body with appropriate shape type
      const shapeType = this.getPhysicsShapeType(instance.colliderType);
      const options: { mass: number; friction?: number } = { mass: instance.mass };
      if (instance.friction !== undefined) {
        options.friction = instance.friction;
      }
      const physicsAggregate = new BABYLON.PhysicsAggregate(meshInstance, shapeType, options);

      // Invariant P (MULTIPLAYER_SYNCH.md §4.8 "pre-scene ownership"): owner spawns DYNAMIC
      // from birth, non-owner spawns ANIMATED (kinematic) from birth, and the existing
      // ANIMATED-default-then-promote belt (§6.2 rule 4) runs as defense-in-depth for any
      // instance the tracker could not yet resolve at spawn time (e.g. single-player, or a
      // late-loading item whose authority snapshot has not yet arrived).
      if (instance.mass > 0 && physicsAggregate.body && !physicsAggregate.body.isDisposed) {
        const envScopedId = `${environmentName}${this.ENV_ITEM_SEPARATOR}${id}`;
        const motionType = this.resolveInitialMotionType(envScopedId);
        try {
          physicsAggregate.body.setMotionType(motionType);
          if (motionType === BABYLON.PhysicsMotionType.ANIMATED) {
            physicsAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            physicsAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
          }
        } catch {
          /* body still initializing; seedMotionTypesForEnv will retry post-join. */
        }
      }

      // Store references
      this.collectibles.set(id, meshInstance);
      this.collectibleBodies.set(id, physicsAggregate);

      // Store the item config for this collectible
      this.itemConfigs.set(id, itemConfig);

      // Rotation animation is harmless on physics-bearing items (the body is the
      // authoritative pose source and the animation is gated to mass === 0 anyway).
      if (instance.mass === 0) {
        this.addRotationAnimation(meshInstance);
      }

      // Apply glow effect if specified
      if (
        instance.effect === ('GLOW' satisfies EffectType) &&
        meshInstance instanceof BABYLON.Mesh
      ) {
        VisualEffectsManager.applyGlow(meshInstance);
      }

      // Register behavior if specified
      if (instance.behavior) {
        BehaviorManager.registerInstance(id, meshInstance, instance.behavior);
      }
    } catch {
      // Ignore collectible creation errors for playground compatibility
    }
  }

  /**
   * Creates a non-collectible physics instance from the loaded model
   */
  private static createPhysicsInstance(
    id: string,
    instance: ItemInstance,
    itemConfig: ItemConfig,
    environmentName: string
  ): void {
    const instanceBasis = this.getInstanceBasis(itemConfig.name);
    if (!this.scene || !instanceBasis) {
      return;
    }

    try {
      // Create an instance from the loaded model
      const meshInstance = instanceBasis.createInstance(id);

      // Set the mesh name to instanceName if provided, otherwise use the generated ID
      meshInstance.name = instance.instanceName ?? id;

      // Remove the instance from its parent to make it independent
      if (meshInstance.parent) {
        meshInstance.setParent(null);
      }

      // Apply instance properties.
      // Invariant E (multiplayer_serialization.ts §"Pose-only transport"): the Euler
      // `mesh.rotation` channel MUST NEVER be written — `sampleMeshPose` reads only
      // `rotationQuaternion`, so a raw Euler assignment would leave peers with a
      // null quaternion and divergent rotations until a remote pose lands.
      meshInstance.position = instance.position;
      meshInstance.scaling.setAll(instance.scale);
      meshInstance.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(instance.rotation);

      // Make it visible and enabled
      meshInstance.isVisible = true;
      meshInstance.setEnabled(true);

      // Create physics body with appropriate shape type
      const shapeType = this.getPhysicsShapeType(instance.colliderType);
      const options: { mass: number; friction?: number } = { mass: instance.mass };
      if (instance.friction !== undefined) {
        options.friction = instance.friction;
      }
      const physicsAggregate = new BABYLON.PhysicsAggregate(meshInstance, shapeType, options);

      // Invariant P (pre-scene ownership) — see `createCollectibleInstance` for rationale.
      // ANIMATED-default-then-promote belt (§6.2 rule 4) stays as defense-in-depth for
      // unresolved items.
      if (instance.mass > 0 && physicsAggregate.body && !physicsAggregate.body.isDisposed) {
        const envScopedId = `${environmentName}${this.ENV_ITEM_SEPARATOR}${id}`;
        const motionType = this.resolveInitialMotionType(envScopedId);
        try {
          physicsAggregate.body.setMotionType(motionType);
          if (motionType === BABYLON.PhysicsMotionType.ANIMATED) {
            physicsAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            physicsAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
          }
        } catch {
          /* body still initializing; seedMotionTypesForEnv will retry post-join. */
        }
      }

      // Store references for cleanup
      this.physicsItems.set(id, meshInstance);
      this.physicsItemBodies.set(id, physicsAggregate);
      this.itemConfigs.set(id, itemConfig);

      // Apply glow effect if specified
      if (
        instance.effect === ('GLOW' satisfies EffectType) &&
        meshInstance instanceof BABYLON.Mesh
      ) {
        VisualEffectsManager.applyGlow(meshInstance);
      }

      // Register behavior if specified
      if (instance.behavior) {
        BehaviorManager.registerInstance(id, meshInstance, instance.behavior);
      }
    } catch {
      // Ignore physics item creation errors for playground compatibility
    }
  }

  /**
   * Adds a cosmetic yaw rotation to a massless collectible.
   *
   * Invariant E (MULTIPLAYER_SYNCH.md §5.2, no Euler on item transform paths): this animation
   * MUST NOT touch `mesh.rotation`. Instead it composes a per-frame yaw delta onto
   * `mesh.rotationQuaternion` inside `scene.onBeforeRenderObservable`, which is the channel
   * the rest of the item pipeline (samplers, appliers, physics bodies) reads and writes.
   *
   * Callers gate this on `instance.mass === 0` — a physics body (kinematic or dynamic) is
   * the authoritative pose source for any massful item, so spinning the mesh underneath it
   * would desynchronize the render from the physics state and fight the matrix-only wire.
   *
   * TODO: expose a future `ItemConfig.rotateInPlace?: boolean` flag in
   * `src/client/config/assets.ts` so per-instance cosmetic spin can be opted into explicitly
   * rather than inferred from `mass === 0`.
   */
  private static addRotationAnimation(mesh: BABYLON.AbstractMesh): void {
    if (!this.scene) return;

    // Fold any authored Euler rotation (e.g. `instance.rotation` set during spawn) into
    // the quaternion channel so switching to quaternion-only writes below preserves the
    // original authored orientation. After this point the Euler channel is dead data
    // for this mesh (Invariant E).
    if (!mesh.rotationQuaternion) {
      const e = mesh.rotation;
      mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(e.y, e.x, e.z);
    }

    const radiansPerSecond = 2 * Math.PI;
    const deltaQuat = new BABYLON.Quaternion();
    const scene = this.scene;

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (mesh.isDisposed()) {
        if (observer) {
          scene.onBeforeRenderObservable.remove(observer);
        }
        return;
      }
      const dtMs = scene.getEngine().getDeltaTime();
      const dt = dtMs > 0 ? dtMs / 1000 : 1 / 60;
      BABYLON.Quaternion.RotationAxisToRef(
        BABYLON.Vector3.UpReadOnly,
        radiansPerSecond * dt,
        deltaQuat
      );
      const current = (mesh.rotationQuaternion ??= new BABYLON.Quaternion(0, 0, 0, 1));
      current.multiplyInPlace(deltaQuat);
    });
  }

  /**
   * Sets up collision detection for collectibles
   */
  private static setupCollisionDetection(): void {
    if (!this.scene || !this.characterController) return;

    // Set up collision detection using scene collision observer
    this.collectionObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.checkCollisions();
    });
  }

  /**
   * Checks for collisions between character and collectibles
   */
  private static checkCollisions(): void {
    if (!this.characterController) return;

    const characterPosition = this.characterController.getDisplayCapsule().position;
    const collectionRadius = 1.5; // Default collection radius
    const collectionRadiusSquared = collectionRadius * collectionRadius;

    for (const [id, collectible] of this.collectibles) {
      if (this.collectedItems.has(id)) continue;

      const distanceSquared = BABYLON.Vector3.DistanceSquared(
        characterPosition,
        collectible.position
      );
      if (distanceSquared < collectionRadiusSquared) {
        this.collectItem(id);
      }
    }
  }

  /**
   * Collects an item and adds it to inventory
   */
  private static collectItem(id: string): void {
    const collectible = this.collectibles.get(id);
    const itemConfig = this.itemConfigs.get(id);

    if (collectible == null || itemConfig == null) return;

    // Mark as collected
    this.collectedItems.add(id);

    // Remove physics body from simulation (must be done before disposing)
    const physicsAggregate = this.collectibleBodies.get(id);
    if (physicsAggregate && this.scene) {
      const physicsEngine = this.scene.getPhysicsEngine();
      if (physicsEngine) {
        const physicsEngineObj = physicsEngine as object;

        // Prefer direct removeBody if the active engine exposes it.
        const removeBodyCandidate = Reflect.get(physicsEngineObj, 'removeBody');
        if (typeof removeBodyCandidate === 'function') {
          Reflect.apply(removeBodyCandidate, physicsEngineObj, [physicsAggregate.body]);
        } else {
          // Fallback for engines that expose removeBody on the physics plugin.
          const getPhysicsPluginCandidate = Reflect.get(physicsEngineObj, 'getPhysicsPlugin');
          if (typeof getPhysicsPluginCandidate === 'function') {
            const plugin = Reflect.apply(getPhysicsPluginCandidate, physicsEngineObj, []);
            if (typeof plugin === 'object' && plugin !== null) {
              const pluginRemoveBody = Reflect.get(plugin, 'removeBody');
              if (typeof pluginRemoveBody === 'function') {
                Reflect.apply(pluginRemoveBody, plugin, [physicsAggregate.body]);
              }
            }
          }
        }
      }
      // Dispose the physics aggregate to free resources
      physicsAggregate.dispose();
      // Clear physics body reference from mesh if it exists
      if ('physicsBody' in collectible && collectible.physicsBody) {
        (collectible as { physicsBody: BABYLON.PhysicsBody | null }).physicsBody = null;
      }
      // Remove from map since it's disposed
      this.collectibleBodies.delete(id);
    }

    // Hide the collectible
    collectible.setEnabled(false);

    // Play collection sound
    if (this.collectionSound) {
      this.collectionSound.play();
    }

    // Show collection effects
    this.showCollectionEffects(collectible.position);

    // Add to inventory only if it's an inventory item
    if (itemConfig.inventory && itemConfig.itemEffectKind && itemConfig.thumbnail) {
      InventoryManager.addItem(itemConfig.name, 1, itemConfig.thumbnail);
      // Refresh inventory UI to show the new item
      InventoryUI.refreshInventory();
    }

    if (isSimulationActive() && itemConfig.collectRole) {
      StateSimulationManager.handleItemCollectRole(itemConfig.collectRole);
    }

    // ALWAYS update inventory button opacity after ANY collection
    InventoryUI.updateInventoryButton();

    // Add credits (default to 0 if not specified or if not collectible)
    const creditValue = itemConfig.collectible ? (itemConfig.creditValue ?? 0) : 0;
    this.totalCredits += creditValue;

    // Notify the multiplayer bootstrap so the synchronizer can broadcast the collection event.
    try {
      this.onItemCollected?.(id, itemConfig.name, creditValue);
    } catch {
      /* callback must not break gameplay */
    }
  }

  /** Collectible meshes + their (possibly-disposed) physics aggregates for sampling / apply. */
  public static *getCollectibleEntries(): IterableIterator<
    [
      string,
      {
        mesh: BABYLON.AbstractMesh;
        body: BABYLON.PhysicsAggregate | null;
        config: ItemConfig;
      }
    ]
  > {
    for (const [id, mesh] of this.collectibles) {
      const config = this.itemConfigs.get(id);
      if (!config) {
        continue;
      }
      yield [id, { mesh, body: this.collectibleBodies.get(id) ?? null, config }];
    }
  }

  /** Non-collectible physics items (e.g. Cake) tracked by the manager. */
  public static *getPhysicsItemEntries(): IterableIterator<
    [
      string,
      {
        mesh: BABYLON.AbstractMesh;
        body: BABYLON.PhysicsAggregate | null;
        config: ItemConfig;
      }
    ]
  > {
    for (const [id, mesh] of this.physicsItems) {
      const config = this.itemConfigs.get(id);
      if (!config) {
        continue;
      }
      yield [id, { mesh, body: this.physicsItemBodies.get(id) ?? null, config }];
    }
  }

  /** Whether the instance with `id` has been locally collected already. */
  public static isCollectedInstance(id: string): boolean {
    return this.collectedItems.has(id);
  }

  /**
   * Resolves an instance id (from either the collectible or physics-item map) to its
   * mesh + optional physics body. Returns null if the id is not tracked.
   */
  public static getMeshAndBody(
    id: string
  ): { mesh: BABYLON.AbstractMesh; body: BABYLON.PhysicsAggregate | null } | null {
    const coll = this.collectibles.get(id);
    if (coll) {
      return { mesh: coll, body: this.collectibleBodies.get(id) ?? null };
    }
    const phys = this.physicsItems.get(id);
    if (phys) {
      return { mesh: phys, body: this.physicsItemBodies.get(id) ?? null };
    }
    return null;
  }

  /** Looks up the config for a tracked instance id; used by the sampler for the wire itemName. */
  public static getItemConfigForInstance(id: string): ItemConfig | null {
    return this.itemConfigs.get(id) ?? null;
  }

  /**
   * Flips every tracked collectible + physics-item body between kinematic (`ANIMATED`) and
   * dynamic (`DYNAMIC`) motion types.
   *
   * The multiplayer bootstrap calls this with `kinematic=true` on non-synchronizer clients so
   * Havok stops integrating forces on replicated bodies — without this, dynamic bodies drift
   * under gravity and collisions between the ~120ms authoritative snapshots and appear to
   * "fly around". Synchronizer clients set `kinematic=false` so they can run the authoritative
   * simulation locally.
   */
  public static setAllItemsKinematic(kinematic: boolean): void {
    const motionType = kinematic
      ? BABYLON.PhysicsMotionType.ANIMATED
      : BABYLON.PhysicsMotionType.DYNAMIC;

    const applyTo = (aggregate: BABYLON.PhysicsAggregate): void => {
      const body = aggregate.body;
      if (!body || body.isDisposed) {
        return;
      }
      try {
        if (body.getMotionType() !== motionType) {
          body.setMotionType(motionType);
        }
        if (kinematic) {
          body.setLinearVelocity(BABYLON.Vector3.Zero());
          body.setAngularVelocity(BABYLON.Vector3.Zero());
          // Havok sets disablePreStep=true when a body was ever DYNAMIC. For an
          // ANIMATED (kinematic) replica we need mesh→body propagation on every
          // pre-step (MULTIPLAYER_SYNCH.md §B.9), so force it back to false.
          body.disablePreStep = false;
        } else {
          body.disablePreStep = true;
        }
      } catch {
        /* Havok edge cases (e.g. body mid-initialization) — try again next frame */
      }
    };

    for (const aggregate of this.collectibleBodies.values()) {
      applyTo(aggregate);
    }
    for (const aggregate of this.physicsItemBodies.values()) {
      applyTo(aggregate);
    }
  }

  /**
   * Flips the motion type of a single tracked item (collectible or physics item) between
   * kinematic (ANIMATED) and dynamic (DYNAMIC). Used by the per-item authority pipeline so
   * only items owned by the local client run a local dynamic simulation; peer-owned items
   * remain kinematic and are teleported by incoming item-state rows.
   */
  public static setItemKinematic(localId: string, kinematic: boolean): boolean {
    const aggregate =
      this.collectibleBodies.get(localId) ?? this.physicsItemBodies.get(localId) ?? null;
    if (!aggregate) {
      return false;
    }
    const body = aggregate.body;
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
      if (kinematic) {
        body.setLinearVelocity(BABYLON.Vector3.Zero());
        body.setAngularVelocity(BABYLON.Vector3.Zero());
        // Havok's PhysicsAggregate constructor sets disablePreStep=true for
        // DYNAMIC bodies so the initial simulation is not disturbed by mesh
        // writes. When we flip to ANIMATED (peer replica), the non-owner apply
        // path writes mesh.position / rotationQuaternion directly (see
        // MULTIPLAYER_SYNCH.md §B.9) and relies on Havok's pre-step to copy
        // mesh → body before each physics tick. Force disablePreStep=false
        // here or the mesh writes are silently overridden by the body pose
        // on the next post-step.
        body.disablePreStep = false;
      } else {
        body.disablePreStep = true;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Idempotent, silent collection path for remote-driven state (non-synchronizer mirror).
   * Mirrors the cleanup half of `collectItem` (dispose body, disable mesh, mark collected)
   * but deliberately skips credits, inventory, effects, and sounds.
   *
   * Callers that need the feedback parity required by MULTIPLAYER_SYNCH.md §6.2 rule 1
   * ("Remote-collect feedback parity") MUST use {@link applyRemoteCollectedWithFeedback}
   * instead. This silent variant is reserved for reconciliation cases where the mesh is
   * already gone at call time (e.g. the `isCollected:true` branch of an `updates[]` row
   * that fires AFTER the canonical `collections[]` burst has already played).
   */
  public static applyRemoteCollected(id: string): void {
    if (this.collectedItems.has(id)) {
      return;
    }
    const mesh = this.collectibles.get(id) ?? this.physicsItems.get(id);
    if (!mesh) {
      return;
    }

    this.collectedItems.add(id);

    const aggregate = this.collectibleBodies.get(id) ?? this.physicsItemBodies.get(id);
    if (aggregate) {
      try {
        aggregate.dispose();
      } catch {
        /* ignore */
      }
      this.collectibleBodies.delete(id);
      this.physicsItemBodies.delete(id);
      if (mesh.physicsBody) {
        mesh.physicsBody = null;
      }
    }

    try {
      mesh.setEnabled(false);
      mesh.isVisible = false;
    } catch {
      /* ignore */
    }
  }

  /**
   * Remote-driven collection WITH feedback parity (MULTIPLAYER_SYNCH.md §6.2 rule 1
   * "Remote-collect feedback parity"). Captures the mesh's world position BEFORE
   * cleanup, then plays the same particle burst and a distance-attenuated
   * ("spatialized") collect sound that the local collector plays, then invokes the
   * silent cleanup half.
   *
   * Does NOT touch credits, inventory, scoring, analytics, or the `onItemCollected`
   * callback — those side-effects are the collector's exclusive responsibility.
   *
   * If the item has already been marked collected, or no local mesh exists (previous
   * bootstrap snapshot dispatched it), this is a silent idempotent no-op — there is
   * no anchor position for the VFX, and the event is purely reconciliation.
   */
  public static applyRemoteCollectedWithFeedback(id: string): void {
    if (this.collectedItems.has(id)) {
      return;
    }
    const mesh = this.collectibles.get(id) ?? this.physicsItems.get(id);
    if (!mesh) {
      return;
    }

    const worldPos = mesh.getAbsolutePosition().clone();

    try {
      this.showCollectionEffects(worldPos);
    } catch {
      /* feedback must not break reconciliation */
    }
    try {
      this.playCollectSoundSpatialized(worldPos);
    } catch {
      /* feedback must not break reconciliation */
    }

    this.applyRemoteCollected(id);
  }

  /**
   * Plays `collectionSound` at a volume attenuated by the distance between the
   * scene's active camera (listener) and the supplied world position. This is the
   * minimal "spatialized collection sound" required by §6.2 rule 1: the collect
   * cue for a remote collection becomes quieter the farther the observer is from
   * the collected item. Attenuation uses a 1 / (1 + d/r) falloff with r = 15 m,
   * clamped to a minimum floor so distant collections stay audible.
   */
  private static playCollectSoundSpatialized(position: BABYLON.Vector3): void {
    if (!this.collectionSound || !this.scene) {
      return;
    }
    const baseVolume = 0.7;
    let finalVolume = baseVolume;
    const cam = this.scene.activeCamera;
    if (cam) {
      const listener = cam.globalPosition ?? cam.position;
      if (listener) {
        const dist = BABYLON.Vector3.Distance(listener, position);
        const falloffRadius = 15;
        const attenuation = 1 / (1 + dist / falloffRadius);
        finalVolume = Math.max(0.05, Math.min(baseVolume, baseVolume * attenuation));
      }
    }
    this.collectionSound.setVolume(finalVolume);
    this.collectionSound.play();
  }

  /**
   * Creates a reusable particle system template for collection effects
   */
  private static createParticleSystemTemplate(): BABYLON.ParticleSystem {
    if (!this.scene) throw new Error('Scene not initialized');

    const particleSystem = new BABYLON.ParticleSystem('CollectionEffect', 50, this.scene);

    particleSystem.particleTexture = new BABYLON.Texture(
      'https://www.babylonjs-playground.com/textures/flare.png',
      this.scene
    );
    particleSystem.minEmitBox = new BABYLON.Vector3(-0.5, -0.5, -0.5);
    particleSystem.maxEmitBox = new BABYLON.Vector3(0.5, 0.5, 0.5);

    particleSystem.color1 = new BABYLON.Color4(0.5, 0.8, 1, 1); // Baby blue
    particleSystem.color2 = new BABYLON.Color4(0.2, 0.6, 0.9, 1); // Darker baby blue
    particleSystem.colorDead = new BABYLON.Color4(0, 0.3, 0.6, 0); // Fade to dark blue

    particleSystem.minSize = 0.1;
    particleSystem.maxSize = 0.3;

    particleSystem.minLifeTime = 0.3;
    particleSystem.maxLifeTime = 0.8;

    particleSystem.emitRate = 100;
    particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;

    particleSystem.gravity = new BABYLON.Vector3(0, -9.81, 0);

    particleSystem.direction1 = new BABYLON.Vector3(-2, -2, -2);
    particleSystem.direction2 = new BABYLON.Vector3(2, 2, 2);

    particleSystem.minEmitPower = 1;
    particleSystem.maxEmitPower = 3;
    particleSystem.updateSpeed = 0.016;

    return particleSystem;
  }

  /**
   * Gets a particle system from the pool or creates a new one
   */
  private static getParticleSystemFromPool(): BABYLON.ParticleSystem | null {
    if (!this.scene) return null;

    // Try to get from pool first
    if (this.particleSystemPool.length > 0) {
      const pooled = this.particleSystemPool.pop();
      if (pooled) {
        return pooled;
      }
    }

    // Create new one if pool is empty
    return this.createParticleSystemTemplate();
  }

  /**
   * Returns a particle system to the pool for reuse
   */
  private static returnParticleSystemToPool(particleSystem: BABYLON.ParticleSystem): void {
    if (this.particleSystemPool.length < this.MAX_POOL_SIZE) {
      particleSystem.stop();
      this.particleSystemPool.push(particleSystem);
    } else {
      particleSystem.dispose();
    }
  }

  /**
   * Shows collection particle effects at the specified position (optimized with pooling)
   */
  private static showCollectionEffects(position: BABYLON.Vector3): void {
    if (!this.scene) return;

    // Get particle system from pool
    const particleSystem = this.getParticleSystemFromPool();
    if (!particleSystem) return;

    // Set position and start
    particleSystem.emitter = position;
    particleSystem.targetStopDuration = 1.0;
    particleSystem.start();

    // Set up observer to return to pool when particle system stops
    // Check approximately every 60 frames (1 second at 60fps)
    let frameCount = 0;
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      frameCount++;
      if (frameCount >= 60) {
        this.scene?.onBeforeRenderObservable.remove(observer);
        this.particleSystemReturnObservers.delete(particleSystem);
        this.returnParticleSystemToPool(particleSystem);
      }
    });
    this.particleSystemReturnObservers.set(particleSystem, observer);
  }

  /**
   * Removes a collectible from the scene
   */
  private static removeCollectible(collectibleId: string): void {
    const mesh = this.collectibles.get(collectibleId);
    const physicsAggregate = this.collectibleBodies.get(collectibleId);

    if (mesh) {
      // Unregister behavior if registered
      BehaviorManager.unregisterInstance(collectibleId);

      // Dispose physics body if it exists
      if (physicsAggregate) {
        physicsAggregate.dispose();
        this.collectibleBodies.delete(collectibleId);
      }
      mesh.dispose();
      this.collectibles.delete(collectibleId);
    }
  }

  /**
   * Clears all collectibles and non-collectible physics items
   */
  public static clearCollectibles(): void {
    // Collect all tracked collectible IDs before clearing the map
    const trackedIds = new Set<string>();
    for (const id of this.collectibles.keys()) {
      trackedIds.add(id);
    }

    // Remove all collectibles from the map
    for (const id of trackedIds) {
      this.removeCollectible(id);
    }

    // Remove all non-collectible physics items
    for (const [id, mesh] of this.physicsItems.entries()) {
      // Unregister behavior if registered
      BehaviorManager.unregisterInstance(id);

      const physicsBody = this.physicsItemBodies.get(id);
      if (physicsBody) {
        physicsBody.dispose();
      }
      mesh.dispose();
    }
    this.physicsItems.clear();
    this.physicsItemBodies.clear();

    // Also manually dispose any collectible meshes that might not be in the map
    // (in case the manager was reinitialized and lost references)
    if (this.scene) {
      const collectibleMeshes = this.scene.meshes.filter(
        (mesh) =>
          mesh.metadata &&
          typeof mesh.metadata === 'object' &&
          'isCollectible' in mesh.metadata &&
          mesh.metadata.isCollectible === true &&
          !mesh.name.includes('player') &&
          !mesh.name.includes('CharacterDisplay') &&
          !mesh.name.includes('environment') &&
          !mesh.name.includes('sky') &&
          !mesh.name.includes('basis')
      );

      collectibleMeshes.forEach((mesh) => {
        // Dispose physics body if it exists
        if (mesh.physicsImpostor) {
          mesh.physicsImpostor.dispose();
        }
        mesh.dispose();
      });
    }

    // Clear collections but keep manager initialized
    this.collectibles.clear();
    this.collectibleBodies.clear();
    this.itemConfigs.clear();
    this.collectedItems.clear();

    // Stop and dispose any active particle systems from collection effects
    this.particleSystemPool.forEach((ps) => {
      ps.stop();
      ps.dispose();
    });
    this.particleSystemPool.length = 0;

    // Dispose per-item instance basis meshes
    for (const basis of this.instanceBasisByItem.values()) {
      basis.dispose();
    }
    this.instanceBasisByItem.clear();

    // Remove collision detection observer
    if (this.collectionObserver) {
      this.scene?.onBeforeRenderObservable.remove(this.collectionObserver);
      this.collectionObserver = null;
    }
  }

  /**
   * Gets the total credits collected
   */
  public static getTotalCredits(): number {
    return this.totalCredits;
  }

  /**
   * Adjusts credits by a specified amount
   * @param amount - The amount to adjust credits by. Positive values add credits, negative values subtract credits.
   * @returns The new total credits after adjustment
   */
  public static adjustCredits(amount: number): number {
    // Validate amount - treat invalid numbers as 0
    const validAmount = Number.isFinite(amount) ? amount : 0;

    // Adjust credits
    this.totalCredits += validAmount;

    // Clamp to minimum 0
    if (this.totalCredits < 0) {
      this.totalCredits = 0;
    }

    return this.totalCredits;
  }

  /**
   * Gets the physics shape type based on collider type
   */
  private static getPhysicsShapeType(
    colliderType: ColliderType | undefined
  ): BABYLON.PhysicsShapeType {
    if (!colliderType) {
      return BABYLON.PhysicsShapeType.BOX;
    }

    switch (colliderType) {
      case 'SPHERE':
        return BABYLON.PhysicsShapeType.SPHERE;
      case 'CAPSULE':
        return BABYLON.PhysicsShapeType.CAPSULE;
      case 'CYLINDER':
        return BABYLON.PhysicsShapeType.CYLINDER;
      case 'CONVEX_HULL':
        return BABYLON.PhysicsShapeType.CONVEX_HULL;
      case 'MESH':
        return BABYLON.PhysicsShapeType.MESH;
      case 'BOX':
        return BABYLON.PhysicsShapeType.BOX;
    }
  }

  /**
   * Disposes of the CollectiblesManager
   */
  public static dispose(): void {
    this.clearCollectibles();
    if (this.collectionObserver) {
      this.scene?.onBeforeRenderObservable.remove(this.collectionObserver);
      this.collectionObserver = null;
    }

    // Dispose collection sound
    if (this.collectionSound) {
      this.collectionSound.dispose();
      this.collectionSound = null;
    }

    // Dispose cached particle system
    if (this.cachedParticleSystem) {
      this.cachedParticleSystem.dispose();
      this.cachedParticleSystem = null;
    }

    // Remove all particle system return observers
    this.particleSystemReturnObservers.forEach((observer) => {
      this.scene?.onBeforeRenderObservable.remove(observer);
    });
    this.particleSystemReturnObservers.clear();

    // Dispose particle system pool
    this.particleSystemPool.forEach((ps) => {
      ps.dispose();
    });
    this.particleSystemPool.length = 0;

    for (const basis of this.instanceBasisByItem.values()) {
      basis.dispose();
    }
    this.instanceBasisByItem.clear();

    this.scene = null;
    this.characterController = null;
    BehaviorManager.setCreditHandlers(null);
  }
}
