# Navigation & NPC Milestones

This document tracks the roadmap for navmesh-driven navigation, starting with the
hybrid click-to-move player and building toward an NPC system that reuses the same
navmesh and crowd.

## M1 — Splat environments + hybrid click-to-move player (done)

Optional Gaussian-splat environments with click-to-move navigation powered by a
prebaked Recast navmesh, integrated into the existing physics-based player
controller without changing any WASD / jump / boost behavior.

- **Assets** (`EricEisaman/assets/environment/splats/`):
  - `*.ply` — visible Gaussian splat (not pickable, no physics).
  - `*.glb` — invisible collider mesh: source of Havok physics colliders and the
    click-to-move pick target.
  - `*.nav` — prebaked Recast navmesh (a `recast-navigation` `exportNavMesh`
    binary) consumed at runtime via `importNavMesh`.
- **Environment config** (`src/client/types/environment.ts`,
  `src/client/config/assets.ts`): new optional `splat` / `colliderMesh` /
  `navmesh` / `clickToMove` fields. "Tropical Compound" is the first showcase.
- **Loading** (`src/client/utils/splat_loader.ts`,
  `src/client/managers/scene_manager.ts`): splat envs load the splat, collider,
  and navmesh in the same untransformed left-handed space — the standard GLB
  X-invert / scale and lightmap paths are skipped so all three stay aligned.
- **Navigation** (`src/client/managers/navigation_manager.ts`): single owner of
  the Recast stack — `init` → `importNavMesh` → `NavMeshQuery` (player paths) +
  an NPC-ready `Crowd` (created now, empty until M2).
- **Hybrid controller** (`src/client/controllers/nav_path_follower.ts`,
  `click_to_move_controller.ts`, `character_controller.ts`): a `POINTERTAP` on the
  collider snaps to the navmesh, computes a path, and feeds per-frame waypoint
  directions to `CharacterController.setNavigationMove`. The capsule is driven
  through the existing Havok velocity/rotation/animation pipeline (navmesh only
  supplies a path). Manual input always cancels navigation. Camera drag/zoom
  (`POINTERDOWN/MOVE/UP`) is unaffected because picks use taps only.
- **Settings**: a runtime "Click to Move" toggle (`src/client/config/game_config.ts`,
  `src/client/ui/settings_ui.ts`) enables/disables the feature per session; it is a
  no-op outside splat environments.

## M2 — NPC system (planned)

Spawn AI agents that navigate the same loaded navmesh using the `Crowd` already
created by `NavigationManager` (mirrors the SplatWalk workbench's `Viewer.addNPC`
/ `chooseNpcSpawnPoint`).

- **NPCManager**: spawn `CrowdAgent`s via `NavigationManager.addAgent`, sync each
  agent mesh from `agent.position()` each frame (the crowd update loop is already
  registered and stays idle until agents exist).
- **Spawning**: choose NPC spawn points as navmesh triangle centroids farthest
  from the player; request move targets via `agent.requestMoveTarget`.
- **Behavior**: start with simple wander/seek targets, then layer richer behaviors
  through the existing `BehaviorManager`.
- **Multiplayer**: later sync NPC/agent targets across clients alongside the
  existing `CharacterController` position sync.

Nothing in M1 spawns agents; the crowd is built NPC-ready on navmesh load so M2 is
additive and reuses the single Recast instance (no duplication).

## M3 — SplatWalk-generated collider mesh (planned)

Consume the collider/floor mesh that SplatWalk's pipeline will export alongside the
splat and navmesh (auto-generated room/floor geometry, e.g. via its
`build_room_floor_mesh` WASM path) instead of a separately hand-authored `.glb`.

- **Asset source**: SplatWalk emits the collider mesh next to the `*.ply` / `*.nav`,
  so it is authored in the same coordinate space and stays aligned by construction.
- **Reuse**: load it through the existing `colliderMesh` path in
  `src/client/utils/splat_loader.ts` / `SceneManager.loadSplatEnvironment`, reusing
  the `scale` and `floorMeshOffsetY` knobs. When the asset is ready the change is
  config-only (swap the `colliderMesh.url`).
- **Scope**: only the source of the collider geometry changes. The prebaked-navmesh
  consumption (M1) and the NPC crowd (M2) are unaffected.
