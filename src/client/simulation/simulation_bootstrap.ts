// ============================================================================
// SIMULATION BOOTSTRAP — wires optional StateSimulationManager into BGS
// ============================================================================

import { CONFIG } from '../config/game_config';
import { BehaviorManager } from '../managers/behavior_manager';
import { HUDManager } from '../managers/hud_manager';
import { OverlayManager } from '../managers/overlay_manager';

import { StateSimulationManager } from './state_simulation_manager';

let simulationQueryOverride = false;

export function setSimulationQueryOverride(enabled: boolean): void {
  simulationQueryOverride = enabled;
}

export function isSimulationActive(): boolean {
  return CONFIG.SIMULATION.ENABLED || simulationQueryOverride;
}

export function initializeSimulationIfEnabled(scene: BABYLON.Scene): void {
  if (!isSimulationActive()) {
    return;
  }

  StateSimulationManager.initialize(scene);
  BehaviorManager.setSimulationHandlers({
    handleBehaviorAction: (action) => {
      StateSimulationManager.handleBehaviorAction(action);
    },
    setVolumeZone: (zoneId, active) => {
      StateSimulationManager.setVolumeZone(zoneId, active);
    }
  });
  HUDManager.enableSimulationMeters(CONFIG.SIMULATION.METERS);
}

export function disposeSimulation(): void {
  simulationQueryOverride = false;
  BehaviorManager.setSimulationHandlers(null);
  HUDManager.disableSimulationMeters();
  StateSimulationManager.dispose();
  OverlayManager.clearAllOverlays();
}
