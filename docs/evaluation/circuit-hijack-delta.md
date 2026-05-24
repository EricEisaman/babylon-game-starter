# Circuit Hijack — Delta inventory (vs BGS `main`)

**Compared:** `origin/main` @ `0f47b27` (Babylon Game Starter) vs [circuit-hijack](https://github.com/EricEisaman/circuit-hijack) `main` @ `bfd7160` (2026-05-17).

**Method:** File-by-file diff under `src/client/`; subsystem tags for evaluation routing.

## Summary

| Category | Count |
|----------|------:|
| **New in Circuit Hijack** | 4 |
| **Modified (gameplay-relevant)** | 14 |
| **CH-only branding / assets** | 4 (images, banner) |
| **Net client delta (approx.)** | +1,100 lines in CH vs BGS |

Circuit Hijack is a **vertical slice on BGS**, not a new engine. Deployment docs and CI mirror the starter; gameplay delta is concentrated in neurochemistry simulation, HUD meters, behaviors, and one environment (`SynapticLab`).

---

## New files (Circuit Hijack only)

| File | Subsystem | Lines (approx.) | Risk / notes |
|------|-----------|----------------:|--------------|
| `config/neurochemistry_config.ts` | sim | 58 | All tuning; safe to port as sample config |
| `managers/neurochemistry_manager.ts` | sim | 409 | Core loop; playground export must use global `BABYLON` only |
| `types/neurochemistry.ts` | sim / types | 94 | Public types if merged into BGS SemVer surface |
| `utils/visible_environments.ts` | settings / boot | 24 | Product UX; replace with generic `DEMO_MODE` in BGS |

---

## Modified files

| File | Tag | Subsystem | Δ (diff lines) | Summary |
|------|-----|-----------|---------------:|---------|
| `config/assets.ts` | modified | assets / content | ~199 | Adds **SynapticLab** env: cue particles, drug items, `neuroZone` volumes, `neuroRole` collectibles |
| `config/game_config.ts` | modified | config / HUD / boot | ~61 | `CIRCUIT_HIJACK` block; HUD neuro meter flags + colors; default character **Tech Girl** |
| `config/input_keys.ts` | modified | input | ~3 | `LABEL_URGE: ['f']` |
| `controllers/character_controller.ts` | modified | character | ~21 | Applies `NeurochemistryManager.getMovementModifiers()` |
| `index.ts` | modified | boot | ~4 | `NeurochemistryManager.dispose()` in `cleanupUI()` |
| `managers/behavior_manager.ts` | modified | behaviors | ~41 | `setNeuroHandlers`; `neuroPulse` / `adjustNeuro` / `setInsulaAccCoupling`; `neuroZone` enter/exit |
| `managers/character_loader.ts` | modified | character | ~10 | Minor (default / wiring) |
| `managers/collectibles_manager.ts` | modified | collectibles | ~7 | `item.neuroRole` → `handleItemNeuroRole` on collect |
| `managers/hud_manager.ts` | modified | HUD | ~159 | Bar meters (D1, D2, RPE, hunger, coupling, habit); CSS hunger vignette |
| `managers/scene_manager.ts` | modified | scene | ~14 | Init/dispose neuro; register neuro behavior handlers |
| `types/behaviors.ts` | modified | types / behaviors | ~30 | New action types + `neuroZone` on proximity |
| `types/config.ts` | modified | types | ~10 | `CIRCUIT_HIJACK` on `GameConfig` |
| `types/environment.ts` | modified | types | ~5 | `ItemConfig.neuroRole` |
| `types/ui.ts` | modified | types / HUD | ~27 | `SHOW_NEURO_*`, meter colors on `HUDConfig` |
| `ui/settings_ui.ts` | modified | UI | ~6 | Environment list filtered via `visible_environments` |

---

## Unchanged in delta (same pattern as BGS)

These subsystems are **shared** without CH-specific forks in `src/client/`:

- `multiplayer_bootstrap.ts`, `sync/*`, `multiplayer_manager.ts`
- `visual_effects_manager.ts`, `node_material_manager.ts` (particle/NME snippets unchanged in API)
- `mobile_input_manager.ts`, `overlay_button_utils.ts` (BGS may be ahead on mobile fixes)
- `inventory_manager.ts`, `audio_manager.ts`, `cut_scene_manager.ts`

---

## CH-only branding (not gameplay)

| Path | Note |
|------|------|
| `public/branding/images/Circuit-Hijack-Banner.png` | Marketing |
| `public/branding/images/Circuit_Hijack_Banner.png` | Marketing |
| `public/branding/images/circuit_hijack_logo.png` | Marketing |
| `public/branding/config.json` | Title / logo paths |

Keep in [circuit-hijack](https://github.com/EricEisaman/circuit-hijack) repo; do not merge into generic BGS core.

---

## Hook map (quick reference)

```text
index.ts                 → NeurochemistryManager.dispose()
scene_manager.ts         → initialize + BehaviorManager.setNeuroHandlers
behavior_manager.ts      → neuro actions + neuroZone proximity
collectibles_manager.ts  → item.neuroRole on collect
character_controller.ts  → getMovementModifiers()
hud_manager.ts           → meters + vignette from getSnapshot()
game_config.ts           → HUD flags + CIRCUIT_HIJACK block
assets.ts                → SynapticLab content
input_keys.ts            → LABEL_URGE
utils/visible_environments.ts → settings env filter
```

---

## Evaluation follow-ups

See also:

- [capability-matrix.md](./capability-matrix.md) — scored port recommendations
- [evaluation-decision.md](./evaluation-decision.md) — chosen BGS direction
- [nme-sfe-integration.md](./nme-sfe-integration.md) — Babylon editor snippet opportunities
- [spikes-outcomes.md](./spikes-outcomes.md) — Phase 5 validation results
