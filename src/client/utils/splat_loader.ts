// ============================================================================
// SPLAT LOADER UTILITIES
// ============================================================================
//
// Helpers for loading Gaussian-splat environments and their dedicated invisible
// collider GLBs (e.g. SplatWalk `*.collision.glb`). SceneManager calls these
// only on the splat path (`environment.splat` set) — never via
// setupEnvironmentPhysics. The splat is visual-only; Havok attaches to the
// collider mesh alone.
//
// Coordinate note: the splat, collider GLB, and prebaked navmesh of a splat
// environment are authored together in the workbench's untransformed
// left-handed Babylon space. They scale UNIFORMLY (all axes positive) with NO
// X-invert (unlike standard GLB environments) so all three stay co-located. The
// navmesh is scaled to match via NavigationManager coordinate conversion. Do not
// apply offsets to "fix" alignment here.

import { devLog } from './dev_log';
import { disposeImportedLights } from './engine_lights';

type ImportResult = Awaited<ReturnType<typeof BABYLON.ImportMeshAsync>>;

export interface LoadedSplat {
  /** Root node of the splat (parentless). */
  readonly root: BABYLON.AbstractMesh | null;
  /** All meshes produced by the import. */
  readonly meshes: BABYLON.AbstractMesh[];
}

export interface LoadedCollider {
  /** Root node of the collider mesh (parentless), renamed for lookup. */
  readonly root: BABYLON.AbstractMesh | null;
  /** All meshes produced by the import. */
  readonly meshes: BABYLON.AbstractMesh[];
  /** Meshes that carry geometry — physics colliders are built from these. */
  readonly geometryMeshes: BABYLON.Mesh[];
}

function findRoot(meshes: readonly BABYLON.AbstractMesh[]): BABYLON.AbstractMesh | null {
  return meshes.find((mesh) => !mesh.parent) ?? null;
}

/**
 * Loads the visible Gaussian splat. The splat is purely visual: not pickable and
 * never given a physics body. Scaling is uniform (no handedness flip) so it stays
 * aligned with the collider and navmesh.
 */
export async function loadSplat(
  scene: BABYLON.Scene,
  url: string,
  rootName = 'environment-splat',
  scale = 1
): Promise<LoadedSplat> {
  const result: ImportResult = await BABYLON.ImportMeshAsync(url, scene);
  disposeImportedLights(result);
  const meshes = result.meshes;

  for (const mesh of meshes) {
    mesh.isPickable = false;
  }

  const root = findRoot(meshes);
  if (root) {
    root.name = rootName;
    if (scale !== 1) {
      // Multiply, never overwrite: the Gaussian-splat loader bakes a sign (Y-flip) into the
      // root scaling to render the splat upright. scaleInPlace preserves that flip.
      root.scaling.scaleInPlace(scale);
    }
  }

  devLog(`[SplatLoader] Loaded splat "${url}" (${meshes.length} mesh nodes, scale ${scale})`);
  return { root, meshes };
}

/**
 * Loads the invisible collider mesh used for Havok physics and the click-to-move
 * pick target. Every node is hidden (`isVisible = false`) but kept pickable so
 * ray picks for click-to-move can hit it. Scaling is uniform and applied to the
 * root before the caller builds physics aggregates from
 * {@link LoadedCollider.geometryMeshes}, so the MESH shapes capture world-scaled
 * geometry.
 */
export async function loadInvisibleCollider(
  scene: BABYLON.Scene,
  url: string,
  rootName = 'environment-collider',
  scale = 1,
  offsetY = 0
): Promise<LoadedCollider> {
  const result: ImportResult = await BABYLON.ImportMeshAsync(url, scene);
  disposeImportedLights(result);
  const meshes = result.meshes;

  const geometryMeshes: BABYLON.Mesh[] = [];
  for (const mesh of meshes) {
    mesh.isVisible = false;
    mesh.isPickable = true;
    if (
      mesh instanceof BABYLON.Mesh &&
      mesh.geometry != null &&
      mesh.geometry.getTotalVertices() > 0
    ) {
      geometryMeshes.push(mesh);
    }
  }

  const root = findRoot(meshes);
  if (root) {
    root.name = rootName;
    if (scale !== 1) {
      // Multiply, never overwrite: preserves any handedness sign the GLB loader applied so the
      // collider stays aligned with the splat and navmesh.
      root.scaling.scaleInPlace(scale);
    }
    if (offsetY !== 0) {
      // Drops/raises the physics floor + pick target relative to the splat. Independent transform
      // component from scaling; physics is built by the caller after this returns.
      root.position.y += offsetY;
    }
  }

  devLog(
    `[SplatLoader] Loaded collider "${url}" (${meshes.length} nodes, ${geometryMeshes.length} with geometry, scale ${scale}, offsetY ${offsetY})`
  );
  return { root, meshes, geometryMeshes };
}
