// ============================================================================
// NAV PATH FOLLOWER
// ============================================================================
//
// Holds an active list of navmesh waypoints and, each frame, reports the
// horizontal world-space direction the character should travel to reach the
// current waypoint. Advances to the next waypoint once within a stop radius.
//
// This is intentionally physics-agnostic: it only produces a direction. The
// CharacterController turns that into facing + forward input so the existing
// Havok-driven movement pipeline does the actual moving.

const DEFAULT_WAYPOINT_RADIUS = 0.6;
const DEFAULT_ARRIVAL_RADIUS = 0.4;

export class NavPathFollower {
  private waypoints: BABYLON.Vector3[] = [];
  private index = 0;
  private readonly waypointRadius: number;
  private readonly arrivalRadius: number;
  private readonly scratch = new BABYLON.Vector3();

  constructor(waypointRadius = DEFAULT_WAYPOINT_RADIUS, arrivalRadius = DEFAULT_ARRIVAL_RADIUS) {
    this.waypointRadius = waypointRadius;
    this.arrivalRadius = arrivalRadius;
  }

  public setPath(waypoints: readonly BABYLON.Vector3[]): void {
    this.waypoints = waypoints.map((p) => p.clone());
    this.index = 0;
  }

  public clear(): void {
    this.waypoints = [];
    this.index = 0;
  }

  public isActive(): boolean {
    return this.index < this.waypoints.length;
  }

  /**
   * Returns the normalized horizontal (XZ) direction from `position` to the
   * current waypoint, advancing past waypoints already reached. Returns null when
   * the path is complete (final waypoint reached) so the caller can stop.
   */
  public currentDirection(position: BABYLON.Vector3): BABYLON.Vector3 | null {
    while (this.index < this.waypoints.length) {
      const target = this.waypoints[this.index];
      if (!target) {
        break;
      }
      this.scratch.copyFrom(target);
      this.scratch.subtractInPlace(position);
      this.scratch.y = 0;
      const distance = this.scratch.length();

      const isFinal = this.index === this.waypoints.length - 1;
      const reachRadius = isFinal ? this.arrivalRadius : this.waypointRadius;

      if (distance <= reachRadius) {
        this.index += 1;
        if (isFinal) {
          this.clear();
          return null;
        }
        continue;
      }

      return this.scratch.normalize();
    }
    return null;
  }
}
