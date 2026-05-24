// ============================================================================
// SIMULATION TYPE DEFINITIONS — Circuit Hijack (Volkow-model inspired)
// ============================================================================

export type StateAdjustTarget = 'd1' | 'd2' | 'drugHunger' | 'habitEncoding' | 'accAwareness';

export type StatePulseKind = 'rpe' | 'craving' | 'drug';

export type StateRole = 'drug' | 'cravingCue' | 'safeZone' | 'accAnchor' | 'pfcExercise';

export interface StateSimulationState {
  readonly d1: number;
  readonly d2: number;
  readonly rpe: number;
  readonly expectedReward: number;
  readonly habitEncoding: number;
  readonly drugHunger: number;
  readonly accAwareness: number;
  readonly insulaAccCoupling: number;
}

export interface StateMovementModifiers {
  readonly speedMultiplier: number;
  readonly jumpDelayMultiplier: number;
}

export type StateOutcome = 'playing' | 'won' | 'lost';

export interface StateSimulationInitialConfig {
  readonly d1: number;
  readonly d2: number;
  readonly expectedReward: number;
  readonly habitEncoding: number;
  readonly drugHunger: number;
  readonly accAwareness: number;
  readonly insulaAccCoupling: number;
}

export interface StateSimulationDrugConfig {
  readonly d1UpregPerUse: number;
  readonly d2DownregPerUse: number;
  readonly rpeActualReward: number;
  readonly hungerRelief: number;
}

export interface StateSimulationCueConfig {
  readonly rpeMagnitude: number;
  readonly actualReward: number;
}

export interface StateSimulationDecayConfig {
  readonly rpeHalfLifeMs: number;
  readonly expectedRewardAlpha: number;
  readonly habitGainFromRpe: number;
  readonly hungerRisePerSecond: number;
  readonly hungerD2DeficitMultiplier: number;
  readonly d2RecoveryPerSecondInSafeZone: number;
  readonly couplingDecayPerSecond: number;
  readonly accAwarenessRisePerSecondWhileLabeling: number;
  readonly accAwarenessDecayPerSecond: number;
}

export interface StateSimulationRegulationConfig {
  readonly lowD2Threshold: number;
  readonly highD1Threshold: number;
  readonly highHungerThreshold: number;
  readonly lowAccThreshold: number;
  readonly accAnchorCouplingPerTick: number;
  readonly safeZoneCouplingBoost: number;
  readonly hungerGrowthCouplingFactor: number;
}

export interface StateSimulationLoseWinConfig {
  readonly habitEncodingLose: number;
  readonly habitEncodingWinMax: number;
  readonly winCouplingMin: number;
  readonly winRegulationSeconds: number;
}

export interface StateSimulationThresholdEffectsConfig {
  readonly lowD2SpeedBoost: number;
  readonly highD1SpeedBoost: number;
  readonly lowD2JumpDelayFactor: number;
}

export interface StateSimulationConfig {
  readonly INITIAL: StateSimulationInitialConfig;
  readonly DRUG: StateSimulationDrugConfig;
  readonly CUE: StateSimulationCueConfig;
  readonly DECAY: StateSimulationDecayConfig;
  readonly REGULATION: StateSimulationRegulationConfig;
  readonly LOSE_WIN: StateSimulationLoseWinConfig;
  readonly THRESHOLDS: StateSimulationThresholdEffectsConfig;
}
