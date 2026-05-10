/**
 * Main TypeScript Entry Point
 * Initializes the Babylon Game Starter application
 */

import '@babylonjs/core/Legacy/legacy';
import '@babylonjs/loaders/legacy/legacy';
import '@babylonjs/materials/legacy/legacy';
import {
  CreateSoundAsync,
  CreateStreamingSoundAsync
} from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
import * as PhysicsV2 from '@babylonjs/core/Physics/v2/index';

import { CONFIG } from './config/game_config';
import { devLog } from './utils/dev_log';
import { readScenePerfConsoleContext } from './utils/scene_perf_console_stamp';
import {
  collectScenePerformanceStats,
  formatScenePerformanceStats
} from './utils/scene_performance_stats';

import { Playground } from './index';

// Global variables
let engine: BABYLON.Engine | null = null;
let scene: BABYLON.Scene | null = null;

async function loadInspectorIfDev(): Promise<void> {
  if (import.meta.env.DEV) {
    await import('@babylonjs/inspector');
  }
}

async function createEngine(canvas: HTMLCanvasElement): Promise<BABYLON.Engine> {
  const engineOpts = {
    antialias: true,
    powerPreference: 'high-performance' as const
  };

  if (CONFIG.PERFORMANCE.WEBGPU_WHEN_AVAILABLE) {
    if (navigator.gpu) {
      try {
        const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine');
        const webgpu = new WebGPUEngine(canvas, {
          ...engineOpts,
          powerPreference: 'high-performance'
        });
        await webgpu.initAsync();
        devLog('[Main] WebGPU engine active');
        return webgpu as unknown as BABYLON.Engine;
      } catch (err) {
        devLog('[Main] WebGPU unavailable, using WebGL', err);
      }
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

/**
 * Initializes the application
 */
async function initialize(): Promise<void> {
  try {
    devLog('[Main] Initializing Babylon Game Starter...');
    await loadInspectorIfDev();

    // Get canvas element
    const canvasElement = document.getElementById('renderCanvas');
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element not found');
    }
    const canvas = canvasElement;

    devLog('[Main] Canvas found');

    // Create engine (WebGPU when available, else WebGL)
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
