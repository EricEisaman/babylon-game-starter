// ============================================================================
// ENVIRONMENT TYPE DEFINITIONS
// ============================================================================

import type { BehaviorConfig, FallRespawnConfig } from './behaviors';
import type { ItemEffectKind } from './config';
import type { EffectType, EnvironmentOverlayBinding } from './effects';

export const OBJECT_ROLE = {
  DYNAMIC_BOX: 'DYNAMIC_BOX',
  DYNAMIC: 'DYNAMIC',
  PIVOT_BEAM: 'PIVOT_BEAM'
} as const;

export type ObjectRole = (typeof OBJECT_ROLE)[keyof typeof OBJECT_ROLE];

export interface LightmappedMesh {
  readonly name: string;
  readonly level: number;
}

export type ColliderType = 'BOX' | 'SPHERE' | 'CAPSULE' | 'CYLINDER' | 'CONVEX_HULL' | 'MESH';

export type CutSceneType = 'image' | 'video';

export interface CutScene {
  readonly type: CutSceneType;
  readonly visualUrl: string;
  readonly audioUrl?: string;
  /**
   * When true, the target environment may load while this cutscene plays. When false or omitted,
   * the environment loads only after cutscene playback ends.
   */
  readonly concurrent?: boolean;
  /**
   * When true, the cutscene image or video opacity eases from 0 to 1 so the visual appears from black.
   */
  readonly fadeInEnabled?: boolean;
  /**
   * When true, the cutscene image or video opacity eases from 1 to 0 before the overlay is removed.
   */
  readonly fadeOutEnabled?: boolean;
  /** Duration in ms for each fade phase that is enabled; defaults to 600 when omitted. */
  readonly fadeDurationMs?: number;
}

export interface PhysicsObject {
  readonly name: string;
  readonly mass: number;
  readonly scale: number;
  readonly role: ObjectRole;
  readonly colliderType?: ColliderType;
  readonly friction?: number;
  readonly effect?: EffectType;
  readonly behavior?: BehaviorConfig;
}

export interface EnvironmentParticle {
  readonly name: string; // Name of the particle snippet to use
  readonly position: BABYLON.Vector3; // Position where the particle should be created
  readonly updateSpeed?: number; // Optional update speed for the particle system
  readonly instanceName?: string; // Optional instance name for behavior registration
  readonly behavior?: BehaviorConfig; // Optional behavior configuration
}

export interface BackgroundMusicConfig {
  readonly url: string;
  readonly volume: number;
}

export interface AmbientSoundConfig {
  readonly url: string;
  readonly volume: number;
  readonly position: BABYLON.Vector3;
  readonly rollOff?: number; // Defaults to 2
  readonly maxDistance?: number; // Defaults to 40
}

/** @deprecated Use `overlays` + `CONFIG.EFFECTS.OVERLAY_SNIPPETS` via OverlayManager. */
export interface EnvironmentSmartFilter {
  readonly snippetId: string;
  readonly enabled?: boolean;
}

// ============================================================================
// LIGHT TYPE DEFINITIONS
// ============================================================================

export type LightType = 'POINT' | 'DIRECTIONAL' | 'SPOT' | 'HEMISPHERIC' | 'RECTANGULAR_AREA';

export interface BaseLightConfig {
  readonly lightType: LightType;
  readonly name?: string;
  readonly diffuseColor?: BABYLON.Color3;
  readonly intensity?: number;
  readonly specularColor?: BABYLON.Color3;
}

export interface PointLightConfig extends BaseLightConfig {
  readonly lightType: 'POINT';
  readonly position: BABYLON.Vector3;
  readonly range?: number;
  readonly radius?: number;
}

export interface DirectionalLightConfig extends BaseLightConfig {
  readonly lightType: 'DIRECTIONAL';
  readonly direction: BABYLON.Vector3;
}

export interface SpotLightConfig extends BaseLightConfig {
  readonly lightType: 'SPOT';
  readonly position: BABYLON.Vector3;
  readonly direction: BABYLON.Vector3;
  readonly angle?: number;
  readonly exponent?: number;
  readonly range?: number;
}

export interface HemisphericLightConfig extends BaseLightConfig {
  readonly lightType: 'HEMISPHERIC';
  readonly direction: BABYLON.Vector3;
}

export interface RectangularAreaLightConfig extends BaseLightConfig {
  readonly lightType: 'RECTANGULAR_AREA';
  readonly position: BABYLON.Vector3;
  readonly direction: BABYLON.Vector3;
  readonly width?: number;
  readonly height?: number;
}

export type LightConfig =
  | PointLightConfig
  | DirectionalLightConfig
  | SpotLightConfig
  | HemisphericLightConfig
  | RectangularAreaLightConfig;

export interface Environment {
  readonly name: string;
  readonly model: string;
  isDefault?: boolean;
  readonly lightmap: string;
  readonly scale: number;
  readonly lightmappedMeshes: readonly LightmappedMesh[];
  readonly physicsObjects: readonly PhysicsObject[];
  locked?: boolean; // Locked state - runtime state managed separately via EnvironmentLock utility
  readonly sky?: SkyConfig; // Optional sky configuration for this environment
  readonly spawnPoint: BABYLON.Vector3; // Spawn point for this environment
  readonly spawnRotation: BABYLON.Vector3; // Spawn rotation for this environment
  readonly transitionPosition?: BABYLON.Vector3; // Optional transition position during environment change
  readonly transitionRotation?: BABYLON.Vector3; // Optional transition rotation during environment change
  readonly particles?: readonly EnvironmentParticle[]; // Optional environment particles
  readonly items?: readonly ItemConfig[]; // Optional items configuration for this environment
  readonly backgroundMusic?: BackgroundMusicConfig; // Optional looping non-positional BGM
  readonly ambientSounds?: readonly AmbientSoundConfig[]; // Optional positional ambient sounds
  readonly lights?: readonly LightConfig[]; // Optional environment-specific lights
  readonly cameraOffset?: BABYLON.Vector3; // Optional camera offset for this environment
  readonly cutScene?: CutScene; // Optional cutscene to play when switching to this environment
  /**
   * Optional fall-off-map tuning and per-environment `onRespawnedHandlerId`. Fall respawn to this
   * env’s spawn (or cross-env when configured) is always active without this block.
   */
  readonly fallRespawn?: FallRespawnConfig;
  /** Full-screen overlays (SFE / NME / dom) — cleared on every environment switch. */
  readonly overlays?: readonly EnvironmentOverlayBinding[];
  /** @deprecated Prefer `overlays`. */
  readonly smartFilter?: EnvironmentSmartFilter;
}

// Forward declarations for circular dependencies
export interface SkyConfig {
  readonly TEXTURE_URL: string;
  readonly ROTATION_Y: number;
  readonly BLUR: number;
  readonly TYPE: SkyType;
}

export type SkyType = 'BOX' | 'SPHERE';

export interface ItemConfig {
  readonly name: string;
  readonly url: string;
  readonly collectible: boolean;
  readonly creditValue?: number;
  readonly minImpulseForCollection: number;
  readonly instances: readonly ItemInstance[];
  readonly inventory?: boolean;
  readonly thumbnail?: string;
  readonly itemEffectKind?: ItemEffectKind;
  /** Optional simulation collect role when CONFIG.SIMULATION.ENABLED. */
  readonly collectRole?: string;
}

export interface ItemInstance {
  readonly position: BABYLON.Vector3;
  readonly scale: number;
  readonly rotation: BABYLON.Vector3;
  readonly mass: number;
  readonly colliderType?: ColliderType;
  readonly friction?: number;
  readonly instanceName?: string;
  readonly effect?: EffectType;
  readonly behavior?: BehaviorConfig;
  /** NME snippet id applied to spawned mesh (no #nm prefix in GLB name). */
  readonly materialSnippetId?: string;
}
