// ============================================================================
// BabylonJS PLAYGROUND V2 - MULTIFILE ENTRY POINT
// ============================================================================
//
// This file is the entry used by both the Vite dev build (via `main.ts`) and
// the exported `playground.json` snippet. When running inside
// https://playground.babylonjs.com/ the student MUST enable the Havok WASM
// plugin via the playground's top-right "Add WASM plugin" menu. Multiplayer
// targets the default shared server (`CONFIG.MULTIPLAYER.PRODUCTION_SERVER`);
// append `?mp=host[:port]` or `#mp=host[:port]` to the playground URL to
// point at an instructor-hosted server instead. See MULTIPLAYER.md for the
// full classroom walkthrough.

// /// <reference path="./types/babylon.d.ts" />

import { ASSETS, SIMULATION_LAB_ENVIRONMENT_NAME } from './config/assets';
import { AudioManager } from './managers/audio_manager';
import { CharacterLoader } from './managers/character_loader';
import { HUDManager } from './managers/hud_manager';
import { initMultiplayerAfterCharacterReady } from './managers/multiplayer_bootstrap';
import { getMultiplayerManager } from './managers/multiplayer_manager';
import { OverlayManager } from './managers/overlay_manager';
import { SceneManager } from './managers/scene_manager';
import {
  disposeSimulation,
  isSimulationActive,
  setSimulationQueryOverride
} from './simulation/simulation_bootstrap';
import { InventoryUI } from './ui/inventory_ui';
import { SettingsUI } from './ui/settings_ui';
import { getQueryParam, isQueryFlagEnabled, queryHook } from './utils/query_hook';
import { switchToEnvironment } from './utils/switch_environment';

/**
 * Global cleanup function to remove all UI elements from DOM
 * This prevents orphaned elements when the playground is rerun
 */
function cleanupUI(): void {
  disposeSimulation();
  HUDManager.cleanup();
  SettingsUI.cleanup();
  InventoryUI.cleanup();
  OverlayManager.dispose();
}

/** Draco + AudioV2 bootstrap for playground (main.ts does this for local Vite). */
function configurePlaygroundRuntimeGlobals(): void {
  if (globalThis.BABYLON?.Tools) {
    globalThis.BABYLON.Tools.ScriptBaseUrl = 'https://cdn.babylonjs.com';
  }

  const decoder = globalThis.BABYLON?.DracoCompression?.Configuration?.decoder;
  if (decoder) {
    decoder.wasmUrl = 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js';
    decoder.wasmBinaryUrl = 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm';
    decoder.fallbackUrl = 'https://cdn.babylonjs.com/draco_decoder_gltf.js';
  }
}

class Playground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): BABYLON.Scene {
    configurePlaygroundRuntimeGlobals();
    void AudioManager.ensurePlaygroundAudioReady();

    // Clean up any existing UI elements before creating new ones
    cleanupUI();
    setSimulationQueryOverride(isQueryFlagEnabled('sim'));
    const overlayFromQuery = getQueryParam('overlay');
    if (overlayFromQuery) {
      OverlayManager.setQueryCatalogName(overlayFromQuery);
    }
    void getMultiplayerManager()
      .leave()
      .catch(() => undefined);

    const sceneManager = new SceneManager(engine, canvas);

    // Initialize settings UI with scene manager
    SettingsUI.initialize(canvas, sceneManager);

    // Initialize inventory UI with scene manager
    InventoryUI.initialize(canvas, sceneManager);

    // Check for fullscreen query parameter and activate if present
    queryHook(['fullscreen'], (values) => {
      const fullscreenValue = values.get('fullscreen');
      if (fullscreenValue?.toLowerCase() === 'true') {
        SettingsUI.toggleSplitRendering(true);
      }
    });

    // Check for pgui query parameter and hide Babylon Playground UI if false
    queryHook(['pgui'], (values) => {
      const pguiValue = values.get('pgui');
      if (pguiValue?.toLowerCase() === 'false') {
        SettingsUI.togglePlaygroundUI(false);
      }
    });

    // Complete scene initialization
    sceneManager.completeInitialization();

    // Trigger initial environment load with cutscene support
    // TypeScript needs help narrowing the type from the satisfies constraint
    const defaultEnv =
      ASSETS.ENVIRONMENTS.find((env) => 'isDefault' in env && env.isDefault === true) ??
      ASSETS.ENVIRONMENTS[0];
    if (!defaultEnv) {
      throw new Error('ASSETS.ENVIRONMENTS must contain at least one environment');
    }
    const useSimulationLab = isSimulationActive();
    const labEnv = ASSETS.ENVIRONMENTS.find((env) => env.name === SIMULATION_LAB_ENVIRONMENT_NAME);
    const initialEnv = useSimulationLab && labEnv ? labEnv : defaultEnv;
    const initialEnvironmentName = initialEnv.name;
    void switchToEnvironment(initialEnvironmentName).then(() => {
      const spawnPoint = initialEnv.spawnPoint ?? new BABYLON.Vector3(0, 1, 0);
      CharacterLoader.loadCharacterModel(undefined, undefined, spawnPoint);
      void initMultiplayerAfterCharacterReady(sceneManager, initialEnvironmentName);
    });

    return sceneManager.getScene();
  }
}

export { Playground };
