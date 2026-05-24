// ============================================================================
// BEHAVIOR TYPE DEFINITIONS
// ============================================================================

/**
 * Discriminated union for check period configuration
 * Controls how frequently trigger conditions are evaluated
 */
export type CheckPeriod =
  | { readonly type: 'everyFrame' }
  | { readonly type: 'interval'; readonly milliseconds: number };

/**
 * Union type for behavior kinds
 */
export type BehaviorKind = 'glow';

/**
 * Union type for trigger kinds
 */
export type TriggerKind = 'proximity' | 'fallOutOfWorld';

/**
 * Optional axis-aligned "safe volume" outside which counts as out of world (in addition to minSafeY).
 */
export interface FallRespawnBounds {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
  readonly maxSafeY?: number;
}

/**
 * Optional fall-off-map tuning and per-environment hook id. Respawn to this environment’s spawn
 * (or `respawnEnvironmentName` when set) is always enabled; this block does not turn respawn on/off.
 */
export interface FallRespawnConfig {
  readonly minSafeY?: number;
  readonly recoverSafeY?: number;
  readonly bounds?: FallRespawnBounds;
  readonly checkPeriod?: CheckPeriod;
  readonly respawnEnvironmentName?: string;
  readonly onRespawnedHandlerId?: string;
}

/**
 * Action type for adjustCredits
 */
export interface AdjustCreditsAction {
  readonly actionType: 'adjustCredits';
  readonly amount: number;
}

/**
 * Action type for portal
 */
export interface PortalAction {
  readonly actionType: 'portal';
  readonly target: string;
}

/** Simulation pulse (optional edu-sim module; see StateSimulationManager). */
export interface SimulationPulseAction {
  readonly actionType: 'simulationPulse';
  readonly pulseKind: 'rpe' | 'craving' | 'drug';
  readonly magnitude: number;
}

export interface AdjustSimulationAction {
  readonly actionType: 'adjustSimulation';
  readonly target: 'd1' | 'd2' | 'drugHunger' | 'habitEncoding' | 'accAwareness';
  readonly amount: number;
}

export interface SetCouplingAction {
  readonly actionType: 'setCoupling';
  readonly amount: number;
}

/**
 * Discriminated union for behavior actions
 */
export type BehaviorAction =
  | AdjustCreditsAction
  | PortalAction
  | SimulationPulseAction
  | AdjustSimulationAction
  | SetCouplingAction;

/**
 * Configuration for proximity-based trigger
 */
export interface ProximityTriggerConfig {
  readonly triggerKind: 'proximity';
  readonly radius: number;
  readonly checkPeriod?: CheckPeriod; // Defaults to "everyFrame" if not specified
  readonly triggerOutOfRange?: boolean; // When true, applies behavior when character is OUTSIDE radius
  readonly edgeColor?: BABYLON.Color4;
  readonly edgeWidth?: number;
  readonly action?: BehaviorAction; // Optional action to execute when triggered
  /** Named volume for enter/exit callbacks (e.g. safe zone, anchor). */
  readonly volumeZone?: string;
}

/**
 * Fall / out-of-bounds trigger: evaluated globally from character position (no mesh).
 * `minSafeY` is the resolved threshold after merging env assets with defaults.
 */
export interface FallOutOfWorldTriggerConfig extends Omit<FallRespawnConfig, 'minSafeY'> {
  readonly triggerKind: 'fallOutOfWorld';
  readonly minSafeY: number;
}

/**
 * Discriminated union for behavior configurations
 * Each trigger type has its own configuration interface
 */
export type BehaviorConfig = ProximityTriggerConfig | FallOutOfWorldTriggerConfig;
