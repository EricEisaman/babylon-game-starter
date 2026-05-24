// ============================================================================
// BEHAVIOR MANAGER
// ============================================================================

import {
  registerFallRespawnHandler,
  runFallRespawnHandler,
  runGlobalOnFellOffMapHook
} from './fall_respawn_hooks';
import { VisualEffectsManager } from './visual_effects_manager';

import type { CharacterController } from '../controllers/character_controller';
import type {
  BehaviorConfig,
  CheckPeriod,
  ProximityTriggerConfig,
  BehaviorAction,
  FallOutOfWorldTriggerConfig
} from '../types/behaviors';
import type { Environment } from '../types/environment';

const FALL_OUT_OF_WORLD_INSTANCE_ID = '__fall_out_of_world__';
const FALL_RECOVER_Y_MARGIN = 5;
const DEFAULT_FALL_DEPTH_BELOW_SPAWN = 100;

export interface FallRespawnHandlers {
  readonly resetToSpawn: () => void;
  readonly switchEnvironment: (name: string) => Promise<void>;
}

export interface CreditHandlers {
  readonly getTotalCredits: () => number;
  readonly adjustCredits: (amount: number) => void;
}

export interface SimulationBehaviorHandlers {
  readonly handleBehaviorAction: (action: BehaviorAction) => void;
  readonly setVolumeZone: (zoneId: string, active: boolean) => void;
}

/**
 * Internal tracking structure for behavior instances
 */
interface BehaviorInstance {
  readonly identifier: string;
  readonly mesh: BABYLON.AbstractMesh | null;
  readonly particleSystem: BABYLON.IParticleSystem | null;
  readonly position: BABYLON.Vector3 | null;
  readonly config: BehaviorConfig;
  behaviorActive: boolean;
  lastCheckTime: number;
  lastActionTime: number;
  /** Throttle proximity evaluation when checkPeriod is interval (ms since epoch). */
  lastProximityEvaluationTime: number;
  /** Cached trigger result aligned with lastProximityEvaluationTime window. */
  cachedProximityTriggerResult: boolean;
  /** Fall trigger: when true, the next OOB may fire a respawn. */
  fallMayTrigger?: boolean;
  fallRespawnInProgress?: boolean;
}

export class BehaviorManager {
  private static scene: BABYLON.Scene | null = null;
  private static characterController: CharacterController | null = null;
  private static instances = new Map<string, BehaviorInstance>();
  private static updateObserver: BABYLON.Observer<BABYLON.Scene> | null = null;
  private static fallHandlers: FallRespawnHandlers | null = null;
  private static creditHandlers: CreditHandlers | null = null;
  private static simulationHandlers: SimulationBehaviorHandlers | null = null;

  /**
   * Scene callbacks for fall respawn (avoids importing SceneManager).
   */
  public static setFallRespawnHandlers(handlers: FallRespawnHandlers | null): void {
    this.fallHandlers = handlers;
  }

  public static setCreditHandlers(handlers: CreditHandlers | null): void {
    this.creditHandlers = handlers;
  }

  public static setSimulationHandlers(handlers: SimulationBehaviorHandlers | null): void {
    this.simulationHandlers = handlers;
  }

  /**
   * Initializes the BehaviorManager with a scene and character controller
   */
  public static initialize(scene: BABYLON.Scene, characterController: CharacterController): void {
    this.scene = scene;
    this.characterController = characterController;
    this.instances.clear();
    registerFallRespawnHandler('dystopiaStripCreditsOnFallRespawn', () => {
      const total = this.creditHandlers?.getTotalCredits() ?? 0;
      if (total > 0) {
        this.creditHandlers?.adjustCredits(-total);
      }
    });
    this.startUpdateLoop();
  }

  /**
   * Registers fall-out-of-world monitoring for the loaded environment (no mesh).
   * `minSafeY` defaults to spawn Y minus {@link DEFAULT_FALL_DEPTH_BELOW_SPAWN} when omitted in assets.
   */
  public static registerFallOutOfWorldForEnvironment(environment: Environment): void {
    if (!this.scene) {
      return;
    }

    const fr = environment.fallRespawn;
    const minSafeY = fr?.minSafeY ?? environment.spawnPoint.y - DEFAULT_FALL_DEPTH_BELOW_SPAWN;
    const fullConfig: FallOutOfWorldTriggerConfig = {
      triggerKind: 'fallOutOfWorld',
      ...(fr ?? {}),
      minSafeY
    };

    const instance: BehaviorInstance = {
      identifier: FALL_OUT_OF_WORLD_INSTANCE_ID,
      mesh: null,
      particleSystem: null,
      position: null,
      config: fullConfig,
      behaviorActive: false,
      lastCheckTime: Date.now(),
      lastActionTime: 0,
      lastProximityEvaluationTime: 0,
      cachedProximityTriggerResult: false,
      fallMayTrigger: true,
      fallRespawnInProgress: false
    };

    this.instances.set(FALL_OUT_OF_WORLD_INSTANCE_ID, instance);
  }

  public static unregisterFallOutOfWorld(): void {
    this.unregisterInstance(FALL_OUT_OF_WORLD_INSTANCE_ID);
  }

  /**
   * Registers an instance with a behavior configuration
   */
  public static registerInstance(
    identifier: string,
    target: BABYLON.AbstractMesh | BABYLON.IParticleSystem,
    behaviorConfig: BehaviorConfig,
    position?: BABYLON.Vector3
  ): void {
    if (!this.scene) {
      return;
    }

    const isMesh = target instanceof BABYLON.AbstractMesh;
    const instance: BehaviorInstance = {
      identifier,
      mesh: isMesh ? target : null,
      particleSystem: isMesh ? null : target,
      position: position ?? null,
      config: behaviorConfig,
      behaviorActive: false,
      lastCheckTime: Date.now(),
      lastActionTime: 0,
      lastProximityEvaluationTime: 0,
      cachedProximityTriggerResult: false
    };

    this.instances.set(identifier, instance);
  }

  /**
   * Unregisters an instance and removes any active behaviors
   */
  public static unregisterInstance(identifier: string): void {
    const instance = this.instances.get(identifier);
    if (instance) {
      if (instance.behaviorActive) {
        this.removeEffects(instance);
      }
      this.instances.delete(identifier);
    }
  }

  /**
   * Disposes of the BehaviorManager and cleans up all instances
   */
  public static dispose(): void {
    this.stopUpdateLoop();

    // Remove all active behaviors
    this.instances.forEach((instance) => {
      if (instance.behaviorActive) {
        this.removeEffects(instance);
      }
    });

    this.instances.clear();
    this.scene = null;
    this.characterController = null;
    this.fallHandlers = null;
    this.creditHandlers = null;
  }

  /**
   * Starts the update loop that checks trigger conditions
   */
  private static startUpdateLoop(): void {
    if (!this.scene || this.updateObserver) {
      return;
    }

    this.updateObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.updateBehaviors();
    });
  }

  /**
   * Stops the update loop
   */
  private static stopUpdateLoop(): void {
    if (this.updateObserver && this.scene) {
      this.scene.onBeforeRenderObservable.remove(this.updateObserver);
      this.updateObserver = null;
    }
  }

  /**
   * Updates all behavior instances based on their trigger conditions
   */
  private static updateBehaviors(): void {
    if (!this.scene || !this.characterController) {
      return;
    }

    const currentTime = Date.now();

    this.instances.forEach((instance) => {
      if (instance.config.triggerKind === 'fallOutOfWorld') {
        this.updateFallOutOfWorld(instance);
        return;
      }

      // Always check trigger every frame to detect enter/leave proximity
      const triggerResult = this.evaluateProximityTrigger(instance);

      if (triggerResult && !instance.behaviorActive) {
        // Entering proximity - apply effects and execute action immediately
        this.applyEffects(instance);
        this.notifyVolumeZoneEnter(instance);
        this.executeActionIfNeeded(instance, currentTime, true);
        instance.behaviorActive = true;
        instance.lastCheckTime = currentTime;
      } else if (triggerResult && instance.behaviorActive) {
        // Already in proximity - execute action based on its own timing
        // Action execution timing is independent of trigger check timing
        this.executeActionIfNeeded(instance, currentTime, false);
        instance.lastCheckTime = currentTime;
      } else if (!triggerResult && instance.behaviorActive) {
        // Leaving proximity - remove effects
        this.removeEffects(instance);
        this.notifyVolumeZoneExit(instance);
        instance.behaviorActive = false;
      }
    });
  }

  private static updateFallOutOfWorld(instance: BehaviorInstance): void {
    if (!this.characterController) {
      return;
    }

    const config = instance.config as FallOutOfWorldTriggerConfig;
    const checkPeriod = this.getCheckPeriod(config);
    const now = Date.now();
    let oob: boolean;
    if (checkPeriod.type === 'interval') {
      if (now - instance.lastProximityEvaluationTime < checkPeriod.milliseconds) {
        oob = instance.cachedProximityTriggerResult;
      } else {
        instance.lastProximityEvaluationTime = now;
        oob = this.computeOutOfBounds(this.characterController.getPosition(), config);
        instance.cachedProximityTriggerResult = oob;
      }
    } else {
      oob = this.computeOutOfBounds(this.characterController.getPosition(), config);
    }

    const recoverY = config.recoverSafeY ?? config.minSafeY + FALL_RECOVER_Y_MARGIN;
    const pos = this.characterController.getPosition();

    const mayTrigger = instance.fallMayTrigger !== false;
    if (!mayTrigger) {
      if (pos.y >= recoverY) {
        instance.fallMayTrigger = true;
      }
      return;
    }

    if (oob && !instance.fallRespawnInProgress) {
      if (!this.fallHandlers) {
        return;
      }
      void this.executeFallRespawn(instance).catch((err: unknown) => {
        console.error('[BehaviorManager] fall respawn failed:', err);
      });
    }
  }

  private static computeOutOfBounds(
    pos: BABYLON.Vector3,
    config: FallOutOfWorldTriggerConfig
  ): boolean {
    if (pos.y < config.minSafeY) {
      return true;
    }
    const b = config.bounds;
    if (!b) {
      return false;
    }
    if (b.maxSafeY !== undefined && pos.y > b.maxSafeY) {
      return true;
    }
    if (b.minX !== undefined && pos.x < b.minX) {
      return true;
    }
    if (b.maxX !== undefined && pos.x > b.maxX) {
      return true;
    }
    if (b.minZ !== undefined && pos.z < b.minZ) {
      return true;
    }
    if (b.maxZ !== undefined && pos.z > b.maxZ) {
      return true;
    }
    return false;
  }

  private static async executeFallRespawn(instance: BehaviorInstance): Promise<void> {
    const handlers = this.fallHandlers;
    if (!handlers || instance.fallRespawnInProgress) {
      return;
    }

    if (instance.config.triggerKind !== 'fallOutOfWorld') {
      return;
    }
    const config = instance.config;
    instance.fallRespawnInProgress = true;
    instance.fallMayTrigger = false;

    try {
      const targetEnv = config.respawnEnvironmentName;
      if (targetEnv !== undefined && targetEnv.length > 0) {
        await handlers.switchEnvironment(targetEnv);
      } else {
        handlers.resetToSpawn();
      }
      await runGlobalOnFellOffMapHook();
      await runFallRespawnHandler(config.onRespawnedHandlerId);
    } finally {
      instance.fallRespawnInProgress = false;
    }
  }

  /**
   * Gets the check period for a behavior config, defaulting to "everyFrame"
   */
  private static getCheckPeriod(config: BehaviorConfig): CheckPeriod {
    if (config.triggerKind === 'fallOutOfWorld') {
      return config.checkPeriod ?? { type: 'everyFrame' };
    }
    return config.checkPeriod ?? { type: 'everyFrame' };
  }

  /**
   * Evaluates proximity trigger condition
   */
  private static evaluateProximityTrigger(instance: BehaviorInstance): boolean {
    if (!this.characterController) {
      return false;
    }

    const config: ProximityTriggerConfig = instance.config as ProximityTriggerConfig;
    const checkPeriod = this.getCheckPeriod(config);
    const now = Date.now();
    if (checkPeriod.type === 'interval') {
      if (now - instance.lastProximityEvaluationTime < checkPeriod.milliseconds) {
        return instance.cachedProximityTriggerResult;
      }
      instance.lastProximityEvaluationTime = now;
    }

    const characterPosition = this.characterController.getPosition();

    let instancePosition: BABYLON.Vector3;
    if (instance.mesh) {
      instancePosition = instance.mesh.position;
    } else if (instance.position) {
      // Use stored position for particle systems
      instancePosition = instance.position;
    } else if (instance.particleSystem) {
      // Fallback to reading from emitter if position not stored
      const emitter = instance.particleSystem.emitter;
      if (emitter instanceof BABYLON.Vector3) {
        instancePosition = emitter;
      } else if (emitter instanceof BABYLON.AbstractMesh) {
        instancePosition = emitter.position;
      } else {
        return false;
      }
    } else {
      return false;
    }

    const radiusSquared = config.radius * config.radius;
    const distanceSquared = BABYLON.Vector3.DistanceSquared(characterPosition, instancePosition);
    const isWithinRadius = distanceSquared <= radiusSquared;

    const result = config.triggerOutOfRange === true ? !isWithinRadius : isWithinRadius;
    instance.cachedProximityTriggerResult = result;
    return result;
  }

  /**
   * Applies visual effects to an instance (called once when entering proximity)
   */
  private static applyEffects(instance: BehaviorInstance): void {
    const config: ProximityTriggerConfig = instance.config as ProximityTriggerConfig;

    // Apply glow behavior if mesh is available
    if (instance.mesh) {
      const edgeColor = config.edgeColor ?? new BABYLON.Color4(1, 0, 0, 1);
      const edgeWidth = config.edgeWidth ?? 5;
      VisualEffectsManager.applyGlow(instance.mesh.name, edgeColor, edgeWidth);
    }
  }

  /**
   * Removes visual effects from an instance (called when leaving proximity)
   */
  private static removeEffects(instance: BehaviorInstance): void {
    if (instance.mesh) {
      VisualEffectsManager.removeGlow(instance.mesh.name);
    }
  }

  /**
   * Checks if action should execute and executes it if needed
   * Called periodically while in proximity
   * @param forceImmediate If true, execute immediately regardless of check period (for first entry)
   */
  private static executeActionIfNeeded(
    instance: BehaviorInstance,
    currentTime: number,
    forceImmediate: boolean
  ): void {
    const config: ProximityTriggerConfig = instance.config as ProximityTriggerConfig;
    if (!config.action) {
      return;
    }

    const checkPeriod = this.getCheckPeriod(instance.config);

    // Check if action should execute based on check period
    if (checkPeriod.type === 'interval') {
      if (forceImmediate) {
        // Execute immediately on first entry into proximity
        this.executeAction(instance, config.action);
        instance.lastActionTime = currentTime;
      } else {
        // Execute periodically based on interval while in proximity
        const elapsed = currentTime - instance.lastActionTime;
        if (elapsed >= checkPeriod.milliseconds) {
          this.executeAction(instance, config.action);
          instance.lastActionTime = currentTime;
        }
      }
    } else {
      // For everyFrame, execute every frame while in proximity
      this.executeAction(instance, config.action);
      instance.lastActionTime = currentTime;
    }
  }

  /**
   * Executes an action for a behavior instance
   */
  private static executeAction(instance: BehaviorInstance, action: BehaviorAction): void {
    void instance;
    if (action.actionType === 'adjustCredits') {
      this.creditHandlers?.adjustCredits(action.amount);
    } else if (action.actionType === 'portal') {
      void this.fallHandlers?.switchEnvironment(action.target);
    } else if (
      action.actionType === 'simulationPulse' ||
      action.actionType === 'adjustSimulation' ||
      action.actionType === 'setCoupling'
    ) {
      this.simulationHandlers?.handleBehaviorAction(action);
    }
  }

  private static notifyVolumeZoneEnter(instance: BehaviorInstance): void {
    const config = instance.config as ProximityTriggerConfig;
    if (config.triggerKind !== 'proximity' || !config.volumeZone) {
      return;
    }
    this.simulationHandlers?.setVolumeZone(config.volumeZone, true);
  }

  private static notifyVolumeZoneExit(instance: BehaviorInstance): void {
    const config = instance.config as ProximityTriggerConfig;
    if (config.triggerKind !== 'proximity' || !config.volumeZone) {
      return;
    }
    this.simulationHandlers?.setVolumeZone(config.volumeZone, false);
  }
}
