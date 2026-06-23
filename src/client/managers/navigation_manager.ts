// ============================================================================
// NAVIGATION MANAGER
// ============================================================================
//
// Single owner of the Recast navigation stack (recast-navigation npm package).
// Loads a prebaked .nav binary (exported by the SplatWalk workbench's
// `exportNavMesh`) via `importNavMesh`, builds a NavMeshQuery for player
// click-to-move pathfinding, and creates an NPC-ready Crowd on the same navmesh.
//
// Player click-to-move uses NavMeshQuery (snap + path) and drives the existing
// physics capsule, so the navmesh only supplies waypoints — physics stays
// authoritative. The Crowd is created now but stays empty until the NPC
// milestone (M2) spawns agents on it.
//
// Follows the static-manager pattern used by BehaviorManager / CollectiblesManager.

import { init, importNavMesh, NavMeshQuery, Crowd } from 'recast-navigation';

import { devLog } from '../utils/dev_log';

import type { NavMesh, CrowdAgent, CrowdAgentParams } from 'recast-navigation';

/** Recast's plain Vector3 shape ({x,y,z}); interchangeable with BABYLON.Vector3 fields. */
interface RecastVec3 {
  x: number;
  y: number;
  z: number;
}

const CROWD_MAX_AGENTS = 16;
const CROWD_MAX_AGENT_RADIUS = 1.0;

export class NavigationManager {
  private static scene: BABYLON.Scene | null = null;
  private static navMesh: NavMesh | null = null;
  private static navMeshQuery: NavMeshQuery | null = null;
  private static crowd: Crowd | null = null;
  private static agentCount = 0;
  private static recastReady = false;
  /**
   * Uniform scale applied to the splat/collider in world space. The prebaked navmesh stays in
   * scale-1 "nav space", so world<->nav conversions divide/multiply by this factor.
   */
  private static worldScale = 1;
  /** World-space Y offset added to navmesh points so the navmesh can sit on the visible floor. */
  private static navOffsetY = 0;
  private static beforeRenderObserver: BABYLON.Nullable<
    BABYLON.Observer<BABYLON.Scene>
  > = null;

  public static initialize(scene: BABYLON.Scene): void {
    this.scene = scene;
  }

  /** Lazily loads the Recast WASM module once per page. */
  private static async ensureRecast(): Promise<void> {
    if (this.recastReady) {
      return;
    }
    await init();
    this.recastReady = true;
  }

  /**
   * Deserializes a prebaked navmesh and builds the query + crowd. Returns true on
   * success. On failure the manager stays unloaded and click-to-move is disabled
   * for the environment (caller should fall back to manual controls).
   */
  public static async loadNavMesh(
    bytes: Uint8Array,
    worldScale = 1,
    navOffsetY = 0
  ): Promise<boolean> {
    this.disposeNavResources();
    this.worldScale = worldScale;
    this.navOffsetY = navOffsetY;
    try {
      await this.ensureRecast();
      const { navMesh } = importNavMesh(bytes);
      this.navMesh = navMesh;
      this.navMeshQuery = new NavMeshQuery(navMesh);
      this.crowd = new Crowd(navMesh, {
        maxAgents: CROWD_MAX_AGENTS,
        maxAgentRadius: CROWD_MAX_AGENT_RADIUS
      });
      this.agentCount = 0;
      this.registerCrowdUpdate();
      devLog('[NavigationManager] Navmesh loaded and crowd initialized');
      return true;
    } catch (error) {
      console.error('[NavigationManager] Failed to load navmesh:', error);
      this.disposeNavResources();
      return false;
    }
  }

  public static isReady(): boolean {
    return this.navMeshQuery !== null;
  }

  /** World space -> nav space (undo uniform scale and Y offset). */
  private static worldToNav(p: RecastVec3): RecastVec3 {
    return {
      x: p.x / this.worldScale,
      y: (p.y - this.navOffsetY) / this.worldScale,
      z: p.z / this.worldScale
    };
  }

  /** Nav space -> world space (apply uniform scale and Y offset). */
  private static navToWorld(p: RecastVec3): BABYLON.Vector3 {
    return new BABYLON.Vector3(
      p.x * this.worldScale,
      p.y * this.worldScale + this.navOffsetY,
      p.z * this.worldScale
    );
  }

  /**
   * Snaps a world position to the nearest point on the navmesh. Used to validate
   * click targets and to floor-snap the player spawn. Input and output are world space.
   */
  public static findClosestPoint(position: RecastVec3): BABYLON.Vector3 | null {
    if (!this.navMeshQuery) {
      return null;
    }
    const result = this.navMeshQuery.findClosestPoint(this.worldToNav(position));
    if (!result.success) {
      return null;
    }
    return this.navToWorld(result.point);
  }

  /**
   * Computes a straight (string-pulled) path between two world points. Returns the
   * waypoint list in world space, or null when no path exists.
   */
  public static computePath(start: RecastVec3, end: RecastVec3): BABYLON.Vector3[] | null {
    if (!this.navMeshQuery) {
      return null;
    }
    const result = this.navMeshQuery.computePath(this.worldToNav(start), this.worldToNav(end));
    if (!result.success || result.path.length === 0) {
      return null;
    }
    return result.path.map((p) => this.navToWorld(p));
  }

  // --- Crowd accessors (reserved for the NPC milestone) -------------------

  public static getCrowd(): Crowd | null {
    return this.crowd;
  }

  /** Adds an NPC agent to the crowd at the given navmesh-snapped position. */
  public static addAgent(
    position: RecastVec3,
    params: Partial<CrowdAgentParams>
  ): CrowdAgent | null {
    if (!this.crowd) {
      return null;
    }
    const agent = this.crowd.addAgent(
      { x: position.x, y: position.y, z: position.z },
      params
    );
    this.agentCount += 1;
    return agent;
  }

  /**
   * Advances the crowd simulation each frame. Registered once on navmesh load but
   * the per-frame `crowd.update` is skipped while no agents exist (player
   * click-to-move does not use the crowd), so there is zero cost until M2.
   */
  private static registerCrowdUpdate(): void {
    if (!this.scene || this.beforeRenderObserver) {
      return;
    }
    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.crowd || this.agentCount === 0) {
        return;
      }
      const dt = (this.scene?.getEngine().getDeltaTime() ?? 16) / 1000;
      this.crowd.update(dt);
    });
  }

  private static disposeNavResources(): void {
    try {
      this.crowd?.destroy();
    } catch {
      /* crowd may already be destroyed */
    }
    try {
      this.navMeshQuery?.destroy();
    } catch {
      /* query may already be destroyed */
    }
    try {
      this.navMesh?.destroy();
    } catch {
      /* navmesh may already be destroyed */
    }
    this.crowd = null;
    this.navMeshQuery = null;
    this.navMesh = null;
    this.agentCount = 0;
  }

  public static dispose(): void {
    if (this.beforeRenderObserver && this.scene) {
      this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    }
    this.beforeRenderObserver = null;
    this.disposeNavResources();
    this.scene = null;
  }
}
