// ============================================================================
// SIMULATION MANAGER — Circuit Hijack simulation
// ============================================================================

import { INPUT_KEYS } from '../config/input_keys';
import { Notification } from '../utils/notification';

import { SIMULATION_CONFIG } from './simulation_config';

import type {
  StateAdjustTarget,
  StateSimulationConfig,
  StateSimulationState,
  StateMovementModifiers,
  StateOutcome,
  StatePulseKind,
  StateRole
} from './simulation_types';
import type { BehaviorAction } from '../types/behaviors';

export interface StateHandlers {
  readonly applyBehaviorAction: (action: BehaviorAction) => void;
}

export class StateSimulationManager {
  private static scene: BABYLON.Scene | null = null;
  private static config: StateSimulationConfig = SIMULATION_CONFIG;
  private static updateObserver: BABYLON.Observer<BABYLON.Scene> | null = null;
  private static keyboardObserver: BABYLON.Observer<BABYLON.KeyboardInfo> | null = null;

  private static d1 = 0;
  private static d2 = 0;
  private static rpe = 0;
  private static expectedReward = 0;
  private static habitEncoding = 0;
  private static drugHunger = 0;
  private static accAwareness = 0;
  private static insulaAccCoupling = 0;

  private static inSafeZone = false;
  private static inAccAnchor = false;
  private static labelUrgeHeld = false;
  private static lastDrugUseMs = 0;
  private static regulationSecondsAccum = 0;
  private static outcome: StateOutcome = 'playing';
  private static notifiedLowD2 = false;
  private static notifiedHighHunger = false;

  public static isInitialized(): boolean {
    return this.scene !== null;
  }

  public static initialize(scene: BABYLON.Scene): void {
    this.dispose();
    this.scene = scene;
    this.config = SIMULATION_CONFIG;
    const init = this.config.INITIAL;
    this.d1 = init.d1;
    this.d2 = init.d2;
    this.expectedReward = init.expectedReward;
    this.habitEncoding = init.habitEncoding;
    this.drugHunger = init.drugHunger;
    this.accAwareness = init.accAwareness;
    this.insulaAccCoupling = init.insulaAccCoupling;
    this.rpe = 0;
    this.inSafeZone = false;
    this.inAccAnchor = false;
    this.labelUrgeHeld = false;
    this.lastDrugUseMs = Date.now();
    this.regulationSecondsAccum = 0;
    this.outcome = 'playing';
    this.notifiedLowD2 = false;
    this.notifiedHighHunger = false;

    this.keyboardObserver = scene.onKeyboardObservable.add((kb) => {
      if (
        kb.type !== BABYLON.KeyboardEventTypes.KEYDOWN &&
        kb.type !== BABYLON.KeyboardEventTypes.KEYUP
      ) {
        return;
      }
      const pressed = kb.type === BABYLON.KeyboardEventTypes.KEYDOWN;
      const key = kb.event.key.toLowerCase();
      if (INPUT_KEYS.INTERACT.some((k) => k === key)) {
        this.labelUrgeHeld = pressed;
      }
    });

    this.updateObserver = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      this.tick(dt > 0 ? dt : 0);
    });

    Notification.create({
      scene,
      message:
        'SynapticLab: avoid glowing crystals, resist orange cues, hold [F] in the blue zone, recover in green.',
      duration: 7000,
      position: 'bottom',
      background: 'rgba(20, 10, 40, 0.9)',
      color: '#e8e0ff',
      fontSize: '13px'
    });
  }

  public static dispose(): void {
    if (this.scene && this.updateObserver) {
      this.scene.onBeforeRenderObservable.remove(this.updateObserver);
    }
    if (this.scene && this.keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
    }
    this.updateObserver = null;
    this.keyboardObserver = null;
    this.scene = null;
  }

  /** Values for HUD meter ids (d1, d2, rpe, hunger, coupling, habit). */
  public static getMeterValues(): Record<string, number> {
    const snap = this.getSnapshot();
    return {
      d1: snap.d1,
      d2: snap.d2,
      rpe: snap.rpe,
      hunger: snap.drugHunger,
      coupling: snap.insulaAccCoupling,
      habit: snap.habitEncoding
    };
  }

  public static handleItemCollectRole(role: string): void {
    const known: StateRole[] = ['drug', 'cravingCue', 'safeZone', 'accAnchor', 'pfcExercise'];
    if (known.includes(role as StateRole)) {
      this.handleItemStateRole(role as StateRole);
    }
  }

  public static getSnapshot(): StateSimulationState {
    return {
      d1: this.d1,
      d2: this.d2,
      rpe: this.rpe,
      expectedReward: this.expectedReward,
      habitEncoding: this.habitEncoding,
      drugHunger: this.drugHunger,
      accAwareness: this.accAwareness,
      insulaAccCoupling: this.insulaAccCoupling
    };
  }

  public static getOutcome(): StateOutcome {
    return this.outcome;
  }

  public static getMovementModifiers(): StateMovementModifiers {
    const { THRESHOLDS, REGULATION } = this.config;
    let speedMultiplier = 1;
    if (this.d2 < REGULATION.lowD2Threshold) {
      speedMultiplier += THRESHOLDS.lowD2SpeedBoost;
    }
    if (this.d1 > REGULATION.highD1Threshold) {
      speedMultiplier += THRESHOLDS.highD1SpeedBoost;
    }
    let jumpDelayMultiplier = 1;
    if (this.d2 < REGULATION.lowD2Threshold) {
      jumpDelayMultiplier = THRESHOLDS.lowD2JumpDelayFactor;
    }
    return { speedMultiplier, jumpDelayMultiplier };
  }

  public static setStateZone(zone: 'safe' | 'accAnchor', active: boolean): void {
    if (zone === 'safe') {
      this.inSafeZone = active;
    } else {
      this.inAccAnchor = active;
    }
  }

  /** Maps config `volumeZone` strings (e.g. safe, accAnchor) to internal zone flags. */
  public static setVolumeZone(zoneId: string, active: boolean): void {
    if (zoneId === 'safe' || zoneId === 'accAnchor') {
      this.setStateZone(zoneId, active);
    }
  }

  public static handleBehaviorAction(action: BehaviorAction): void {
    if (action.actionType === 'simulationPulse') {
      this.applyPulse(action.pulseKind, action.magnitude);
    } else if (action.actionType === 'adjustSimulation') {
      this.adjustState(action.target, action.amount);
    } else if (action.actionType === 'setCoupling') {
      this.insulaAccCoupling = this.clamp01(Math.max(this.insulaAccCoupling, action.amount));
    }
  }

  public static handleItemStateRole(role: StateRole): void {
    switch (role) {
      case 'drug':
        this.applyDrugUse();
        break;
      case 'cravingCue':
        this.applyCueRPE(this.config.CUE.rpeMagnitude);
        break;
      case 'safeZone':
        this.inSafeZone = true;
        break;
      case 'accAnchor':
        this.inAccAnchor = true;
        this.insulaAccCoupling = this.clamp01(
          this.insulaAccCoupling + this.config.REGULATION.accAnchorCouplingPerTick
        );
        break;
      case 'pfcExercise':
        this.adjustState('d2', 0.05);
        break;
      default:
        break;
    }
  }

  public static applyDrugUse(): void {
    const drug = this.config.DRUG;
    this.d1 = this.clamp01(this.d1 + drug.d1UpregPerUse);
    this.d2 = this.clamp01(this.d2 - drug.d2DownregPerUse);
    this.drugHunger = this.clamp01(this.drugHunger - drug.hungerRelief);
    this.lastDrugUseMs = Date.now();
    this.fireRPE(drug.rpeActualReward);
    if (this.scene) {
      Notification.create({
        scene: this.scene,
        message: 'Phasic surge — D1 accelerator sensitizing',
        duration: 2200,
        position: 'top',
        background: 'rgba(120, 40, 180, 0.85)',
        color: '#fff'
      });
    }
  }

  public static applyCueRPE(magnitude: number): void {
    const cue = this.config.CUE;
    this.fireRPE(cue.actualReward, magnitude);
  }

  public static adjustState(target: StateAdjustTarget, amount: number): void {
    switch (target) {
      case 'd1':
        this.d1 = this.clamp01(this.d1 + amount);
        break;
      case 'd2':
        this.d2 = this.clamp01(this.d2 + amount);
        break;
      case 'drugHunger':
        this.drugHunger = this.clamp01(this.drugHunger + amount);
        break;
      case 'habitEncoding':
        this.habitEncoding = this.clamp01(this.habitEncoding + amount);
        break;
      case 'accAwareness':
        this.accAwareness = this.clamp01(this.accAwareness + amount);
        break;
      default:
        break;
    }
  }

  private static applyPulse(kind: StatePulseKind, magnitude: number): void {
    if (kind === 'drug') {
      this.applyDrugUse();
      return;
    }
    if (kind === 'craving') {
      this.applyCueRPE(magnitude);
      return;
    }
    this.fireRPE(magnitude, magnitude);
  }

  private static fireRPE(actualReward: number, scale = 1): void {
    const delta = (actualReward - this.expectedReward) * scale;
    const rpeGain = 1.2;
    this.rpe = this.clamp01(Math.abs(delta) * rpeGain);
    this.expectedReward =
      this.expectedReward * (1 - this.config.DECAY.expectedRewardAlpha) +
      actualReward * this.config.DECAY.expectedRewardAlpha;
    this.habitEncoding = this.clamp01(
      this.habitEncoding + this.config.DECAY.habitGainFromRpe * this.rpe
    );
    this.checkLose();
  }

  private static tick(dt: number): void {
    if (this.outcome !== 'playing') {
      return;
    }

    const decay = this.config.DECAY;
    const reg = this.config.REGULATION;

    const halfLife = decay.rpeHalfLifeMs / 1000;
    if (halfLife > 0) {
      const decayFactor = Math.pow(0.5, dt / halfLife);
      this.rpe *= decayFactor;
    }

    const d2Deficit = 1 - this.d2;
    const couplingFactor = 1 - this.insulaAccCoupling * reg.hungerGrowthCouplingFactor;
    const secondsSinceDrug = (Date.now() - this.lastDrugUseMs) / 1000;
    const abstinenceFactor = Math.min(1 + secondsSinceDrug / 45, 2.2);
    this.drugHunger = this.clamp01(
      this.drugHunger +
        decay.hungerRisePerSecond *
          dt *
          couplingFactor *
          abstinenceFactor *
          (1 + d2Deficit * decay.hungerD2DeficitMultiplier)
    );

    if (this.inSafeZone) {
      this.d2 = this.clamp01(this.d2 + decay.d2RecoveryPerSecondInSafeZone * dt);
      this.insulaAccCoupling = this.clamp01(
        this.insulaAccCoupling + reg.safeZoneCouplingBoost * dt
      );
    }

    if (this.inAccAnchor) {
      this.insulaAccCoupling = this.clamp01(
        this.insulaAccCoupling + reg.accAnchorCouplingPerTick * dt
      );
    }

    if (this.inAccAnchor && this.labelUrgeHeld) {
      this.accAwareness = this.clamp01(
        this.accAwareness + decay.accAwarenessRisePerSecondWhileLabeling * dt
      );
    } else {
      this.accAwareness = this.clamp01(this.accAwareness - decay.accAwarenessDecayPerSecond * dt);
    }

    if (!this.inAccAnchor && !this.inSafeZone) {
      this.insulaAccCoupling = this.clamp01(
        this.insulaAccCoupling - decay.couplingDecayPerSecond * dt
      );
    }

    this.maybeNotifyThresholds();
    this.checkWin(dt);
    this.checkLose();
  }

  private static checkWin(dt: number): void {
    const win = this.config.LOSE_WIN;
    if (
      this.inSafeZone &&
      this.habitEncoding <= win.habitEncodingWinMax &&
      this.insulaAccCoupling >= win.winCouplingMin
    ) {
      this.regulationSecondsAccum += dt;
      if (this.regulationSecondsAccum >= win.winRegulationSeconds) {
        this.outcome = 'won';
        this.showOutcome(
          'Regulation restored — goal-directed control returning',
          'rgba(0, 120, 80, 0.9)'
        );
      }
    } else {
      this.regulationSecondsAccum = 0;
    }
  }

  private static checkLose(): void {
    if (this.habitEncoding >= this.config.LOSE_WIN.habitEncodingLose) {
      this.outcome = 'lost';
      this.showOutcome('Habit encoded — compulsive seeking dominates', 'rgba(140, 20, 40, 0.92)');
    }
  }

  private static maybeNotifyThresholds(): void {
    if (!this.scene) {
      return;
    }
    const reg = this.config.REGULATION;
    if (this.d2 < reg.lowD2Threshold && !this.notifiedLowD2) {
      this.notifiedLowD2 = true;
      Notification.create({
        scene: this.scene,
        message: 'Brakes failing — OFC/ACC hypoactive (low D2)',
        duration: 3500,
        position: 'top-right',
        background: 'rgba(40, 40, 80, 0.88)',
        color: '#eef'
      });
    }
    if (this.d2 >= reg.lowD2Threshold + 0.08) {
      this.notifiedLowD2 = false;
    }
    if (
      this.drugHunger > reg.highHungerThreshold &&
      this.accAwareness < reg.lowAccThreshold &&
      !this.notifiedHighHunger
    ) {
      this.notifiedHighHunger = true;
      Notification.create({
        scene: this.scene,
        message: 'Drug hunger — insula signaling urges the ACC',
        duration: 3500,
        position: 'top-left',
        background: 'rgba(80, 30, 30, 0.88)',
        color: '#fdd'
      });
    }
    if (this.drugHunger < reg.highHungerThreshold - 0.1) {
      this.notifiedHighHunger = false;
    }
  }

  private static showOutcome(message: string, background: string): void {
    if (!this.scene) {
      return;
    }
    Notification.create({
      scene: this.scene,
      message,
      duration: 6000,
      position: 'center',
      background,
      color: '#fff',
      fontSize: '18px',
      fontWeight: '600'
    });
  }

  private static clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
