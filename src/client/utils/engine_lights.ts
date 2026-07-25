/**
 * Dual-engine (WebGL / WebGPU) light hygiene helpers.
 *
 * Orphan glTF lights and stale material light pipelines cause WebGPU UBO size
 * mismatches (e.g. DirectionalLight 80 vs PointLight 96). Same cleanup keeps
 * WebGL light sets correct after environment switches.
 */

const WEBGPU_ENGINE_CLASS_NAME = 'WebGPUEngine';

/**
 * True when the active Babylon engine is WebGPU.
 * Prefers getClassName(); falls back to constructor.name for dual-stack hosts.
 */
export function isWebGpuEngine(engine: { getClassName?: () => string; constructor: { name: string } }): boolean {
  if (typeof engine.getClassName === 'function') {
    return engine.getClassName() === WEBGPU_ENGINE_CLASS_NAME;
  }
  return engine.constructor.name === WEBGPU_ENGINE_CLASS_NAME;
}

/**
 * Disposes lights that arrived with an ImportMeshAsync result so lighting stays
 * config-owned (defaultLight + environment lights).
 */
export function disposeImportedLights(result: { lights?: BABYLON.Light[] }): void {
  const lights = result.lights;
  if (!lights || lights.length === 0) {
    return;
  }
  for (const light of lights) {
    light.dispose();
  }
}

/**
 * Forces surviving materials to rebuild light-related effects after the scene
 * light set changes (required for WebGPU bind-group size validation).
 */
export function markSceneMaterialsLightDirty(scene: BABYLON.Scene): void {
  scene.markAllMaterialsAsDirty(BABYLON.Constants.MATERIAL_LightDirtyFlag);
}
