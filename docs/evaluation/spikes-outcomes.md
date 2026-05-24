# Phase 5 spikes — outcomes

**Decision:** [evaluation-decision.md](./evaluation-decision.md) (Option 2 + 2b)  
**Date:** 2026-05-24

---

## Spike A — Volume zones on proximity

| Item | Result |
|------|--------|
| Types | `volumeZone?: 'safe' \| 'accAnchor'` on proximity trigger in `behaviors.ts` |
| Wiring | `BehaviorManager.setSimulationHandlers` → `StateSimulationManager.setVolumeZone` |
| Default | No-op when `CONFIG.SIMULATION.ENABLED` is `false` |

**Pass:** Compiles; handlers registered only from `simulation_bootstrap.ts` when enabled.

---

## Spike B — HUD simulation meters

| Item | Result |
|------|--------|
| API | `HUDManager.enableSimulationMeters` / `disableSimulationMeters` |
| Config | `CONFIG.SIMULATION.METERS` (`HudMeterDefinition[]`) |
| Update | `StateSimulationManager.getMeterValues()` → bar width 0–100% |

**Pass:** Meters render when sim enabled; hidden on dispose / playground rerun.

---

## Spike C — Simulation module (default off)

| Item | Result |
|------|--------|
| Module | `src/client/simulation/` (`StateSimulationManager`, config, types, bootstrap) |
| Flag | `CONFIG.SIMULATION.ENABLED: false` |
| Lifecycle | `initializeSimulationIfEnabled` in `SceneManager.setupCharacter`; `disposeSimulation` in `index.ts` `cleanupUI` |

**Pass:** Zero runtime cost when flag false; port uses neutral names (not CH branding).

---

## Spike D — Movement modifiers + interact key

| Item | Result |
|------|--------|
| Movement | `CharacterController` applies `getMovementModifiers().speedMultiplier` when sim enabled |
| Input | `INPUT_KEYS.INTERACT: ['f']` |
| Collect | `collectRole` on `ItemConfig` → `handleItemCollectRole` |

**Pass:** Ground speed scales with sim state when enabled.

---

## Spike E — NME on item instances

| Item | Result |
|------|--------|
| Type | `materialSnippetId?: string` on `ItemInstance` |
| Runtime | `NodeMaterialManager.applySnippetToMesh` on collectible spawn |

**Pass:** Snippet applied without `#nm` mesh rename; shares material cache with import path.

---

## Spike F — SFE stub

| Item | Result |
|------|--------|
| Manager | `SmartFilterManager` (log-only) |
| Query | `?sf=snippetId` in `index.ts` |
| Env | `Environment.smartFilter` + `loadEnvironment` hook |

**Pass:** Stub documents intent; no `@babylonjs/smart-filters` dependency in bundle.

---

## D1 — Authoring docs

- [docs/AUTHORING_SNIPPETS.md](../AUTHORING_SNIPPETS.md)
- Linked from [USERS_GUIDE.md](../../USERS_GUIDE.md) and [resources/RESOURCES.md](../../resources/RESOURCES.md)

---

## Developer surfacing (post-evaluation)

Fork-and-run stays on the default environment with simulation off. Developers can explore extension hooks via:

- **`?sim=1`** — query override + single load of **Simulation Lab** (`SIMULATION_LAB_ENVIRONMENT_NAME` in `assets.ts`)
- **`?sf=ID`** — smart-filter stub notification after environment load (`SmartFilterManager` + `Notification` / `Time.runDelayed`)
- **README** — [Optional extensions (dev)](../../README.md#optional-extensions-dev)

No new `setTimeout` / `setInterval` in the surfacing path; boot uses sync URL reads and `switchToEnvironment` promises.

---

## CI acceptance

Run locally after merge:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run export:playground
```

Record results in PR description when enabling sim on a content branch.
