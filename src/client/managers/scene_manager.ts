// ============================================================================
// SCENE MANAGER
// ============================================================================

// /// <reference path="../types/babylon.d.ts" />

import {
  HardwareScalingOptimization,
  SceneOptimizer,
  SceneOptimizerOptions
} from '@babylonjs/core/Misc/sceneOptimizer';
import { ScenePerformancePriority } from '@babylonjs/core/scene';

import { ASSETS } from '../config/assets';
import { CONFIG } from '../config/game_config';
import { CharacterController } from '../controllers/character_controller';
import { SmoothFollowCameraController } from '../controllers/smooth_follow_camera_controller';
import { OBJECT_ROLE } from '../types/environment';
import { devLog, isViteDev } from '../utils/dev_log';
import {
  registerDeferredScenePerfDevLogFlush,
  stampScenePerfConsoleContext
} from '../utils/scene_perf_console_stamp';
import {
  collectScenePerformanceStats,
  formatScenePerformanceStats
} from '../utils/scene_performance_stats';
import { switchToEnvironment } from '../utils/switch_environment';

import { AudioManager } from './audio_manager';
import { BehaviorManager } from './behavior_manager';
import { CameraManager } from './camera_manager';
import { CharacterLoader } from './character_loader';
import { CollectiblesManager } from './collectibles_manager';
import { HUDManager } from './hud_manager';
import { InventoryManager } from './inventory_manager';
import { NodeMaterialManager } from './node_material_manager';
import { SkyManager } from './sky_manager';
import { VisualEffectsManager } from './visual_effects_manager';

import type { EffectType } from '../types/effects';
import type { Environment, LightConfig, ColliderType } from '../types/environment';

export class SceneManager {
  private readonly scene: BABYLON.Scene;
  private readonly camera: BABYLON.TargetCamera;
  private characterController: CharacterController | null = null;
  private smoothFollowController: SmoothFollowCameraController | null = null;
  private currentEnvironment: string = (() => {
    const defaultEnv = ASSETS.ENVIRONMENTS.find((env) => env.isDefault);
    const name = defaultEnv?.name ?? ASSETS.ENVIRONMENTS[0]?.name;
    if (!name) {
      throw new Error('ASSETS.ENVIRONMENTS must define at least one environment');
    }
    return name;
  })();
  private environmentLoaded = false;

  private readonly zeroVector = new BABYLON.Vector3(0, 0, 0);

  // Environment lights tracking
  private environmentLights: BABYLON.Light[] = [];

  // Default light tracking
  private defaultLight: BABYLON.HemisphericLight | null = null;

  private sceneOptimizer: InstanceType<typeof SceneOptimizer> | null = null;
  private sceneOptimizerStarted = false;

  /** When true, dev [ScenePerf] was skipped until CharacterLoader sets a playable character. */
  private scenePerfDevLogDeferred = false;

  /** Env + sky meshes kept isVisible=false until character is ready and physics is resumed. */
  private readonly environmentHiddenUntilCharacterReady: BABYLON.AbstractMesh[] = [];

  constructor(engine: BABYLON.Engine, canvas: HTMLCanvasElement) {
    void canvas;
    this.scene = new BABYLON.Scene(engine);
    this.camera = new BABYLON.TargetCamera('camera1', CONFIG.CAMERA.START_POSITION, this.scene);
    this.camera.maxZ = CONFIG.PERFORMANCE.CAMERA_MAX_Z;
    // WebGPU: Intermediate + dirty blocking / frozen materials can break light UBO bind groups; stay conservative.
    const webgpu = engine.constructor.name === 'WebGPUEngine';
    this.scene.performancePriority = webgpu
      ? ScenePerformancePriority.BackwardCompatible
      : ScenePerformancePriority.Intermediate;
    this.scene.constantlyUpdateMeshUnderPointer = false;

    void this.initializeScene();
  }

  private async initializeScene(): Promise<void> {
    this.setupLighting();
    this.setupPhysics();
    this.setupSky();
    await this.setupEffects();

    // Initialize character controller and BehaviorManager BEFORE loading environment
    // This ensures BehaviorManager is ready when behaviors are registered
    this.setupCharacter();

    // Initialize inventory system
    if (this.characterController) {
      InventoryManager.initialize(this.scene, this.characterController);
    }
  }

  /**
   * Completes the scene initialization
   * Environment loading is deferred to switchToEnvironment to allow cutscenes to play
   */
  public completeInitialization(): void {
    // Initialization is complete - environment will be loaded via switchToEnvironment
  }

  private setupLighting(): void {
    this.defaultLight = new BABYLON.HemisphericLight(
      'light',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
  }

  private setupPhysics(): void {
    try {
      const hk = globalThis.HK;
      if (!hk) {
        throw new Error('HK runtime is not initialized on globalThis');
      }
      const physicsPlugin = new BABYLON.HavokPlugin(true, hk);
      this.scene.enablePhysics(CONFIG.PHYSICS.GRAVITY, physicsPlugin);
    } catch (error) {
      console.error('[SceneManager] Failed to initialize Havok physics:', error);
    }
  }

  private setupSky(): void {
    // Sky will be set up when environment is loaded
  }

  private setupCharacter(): void {
    this.characterController = new CharacterController(this.scene);

    // Initialize CharacterLoader with scene and character controller
    CharacterLoader.initialize(this.scene, this.characterController, this);
    registerDeferredScenePerfDevLogFlush((s) => {
      this.flushDeferredScenePerfDevLog(s);
    });

    this.smoothFollowController = new SmoothFollowCameraController(
      this.scene,
      this.camera,
      this.characterController.getDisplayCapsule()
    );

    // Connect the character controller to the camera controller
    this.characterController.setCameraController(this.smoothFollowController);

    // Initialize CameraManager
    CameraManager.initialize(this.smoothFollowController);

    // Initialize HUD
    HUDManager.initialize(this.scene, this.characterController);

    // Initialize Collectibles after character is set up
    void CollectiblesManager.initialize(this.scene, this.characterController);

    // Initialize BehaviorManager after character is set up
    if (this.characterController) {
      BehaviorManager.initialize(this.scene, this.characterController);
      BehaviorManager.setFallRespawnHandlers({
        resetToSpawn: () => {
          this.resetToStartPosition();
        },
        switchEnvironment: switchToEnvironment
      });
    }

    // Force activate smooth follow camera
    this.smoothFollowController.forceActivateSmoothFollow();
  }

  private async setupEffects(): Promise<void> {
    VisualEffectsManager.initialize(this.scene);
    // AudioManager.initialize(this.scene); // Audio initialized on demand

    // Load sound effects from config
    for (const soundEffect of CONFIG.EFFECTS.SOUND_EFFECTS) {
      await AudioManager.createSound(soundEffect.name, soundEffect.url, {
        volume: soundEffect.volume,
        loop: soundEffect.loop
      });
    }

    NodeMaterialManager.initialize(this.scene);
  }

  public getScene(): BABYLON.Scene {
    return this.scene;
  }

  public getCharacterController(): CharacterController | null {
    return this.characterController;
  }

  private discardEnvironmentHiddenTracking(): void {
    this.environmentHiddenUntilCharacterReady.length = 0;
  }

  private stashEnvironmentMeshesHidden(meshes: readonly BABYLON.AbstractMesh[]): void {
    for (const mesh of meshes) {
      if (mesh.isDisposed()) {
        continue;
      }
      mesh.isVisible = false;
      this.environmentHiddenUntilCharacterReady.push(mesh);
    }
  }

  /**
   * Shows environment geometry that was hidden during load. Call only after the playable
   * character mesh is attached, enabled, and {@link resumePhysics} has been invoked.
   */
  public revealEnvironmentWhenCharacterReady(): void {
    for (const mesh of this.environmentHiddenUntilCharacterReady) {
      if (!mesh.isDisposed()) {
        mesh.isVisible = true;
      }
    }
    this.environmentHiddenUntilCharacterReady.length = 0;
  }

  /** Enables the real player mesh, resumes physics, then reveals hidden environment geometry. */
  public showPlayerMeshResumePhysicsAndRevealEnvironment(): void {
    if (this.characterController) {
      const playerMesh = this.characterController.getPlayerMesh();
      const displayCapsule = this.characterController.getDisplayCapsule();
      if (playerMesh && playerMesh !== displayCapsule) {
        playerMesh.isVisible = true;
        playerMesh.setEnabled(true);
      }
    }
    this.resumePhysics();
    this.revealEnvironmentWhenCharacterReady();
    // Same as reset-camera key (e.g. `1`) after physics is on: default offset + smooth follow cleared.
    if (this.characterController) {
      this.characterController.resetCameraToDefaultOffset();
    }
  }

  public getCurrentCharacterName(): string | null {
    return CharacterLoader.getCurrentCharacterName();
  }

  public getCurrentEnvironment(): string {
    return this.currentEnvironment;
  }

  public isEnvironmentLoaded(): boolean {
    return this.environmentLoaded;
  }

  public async loadEnvironment(environmentName: string): Promise<void> {
    BehaviorManager.unregisterFallOutOfWorld();

    // Find the environment by name
    const environment = ASSETS.ENVIRONMENTS.find((env) => env.name === environmentName);
    if (!environment) {
      return;
    }

    await this.stopBackgroundMusicForSwitch();
    const transitionRotationApplied = this.prepareCharacterForEnvironmentSwitch(environment);

    // Clear existing environment particles before creating new ones
    VisualEffectsManager.removeEnvironmentParticles();
    // Also clear ambient sounds before switching
    AudioManager.removeAmbientSounds();
    // Dispose existing environment lights
    this.disposeEnvironmentLights();

    try {
      this.discardEnvironmentHiddenTracking();

      const result = await BABYLON.ImportMeshAsync(environment.model, this.scene);

      // Process node materials for environment meshes
      await NodeMaterialManager.processImportResult(result);

      // Rename the root node to "environment" for better organization
      if (result.meshes.length > 0) {
        // Find the root mesh (the one without a parent)
        const rootMesh = result.meshes.find((mesh) => !mesh.parent);
        if (rootMesh) {
          rootMesh.name = 'environment';
          if (environment.scale !== 1) {
            rootMesh.scaling.x = -environment.scale; // invert X-axis to fix handedness
            rootMesh.scaling.y = environment.scale;
            rootMesh.scaling.z = environment.scale;
          }
        }
      }

      // Keep env invisible until character GLB is attached and physics is resumed (boot + switch).
      this.stashEnvironmentMeshesHidden(result.meshes);

      await this.applyEnvironmentBackgroundMusic(environment);
      this.createEnvironmentSky(environment);

      this.setupEnvironmentPhysics(environment);

      // Set up environment-specific lights if configured
      this.setupEnvironmentLights(environment);

      await this.setupEnvironmentParticles(environment);

      // Process any existing meshes for node materials
      try {
        await NodeMaterialManager.processMeshesForNodeMaterials();
      } catch {
        // Ignore node material processing errors in Playground
      }

      await this.setupEnvironmentAmbientSounds(environment);

      // Environment items will be set up after character is fully loaded
      // This ensures CollectiblesManager is properly initialized

      // Update current environment tracking
      this.currentEnvironment = environmentName;

      // Set up environment items for the new environment BEFORE flipping the loaded flag.
      // Flipping `environmentLoaded` early let the render-loop's one-shot env-switch seed
      // race against the async GLB instantiation of configured items (RV Life's presents and
      // cake are both `collectible`/`physicsInstance` items — the env has no
      // `physicsObjects`). `seedMotionTypesForEnv()` then ran with an empty
      // CollectiblesManager map, `lastTrackedEnvironment`/`lastEnvironmentLoaded` latched,
      // and no later branch re-fired, so items spawned ANIMATED and stayed frozen forever.
      await this.setupEnvironmentItems();
      this.environmentLoaded = true;

      BehaviorManager.registerFallOutOfWorldForEnvironment(environment);

      this.applyPostLoadPerformanceTuning();

      // Do not resume physics or show the world here: wait until the playable character is
      // attached and physics is resumed (SettingsUI.changeEnvironment or CharacterLoader).

      // Apply environment-specific camera offset if configured
      if (environment.cameraOffset !== undefined) {
        CameraManager.setOffset(environment.cameraOffset);
      }

      // Apply environment spawn rotation if transition rotation was not provided
      if (!transitionRotationApplied && this.characterController) {
        this.characterController.setRotation(environment.spawnRotation);
      }
    } catch {
      this.recoverFromEnvironmentLoadFailure();
    }
  }

  private async stopBackgroundMusicForSwitch(): Promise<void> {
    // Fade out and dispose the previous environment's BGM immediately. Otherwise the old
    // track keeps playing for the entire ImportMeshAsync duration of the new environment.
    try {
      await AudioManager.stopAndDisposeBackgroundMusic(1000);
    } catch {
      // Ignore background music errors
    }
  }

  private prepareCharacterForEnvironmentSwitch(environment: Environment): boolean {
    if (!this.characterController) {
      return false;
    }

    this.characterController.pausePhysics();
    if (environment.transitionPosition !== undefined) {
      this.characterController.setPosition(environment.transitionPosition);
    }

    const transitionRotationApplied = environment.transitionRotation !== undefined;
    if (transitionRotationApplied) {
      this.characterController.setRotation(environment.transitionRotation);
    }

    const playerMesh = this.characterController.getPlayerMesh();
    if (playerMesh) {
      playerMesh.isVisible = false;
      playerMesh.setEnabled(false);
    }

    return transitionRotationApplied;
  }

  private async applyEnvironmentBackgroundMusic(environment: Environment): Promise<void> {
    try {
      if (environment.backgroundMusic) {
        await AudioManager.crossfadeBackgroundMusic(
          environment.backgroundMusic.url,
          environment.backgroundMusic.volume,
          1000
        );
      } else {
        await AudioManager.stopAndDisposeBackgroundMusic(1000);
      }
    } catch {
      // Ignore background music errors
    }
  }

  private createEnvironmentSky(environment: Environment): void {
    if (environment.sky === undefined) {
      return;
    }
    try {
      const skyMesh = SkyManager.createSky(this.scene, environment.sky);
      this.stashEnvironmentMeshesHidden([skyMesh]);
    } catch {
      // Ignore sky creation errors
    }
  }

  private async setupEnvironmentParticles(environment: Environment): Promise<void> {
    if (!environment.particles) {
      return;
    }
    try {
      for (const particle of environment.particles) {
        const particleSystem = await VisualEffectsManager.createParticleSystem(
          particle.name,
          particle.position
        );
        if (particleSystem != null && particle.updateSpeed !== undefined) {
          particleSystem.updateSpeed = particle.updateSpeed;
        }
        if (particleSystem != null && 'behavior' in particle && particle.behavior !== undefined) {
          const identifier =
            'instanceName' in particle && particle.instanceName !== undefined
              ? particle.instanceName
              : `particle_${particle.name}_${particle.position.x}_${particle.position.y}_${particle.position.z}`;
          BehaviorManager.registerInstance(
            identifier,
            particleSystem,
            particle.behavior,
            particle.position
          );
        }
      }
    } catch {
      // Ignore particle creation errors
    }
  }

  private async setupEnvironmentAmbientSounds(environment: Environment): Promise<void> {
    if (!environment.ambientSounds || environment.ambientSounds.length === 0) {
      return;
    }
    try {
      await AudioManager.setupAmbientSounds(environment.ambientSounds);
    } catch {
      // Ignore ambient sound setup errors
    }
  }

  private recoverFromEnvironmentLoadFailure(): void {
    this.revealEnvironmentWhenCharacterReady();
    if (!this.characterController) {
      return;
    }

    this.characterController.resumePhysics();
    const playerMesh = this.characterController.getPlayerMesh();
    const displayCapsule = this.characterController.getDisplayCapsule();
    if (playerMesh && playerMesh !== displayCapsule) {
      playerMesh.isVisible = true;
      playerMesh.setEnabled(true);
    }
  }

  private flushDeferredScenePerfDevLog(scene: BABYLON.Scene): void {
    if (scene !== this.scene || !this.scenePerfDevLogDeferred) {
      return;
    }
    const characterName = CharacterLoader.getCurrentCharacterName();
    if (!characterName) {
      return;
    }
    this.scenePerfDevLogDeferred = false;
    const loggedAtIso = new Date().toISOString();
    stampScenePerfConsoleContext(this.scene, {
      environmentName: this.currentEnvironment,
      characterName,
      loggedAtIso
    });
    devLog(
      formatScenePerformanceStats(
        collectScenePerformanceStats(this.scene, {
          environmentName: this.currentEnvironment,
          characterName,
          loggedAtIso
        })
      )
    );
  }

  private applyPostLoadPerformanceTuning(): void {
    const webgpu = this.scene.getEngine().constructor.name === 'WebGPUEngine';

    if (!this.sceneOptimizerStarted && CONFIG.PERFORMANCE.SCENE_OPTIMIZER_ENABLED && !webgpu) {
      this.sceneOptimizerStarted = true;
      this.sceneOptimizer?.stop();
      this.sceneOptimizer?.dispose();
      const perf = CONFIG.PERFORMANCE;
      const opts = new SceneOptimizerOptions(
        perf.SCENE_OPTIMIZER_TARGET_FPS,
        perf.SCENE_OPTIMIZER_TRACK_MS
      );
      opts.addOptimization(
        new HardwareScalingOptimization(0, perf.HARDWARE_SCALING_MAX, perf.HARDWARE_SCALING_STEP)
      );
      // Playground typings do not expose a stable `Scene` import; runtime `BABYLON.Scene` matches `SceneOptimizer`.
      this.sceneOptimizer = SceneOptimizer.OptimizeAsync(
        this.scene as unknown as Parameters<typeof SceneOptimizer.OptimizeAsync>[0],
        opts
      );
    }

    if (isViteDev()) {
      const loggedAtIso = new Date().toISOString();
      const characterName = CharacterLoader.getCurrentCharacterName();
      if (!characterName) {
        // Initial boot: index.ts loads the environment first, then loadCharacterModel. Defer
        // [ScenePerf] until CharacterLoader stamps a name so the console never shows character="(none)".
        this.scenePerfDevLogDeferred = true;
        stampScenePerfConsoleContext(this.scene, {
          environmentName: this.currentEnvironment,
          loggedAtIso
        });
        return;
      }
      this.scenePerfDevLogDeferred = false;
      stampScenePerfConsoleContext(this.scene, {
        environmentName: this.currentEnvironment,
        characterName,
        loggedAtIso
      });
      devLog(
        formatScenePerformanceStats(
          collectScenePerformanceStats(this.scene, {
            environmentName: this.currentEnvironment,
            characterName,
            loggedAtIso
          })
        )
      );
    }
  }

  private setupEnvironmentPhysics(environment: Environment): void {
    this.setupLightmappedMeshes(environment);
    this.setupPhysicsObjects(environment);
    this.setupJoints(environment);

    // Fallback: If no physics objects or lightmapped meshes are configured,
    // create physics bodies for all environment meshes to prevent falling through
    if (environment.physicsObjects.length === 0 && environment.lightmappedMeshes.length === 0) {
      this.setupFallbackPhysics(environment);
    }
  }

  private setupLightmappedMeshes(environment: Environment): void {
    if (!environment.lightmap) return;

    const lightmap = new BABYLON.Texture(environment.lightmap, this.scene);
    lightmap.uAng = Math.PI;

    environment.lightmappedMeshes.forEach((lightmappedMesh) => {
      const mesh = this.scene.getMeshByName(lightmappedMesh.name);
      if (!mesh) return;

      // Add friction to ground meshes - CRITICAL: both objects need friction for it to work
      new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH, { mass: 0, friction: 0.9 });
      mesh.isPickable = false;

      if (mesh.material != null) {
        if (mesh.material instanceof BABYLON.StandardMaterial) {
          mesh.material.lightmapTexture = lightmap;
          mesh.material.useLightmapAsShadowmap = true;
          mesh.material.lightmapTexture.level = lightmappedMesh.level;
          mesh.material.lightmapTexture.coordinatesIndex = 1;
        } else if (mesh.material instanceof BABYLON.PBRMaterial) {
          mesh.material.lightmapTexture = lightmap;
          mesh.material.useLightmapAsShadowmap = true;
          mesh.material.lightmapTexture.level = lightmappedMesh.level;
          mesh.material.lightmapTexture.coordinatesIndex = 1;
        }
      }

      this.optimizeStaticEnvironmentMesh(mesh);
    });
  }

  /**
   * Freezes world matrix / bounding sync for static environment geometry.
   * Do not call material.freeze() here: lights and scene uniforms must keep updating (WebGPU bind groups).
   * Skips skinned meshes.
   */
  private optimizeStaticEnvironmentMesh(mesh: BABYLON.AbstractMesh): void {
    if (!(mesh instanceof BABYLON.Mesh)) {
      return;
    }
    if (mesh.skeleton != null) {
      return;
    }
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
  }

  private setupPhysicsObjects(environment: Environment): void {
    environment.physicsObjects.forEach((physicsObject) => {
      const mesh = this.scene.getMeshByName(physicsObject.name);
      if (mesh) {
        // Apply scaling if specified
        if (physicsObject.scale !== 1) {
          mesh.scaling.setAll(physicsObject.scale);
        }

        const shapeType = this.getPhysicsShapeType(physicsObject.colliderType);
        const options: { mass: number; friction?: number } = { mass: physicsObject.mass };
        if (physicsObject.friction !== undefined) {
          options.friction = physicsObject.friction;
        }
        const aggregate = new BABYLON.PhysicsAggregate(mesh, shapeType, options);

        // ANIMATED-default-then-promote (MULTIPLAYER_SYNCH.md §6.2 rule 4): env physics
        // objects like the RV Life cake must spawn kinematic on every client until env
        // authority is established. `seedMotionTypesForEnv` promotes to DYNAMIC on the
        // resolved owner. Mass=0 bodies are genuinely static and left untouched.
        if (physicsObject.mass > 0 && aggregate.body && !aggregate.body.isDisposed) {
          try {
            aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
            aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
          } catch {
            /* body still initializing; seedMotionTypesForEnv will retry post-join. */
          }
        }

        // Apply glow effect if specified
        if (
          physicsObject.effect === ('GLOW' satisfies EffectType) &&
          mesh instanceof BABYLON.Mesh
        ) {
          VisualEffectsManager.applyGlow(mesh);
        }

        // Register behavior if specified
        if (physicsObject.behavior) {
          BehaviorManager.registerInstance(physicsObject.name, mesh, physicsObject.behavior);
        }

        if (physicsObject.mass === 0) {
          this.optimizeStaticEnvironmentMesh(mesh);
        }
      }
    });
  }

  private getPhysicsShapeType(colliderType: ColliderType | undefined): BABYLON.PhysicsShapeType {
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

  private setupJoints(environment: Environment): void {
    // Find objects with PIVOT_BEAM role
    const pivotBeams = environment.physicsObjects.filter(
      (obj) => obj.role === OBJECT_ROLE.PIVOT_BEAM
    );

    pivotBeams.forEach((pivotBeam) => {
      const beamMesh = this.scene.getMeshByName(pivotBeam.name);
      if (!beamMesh) return;

      beamMesh.scaling.set(3, 0.05, 1);

      // Find a fixed mass object to attach the hinge to
      // Accept both DYNAMIC_BOX (backward compatibility) and DYNAMIC (generic role)
      const fixedMassObject = environment.physicsObjects.find(
        (obj) =>
          (obj.role === OBJECT_ROLE.DYNAMIC_BOX || obj.role === OBJECT_ROLE.DYNAMIC) &&
          obj.mass === 0
      );
      if (!fixedMassObject) return;

      const fixedMesh = this.scene.getMeshByName(fixedMassObject.name);
      if (!fixedMesh) return;

      // Create physics aggregates if they don't exist
      // Add friction to static ground mesh - CRITICAL: both objects need friction for it to work
      const fixedMass = new BABYLON.PhysicsAggregate(fixedMesh, BABYLON.PhysicsShapeType.BOX, {
        mass: 0,
        friction: 0.9
      });
      const beam = new BABYLON.PhysicsAggregate(beamMesh, BABYLON.PhysicsShapeType.BOX, {
        mass: pivotBeam.mass
      });

      // Create hinge constraint
      const joint = new BABYLON.HingeConstraint(
        new BABYLON.Vector3(0.75, 0, 0),
        new BABYLON.Vector3(-0.25, 0, 0),
        new BABYLON.Vector3(0, 0, -1),
        new BABYLON.Vector3(0, 0, 1),
        this.scene
      );

      fixedMass.body.addConstraint(beam.body, joint);
    });
  }

  private setupFallbackPhysics(environment: Environment): void {
    void environment;
    // Find the root environment mesh
    const rootEnvironmentMesh = this.scene.getMeshByName('environment');
    if (!rootEnvironmentMesh) return;

    // Collect all meshes in the environment
    const allEnvironmentMeshes: BABYLON.AbstractMesh[] = [];
    const collectMeshes = (mesh: BABYLON.AbstractMesh) => {
      allEnvironmentMeshes.push(mesh);
      mesh.getChildMeshes().forEach(collectMeshes);
    };
    collectMeshes(rootEnvironmentMesh);

    // Create physics bodies for all meshes with geometry
    allEnvironmentMeshes.forEach((mesh) => {
      if (
        mesh instanceof BABYLON.Mesh &&
        mesh.geometry != null &&
        mesh.geometry.getTotalVertices() > 0
      ) {
        // Create a static physics body (mass = 0) for environment geometry
        // Add friction to ground meshes - CRITICAL: both objects need friction for it to work
        // The physics shape will automatically account for the mesh's current scaling
        new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH, {
          mass: 0,
          friction: 0.9
        });
        mesh.isPickable = false;
        this.optimizeStaticEnvironmentMesh(mesh);
      }
    });
  }

  public async setupEnvironmentItems(): Promise<void> {
    const environment = ASSETS.ENVIRONMENTS.find((env) => env.name === this.currentEnvironment);
    if (environment?.items) {
      try {
        await CollectiblesManager.setupEnvironmentItems(environment);
      } catch {
        // Ignore setup errors for playground compatibility
      }
    }
  }

  public pausePhysics(): void {
    if (this.characterController) {
      this.characterController.pausePhysics();
    }
  }

  public changeCharacter(characterIndexOrName: number | string): void {
    // Find character by index or name
    let character;
    if (typeof characterIndexOrName === 'number') {
      character = ASSETS.CHARACTERS[characterIndexOrName];
    } else {
      character = ASSETS.CHARACTERS.find((c) => c.name === characterIndexOrName);
    }

    if (!character) {
      return;
    }

    // Save current character position before switching
    let currentPosition: BABYLON.Vector3 | null = null;
    if (this.characterController) {
      currentPosition = this.characterController.getPosition().clone();
    }

    // Load the new character with preserved position
    CharacterLoader.loadCharacterModel(character, currentPosition);
  }

  public clearEnvironment(): void {
    BehaviorManager.unregisterFallOutOfWorld();
    this.discardEnvironmentHiddenTracking();

    // Clear all environment-related meshes
    const environmentMeshes = this.scene.meshes.filter(
      (mesh) =>
        mesh.name.includes('environment') ||
        mesh.name.includes('ground') ||
        mesh.name.includes('terrain')
    );
    environmentMeshes.forEach((mesh) => {
      mesh.dispose();
    });
  }

  public clearItems(): void {
    // Clear collectibles without disposing of the CollectiblesManager
    CollectiblesManager.clearCollectibles();

    // Also clear any other item meshes that might not be managed by CollectiblesManager
    const itemMeshes = this.scene.meshes.filter(
      (mesh) =>
        (mesh.name.startsWith('fallback_') ||
          mesh.name.startsWith('crate_') ||
          mesh.name.startsWith('item_') ||
          mesh.name.includes('collectible') ||
          mesh.name.includes('pickup') ||
          mesh.name.includes('treasure') ||
          mesh.name.includes('coin') ||
          mesh.name.includes('gem') ||
          mesh.name.includes('crystal')) &&
        !mesh.name.includes('player') && // Don't clear player character
        !mesh.name.includes('CharacterDisplay') // Don't clear character display capsule
    );

    itemMeshes.forEach((mesh) => {
      // Dispose physics body if it exists
      if (mesh.physicsImpostor) {
        mesh.physicsImpostor.dispose();
      }
      mesh.dispose();
    });
  }

  public clearParticles(): void {
    // Remove only environment-related particle systems
    VisualEffectsManager.removeEnvironmentParticles();

    // Remove only item-related particle systems
    VisualEffectsManager.removeItemParticles();

    // Also clear any unmanaged particle systems that might not be in EffectsManager
    const particleSystems = this.scene.particleSystems;
    const unmanagedParticleSystems = particleSystems.filter(
      (ps) =>
        !ps.name.includes('PLAYER') &&
        !ps.name.includes('player') &&
        !ps.name.includes('character') &&
        !ps.name.includes('thruster') &&
        !ps.name.includes('boost') &&
        // Don't clear particle systems attached to player meshes
        !(
          ps.emitter &&
          typeof ps.emitter === 'object' &&
          'name' in ps.emitter &&
          typeof ps.emitter.name === 'string' &&
          (ps.emitter.name.includes('player') || ps.emitter.name.includes('PLAYER'))
        )
    );

    unmanagedParticleSystems.forEach((ps) => {
      ps.stop();
      ps.dispose();
    });
  }

  public repositionCharacter(): void {
    if (this.characterController) {
      // Get the current environment's spawn point
      const environment = ASSETS.ENVIRONMENTS.find((env) => env.name === this.currentEnvironment);
      const spawnPoint = environment?.spawnPoint ?? new BABYLON.Vector3(0, 1, 0);
      this.characterController.setPosition(spawnPoint);
    }
  }

  public forceActivateSmoothFollow(): void {
    if (this.smoothFollowController != null) {
      this.smoothFollowController.forceActivateSmoothFollow();
    }
  }

  public resumePhysics(): void {
    if (this.characterController) {
      this.characterController.resumePhysics();
    }
  }

  public isPhysicsPaused(): boolean {
    return this.characterController?.isPhysicsPaused() ?? false;
  }

  public resetToStartPosition(): void {
    if (this.characterController) {
      const environment = ASSETS.ENVIRONMENTS.find((env) => env.name === this.currentEnvironment);
      const spawnPoint = environment?.spawnPoint ?? this.zeroVector;
      this.characterController.setPosition(spawnPoint);
      this.characterController.setVelocity(this.zeroVector);
      this.characterController.resetInputDirection();
    }
  }

  /**
   * Disposes all environment-specific lights
   */
  private disposeEnvironmentLights(): void {
    // Enable default light before disposing environment lights
    // This ensures default light is available when switching to environment without lights
    if (this.defaultLight !== null) {
      this.defaultLight.setEnabled(true);
    }

    for (const light of this.environmentLights) {
      light.dispose();
    }
    this.environmentLights = [];
  }

  /**
   * Creates a light from a LightConfig using discriminated union
   * @param config The light configuration
   * @returns The created light or null if creation failed
   */
  private createLightFromConfig(config: LightConfig): BABYLON.Light | null {
    try {
      let light: BABYLON.Light;

      switch (config.lightType) {
        case 'POINT': {
          light = new BABYLON.PointLight(config.name ?? 'PointLight', config.position, this.scene);
          if (config.range !== undefined) {
            const pointLight = light;
            if (pointLight instanceof BABYLON.PointLight) {
              pointLight.range = config.range;
            }
          }
          if (config.radius !== undefined) {
            const pointLight = light;
            if (pointLight instanceof BABYLON.PointLight) {
              pointLight.radius = config.radius;
            }
          }
          break;
        }
        case 'DIRECTIONAL': {
          light = new BABYLON.DirectionalLight(
            config.name ?? 'DirectionalLight',
            config.direction,
            this.scene
          );
          break;
        }
        case 'SPOT': {
          light = new BABYLON.SpotLight(
            config.name ?? 'SpotLight',
            config.position,
            config.direction,
            config.angle ?? Math.PI / 3,
            config.exponent ?? 2,
            this.scene
          );
          if (config.range !== undefined) {
            const spotLight = light;
            if (spotLight instanceof BABYLON.SpotLight) {
              spotLight.range = config.range;
            }
          }
          break;
        }
        case 'HEMISPHERIC': {
          light = new BABYLON.HemisphericLight(
            config.name ?? 'HemisphericLight',
            config.direction,
            this.scene
          );
          break;
        }
        case 'RECTANGULAR_AREA': {
          light = new BABYLON.RectAreaLight(
            config.name ?? 'RectangularAreaLight',
            config.position,
            config.width ?? 1,
            config.height ?? 1,
            this.scene
          );
          break;
        }
        default: {
          return null;
        }
      }

      // Apply common properties
      if (config.diffuseColor !== undefined) {
        light.diffuse = config.diffuseColor;
      }
      if (config.intensity !== undefined) {
        light.intensity = config.intensity;
      }
      if (config.specularColor !== undefined) {
        light.specular = config.specularColor;
      }

      return light;
    } catch {
      return null;
    }
  }

  /**
   * Sets up environment-specific lights from configuration
   * @param environment The environment configuration
   */
  private setupEnvironmentLights(environment: Environment): void {
    if (environment.lights && environment.lights.length > 0) {
      // Environment has lights configured - disable default light
      if (this.defaultLight !== null) {
        this.defaultLight.setEnabled(false);
      }

      // Create environment lights
      for (const lightConfig of environment.lights) {
        const light = this.createLightFromConfig(lightConfig);
        if (light !== null) {
          this.environmentLights.push(light);
        }
      }
    } else {
      // Environment has no lights configured - enable default light
      if (this.defaultLight !== null) {
        this.defaultLight.setEnabled(true);
      }
    }
  }

  public dispose(): void {
    this.sceneOptimizer?.stop();
    this.sceneOptimizer?.dispose();
    this.sceneOptimizer = null;

    if (this.characterController) {
      this.characterController.dispose();
    }
    if (this.smoothFollowController) {
      this.smoothFollowController.dispose();
    }

    CameraManager.dispose();
    BehaviorManager.dispose();

    // Dispose cached character meshes via CharacterLoader
    CharacterLoader.pruneCache(0); // Clear all cached characters

    AudioManager.removeAllSounds();
    this.scene.dispose();
  }
}
