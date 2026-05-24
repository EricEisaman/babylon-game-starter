// ============================================================================
// SIMULATION CONFIGURATION — Circuit Hijack
// ============================================================================

import type { StateSimulationConfig } from './simulation_types';

export const SIMULATION_CONFIG: StateSimulationConfig = {
  INITIAL: {
    d1: 0.35,
    d2: 0.75,
    expectedReward: 0.4,
    habitEncoding: 0.15,
    drugHunger: 0.1,
    accAwareness: 0.5,
    insulaAccCoupling: 0.4
  },
  DRUG: {
    d1UpregPerUse: 0.12,
    d2DownregPerUse: 0.1,
    rpeActualReward: 1.0,
    hungerRelief: 0.35
  },
  CUE: {
    rpeMagnitude: 0.55,
    actualReward: 0
  },
  DECAY: {
    rpeHalfLifeMs: 900,
    expectedRewardAlpha: 0.15,
    habitGainFromRpe: 0.08,
    hungerRisePerSecond: 0.018,
    hungerD2DeficitMultiplier: 1.4,
    d2RecoveryPerSecondInSafeZone: 0.025,
    couplingDecayPerSecond: 0.04,
    accAwarenessRisePerSecondWhileLabeling: 0.12,
    accAwarenessDecayPerSecond: 0.02
  },
  REGULATION: {
    lowD2Threshold: 0.35,
    highD1Threshold: 0.65,
    highHungerThreshold: 0.7,
    lowAccThreshold: 0.35,
    accAnchorCouplingPerTick: 0.08,
    safeZoneCouplingBoost: 0.03,
    hungerGrowthCouplingFactor: 0.5
  },
  LOSE_WIN: {
    habitEncodingLose: 0.9,
    habitEncodingWinMax: 0.3,
    winCouplingMin: 0.5,
    winRegulationSeconds: 10
  },
  THRESHOLDS: {
    lowD2SpeedBoost: 0.35,
    highD1SpeedBoost: 0.25,
    lowD2JumpDelayFactor: 1.8
  }
} as const;
