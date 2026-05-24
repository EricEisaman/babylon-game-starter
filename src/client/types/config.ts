// ============================================================================
// CONFIGURATION TYPE DEFINITIONS
// ============================================================================

import type { EffectsConfig } from './effects';
import type { HUDConfig, HudMeterDefinition, InventoryConfig, SettingsConfig } from './ui';

export interface CharacterSpeed {
  readonly WALK: number;
  readonly RUN: number;
  readonly JUMP: number;
}

export interface CharacterConfig {
  readonly SPEED: CharacterSpeed;
  readonly CAPSULE_HEIGHT: number;
  readonly CAPSULE_RADIUS: number;
  readonly MASS: number;
  readonly FRICTION: number;
  readonly RESTITUTION: number;
  readonly ROTATION_SMOOTHING: number;
  readonly ANIMATION_BLEND: number;
  readonly JUMP_DELAY: number;
}

export interface CameraConfig {
  readonly START_POSITION: BABYLON.Vector3;
  readonly OFFSET: BABYLON.Vector3;
  readonly DRAG_SENSITIVITY: number;
  readonly ZOOM_MIN: number;
  readonly ZOOM_MAX: number;
  readonly FOLLOW_SMOOTHING: number;
}

export interface PhysicsConfig {
  readonly GRAVITY: BABYLON.Vector3;
  readonly CHARACTER_GRAVITY: BABYLON.Vector3;
}

export interface AnimationConfig {
  readonly PLAYER_SCALE: number;
  readonly PLAYER_Y_OFFSET: number;
}

export interface DebugConfig {
  readonly CAPSULE_VISIBLE: boolean;
}

/** Rendering / engine tuning (SceneOptimizer, WebGPU, camera). OpenPBR / IBL / SDF text are optional product choices when a measured need appears. */
export interface PerformanceConfig {
  /** Far clip plane for the main camera (smaller = better depth precision when safe). */
  readonly CAMERA_MAX_Z: number;
  /** Babylon SceneOptimizer: adaptive hardware scaling toward a target FPS. */
  readonly SCENE_OPTIMIZER_ENABLED: boolean;
  readonly SCENE_OPTIMIZER_TARGET_FPS: number;
  readonly SCENE_OPTIMIZER_TRACK_MS: number;
  /** Passed to HardwareScalingOptimization (max engine hardware scaling level). */
  readonly HARDWARE_SCALING_MAX: number;
  readonly HARDWARE_SCALING_STEP: number;
  /**
   * Prefer WebGPUEngine when the browser exposes WebGPU; falls back to WebGL Engine.
   * Default off: some scenes still hit WebGPU material/bind-group edge cases; enable when validated.
   */
  readonly WEBGPU_WHEN_AVAILABLE: boolean;
}

export interface MultiplayerConfig {
  readonly ENABLED: boolean;
  /** Default public host when not using `VITE_MULTIPLAYER_HOST` (host[:port], no scheme). */
  readonly PRODUCTION_SERVER: string;
  /** Default dev host when not using `VITE_MULTIPLAYER_HOST` (host[:port], no scheme). */
  readonly LOCAL_SERVER: string;
  readonly CONNECTION_TIMEOUT_MS: number;
  /** When no `VITE_MULTIPLAYER_HOST`: try `PRODUCTION_SERVER` before `LOCAL_SERVER`. */
  readonly PRODUCTION_FIRST: boolean;
  /** Per-item authority proximity claim radius in world-space meters (MULTIPLAYER_SYNCH.md §4.7). */
  readonly CLAIM_RADIUS_METERS: number;
  /** Grace period (ms) after bubble exit before the owner releases authority. */
  readonly CLAIM_GRACE_MS: number;
  /** Server-side idle timeout (ms) after which another claim can override a stale owner. */
  readonly CLAIM_IDLE_TIMEOUT_MS: number;
}

export interface SimulationConfig {
  readonly ENABLED: boolean;
  readonly METERS: readonly HudMeterDefinition[];
}

export interface GameConfig {
  readonly CHARACTER: CharacterConfig;
  readonly CAMERA: CameraConfig;
  readonly PHYSICS: PhysicsConfig;
  readonly ANIMATION: AnimationConfig;
  readonly DEBUG: DebugConfig;
  readonly PERFORMANCE: PerformanceConfig;
  readonly EFFECTS: EffectsConfig;
  readonly HUD: HUDConfig;
  readonly SETTINGS: SettingsConfig;
  readonly INVENTORY: InventoryConfig;
  readonly MULTIPLAYER: MultiplayerConfig;
  readonly SIMULATION: SimulationConfig;
}

export type ItemEffectKind = 'superJump' | 'invisibility' | 'gamma';
