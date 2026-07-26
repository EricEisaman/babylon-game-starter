/**
 * Main TypeScript Entry Point
 * Initializes the Babylon Game Starter application
 */

import '@babylonjs/core/Legacy/legacy';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_mesh_gpu_instancing';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_meshopt_compression';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_pbrSpecularGlossiness';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/SPLAT/splatFileLoader';
import '@babylonjs/materials/legacy/legacy';
import {
  CreateSoundAsync,
  CreateStreamingSoundAsync
} from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
import * as PhysicsV2 from '@babylonjs/core/Physics/v2/index';

import { CONFIG } from './config/game_config';
import {
  applyPwaUpdate as applyPwaUpdateImpl,
  initPwa,
  isPwaSupported as isPwaSupportedImpl,
  isPwaUpdateAvailable as isPwaUpdateAvailableImpl,
  onPwaUpdateAvailable as onPwaUpdateAvailableImpl,
  purgePwaCache as purgePwaCacheImpl
} from './pwa/pwa_client';
import { initChromiumInstallPrompt } from './pwa/pwa_install';
import { loadBrandingConfig } from './utils/branding_config';
import { loadChatConfig } from './utils/chat_config';
import { devLog } from './utils/dev_log';
import {
  isInstallOfferAvailable,
  maybeShowInstallCoach,
  onInstallOfferChanged,
  recordPwaVisit,
  showInstallInstructions
} from './utils/pwa_install_coach';
import { registerPwaRuntime } from './utils/pwa_runtime';
import { readScenePerfConsoleContext } from './utils/scene_perf_console_stamp';
import {
  collectScenePerformanceStats,
  formatScenePerformanceStats
} from './utils/scene_performance_stats';
import { readViteEnv } from './utils/vite_env';

import { Playground } from './index';

type RenderEnginePreference = 'webgl' | 'webgpu';

/**
 * Resolves the render backend: `VITE_ENGINE` (e.g. `npm run dev:wgpu`) overrides
 * `CONFIG.PERFORMANCE.ENGINE`. Playground builds have no Vite env → config default.
 */
function resolveRenderEnginePreference(): RenderEnginePreference {
  const envEngine = readViteEnv()?.VITE_ENGINE;
  if (envEngine === 'webgpu' || envEngine === 'webgl') {
    return envEngine;
  }
  return CONFIG.PERFORMANCE.ENGINE;
}

// Global variables
let engine: BABYLON.AbstractEngine | null = null;
let scene: BABYLON.Scene | null = null;

async function loadInspectorIfDev(): Promise<void> {
  if (import.meta.env.DEV) {
    await import('@babylonjs/inspector');
  }
}

async function createEngine(canvas: HTMLCanvasElement): Promise<BABYLON.AbstractEngine> {
  const engineOpts = {
    antialias: true,
    powerPreference: 'high-performance' as const
  };

  const preferredEngine = resolveRenderEnginePreference();
  if (preferredEngine === 'webgpu') {
    try {
      const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine');
      if (await WebGPUEngine.IsSupportedAsync) {
        const webgpu = new WebGPUEngine(canvas, {
          ...engineOpts,
          powerPreference: 'high-performance'
        });
        await webgpu.initAsync();
        devLog('[Main] WebGPU engine active');
        // ESM WebGPUEngine vs UMD BABYLON.AbstractEngine (playground dual stack) diverge slightly in .d.ts.
        return webgpu as unknown as BABYLON.AbstractEngine;
      }
      devLog('[Main] WebGPU not supported, using WebGL');
    } catch (err) {
      devLog('[Main] WebGPU unavailable, using WebGL', err);
    }
  }

  return new BABYLON.Engine(canvas, true, engineOpts);
}

async function initializeRuntimeGlobals(): Promise<void> {
  // Ensure v2 physics APIs are available on global BABYLON (Playground-style access).
  if (globalThis.BABYLON) {
    Object.assign(globalThis.BABYLON, PhysicsV2, {
      PhysicsCharacterController: PhysicsV2.PhysicsCharacterController,
      CharacterSupportedState: PhysicsV2.CharacterSupportedState,
      CreateAudioEngineAsync,
      CreateSoundAsync,
      CreateStreamingSoundAsync
    });
    // Babylon v9 rewrites default CDN paths to versioned URLs (e.g. /v9.2.0/...);
    // Draco decoder assets are not always published under versioned paths.
    if (globalThis.BABYLON.Tools) {
      globalThis.BABYLON.Tools.ScriptBaseUrl = 'https://cdn.babylonjs.com';
    }

    const decoder = globalThis.BABYLON.DracoCompression?.Configuration?.decoder;
    if (decoder) {
      decoder.wasmUrl = 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js';
      decoder.wasmBinaryUrl = 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm';
      decoder.fallbackUrl = 'https://cdn.babylonjs.com/draco_decoder_gltf.js';
    }

    const meshopt = globalThis.BABYLON.MeshoptCompression?.Configuration?.decoder;
    if (meshopt) {
      meshopt.url = 'https://cdn.babylonjs.com/meshopt_decoder.js';
    }
  }

  // Mirror Playground runtime behavior: resolve HK from global HavokPhysics factory.
  if (typeof globalThis.HavokPhysics !== 'function') {
    throw new Error(
      'HavokPhysics global is missing. Ensure HavokPhysics_umd.js is loaded before main.ts.'
    );
  }

  if (typeof globalThis.HK === 'undefined') {
    globalThis.HK = await globalThis.HavokPhysics();
  }

  if (!globalThis.__babylonAudioEngine) {
    const audioEngine = await CreateAudioEngineAsync({
      volume: 1,
      listenerEnabled: true,
      listenerAutoUpdate: true
    });
    globalThis.__babylonAudioEngine = audioEngine;
  }
}

function scheduleInitPwa(): void {
  const run = (): void => {
    void initPwa();
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * Initializes the application
 */
async function initialize(): Promise<void> {
  try {
    devLog('[Main] Initializing Babylon Game Starter...');
    await loadBrandingConfig();
    await loadChatConfig();
    registerPwaRuntime({
      isSupported: isPwaSupportedImpl,
      isUpdateAvailable: isPwaUpdateAvailableImpl,
      onUpdateAvailable: onPwaUpdateAvailableImpl,
      applyUpdate: applyPwaUpdateImpl,
      purgeCache: purgePwaCacheImpl,
      isInstallOfferAvailable,
      onInstallOfferChanged,
      showInstallInstructions,
      maybeShowInstallCoach,
      recordPwaVisit
    });
    initChromiumInstallPrompt();
    recordPwaVisit();
    maybeShowInstallCoach();
    scheduleInitPwa();
    await loadInspectorIfDev();

    // Get canvas element
    const canvasElement = document.getElementById('renderCanvas');
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element not found');
    }
    const canvas = canvasElement;

    devLog('[Main] Canvas found');

    // Create engine from VITE_ENGINE or CONFIG.PERFORMANCE.ENGINE ('webgl' | 'webgpu')
    engine = await createEngine(canvas);

    devLog('[Main] Engine created');

    await initializeRuntimeGlobals();

    // Create scene using Playground
    devLog('[Main] Creating scene from Playground...');
    scene = Playground.CreateScene(engine, canvas);
    devLog('[Main] Scene created successfully');

    // Setup render loop
    setupRenderLoop();

    // Hide loading screen
    hideLoadingScreen();

    devLog('[Main] Initialization complete');
  } catch (error) {
    console.error('[Main] Initialization failed:', error);
    displayError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Sets up the render loop
 */
function setupRenderLoop(): void {
  if (!engine || !scene) {
    return;
  }

  engine.runRenderLoop(() => {
    scene?.render();
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    engine?.resize();
  });
}

/**
 * Hides the loading screen
 */
function hideLoadingScreen(): void {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
    devLog('[Main] Hiding loading screen');
    loadingScreen.classList.add('hidden');
  }
}

/**
 * Displays an error message to the user
 * @param message - Error message to display
 */
function displayError(message: string): void {
  const errorElement = document.createElement('div');
  errorElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 12px 20px;
        max-width: 400px;
        z-index: 9999;
        font-family: monospace;
        font-size: 14px;
    `;
  errorElement.textContent = `Error: ${message}`;
  document.body.appendChild(errorElement);

  setTimeout(() => {
    errorElement.remove();
  }, 5000);
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (scene) {
    scene.dispose();
  }
  if (engine) {
    engine.dispose();
  }
});

// Expose to window for debugging
window.__babylon = {
  BABYLON,
  engine: () => engine,
  scene: () => scene,
  logSceneStats: () => {
    if (!scene) {
      return;
    }
    const { environmentName, characterName } = readScenePerfConsoleContext(scene);
    const stats = collectScenePerformanceStats(scene, {
      environmentName,
      characterName,
      loggedAtIso: new Date().toISOString()
    });
    devLog(formatScenePerformanceStats(stats));
    return stats;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initialize();
  });
} else {
  void initialize();
}

devLog('[Main] Module loaded, ready to initialize');
