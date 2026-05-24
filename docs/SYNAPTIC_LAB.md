# SynapticLab and `?sim=1`

Optional **state simulation** demo environment ported from [circuit-hijack](https://github.com/EricEisaman/circuit-hijack). The default game fork is unchanged unless you enable simulation via URL or config.

---

## Quick start

```sh
npm install
npm run dev
```

Open **[http://localhost:3000/?sim=1](http://localhost:3000/?sim=1)**.

**Live demo (SynapticLab):** [https://ericeisaman.github.io/babylon-game-starter/?sim=1](https://ericeisaman.github.io/babylon-game-starter/?sim=1)

You start in **SynapticLab** with HUD meters (D1, D2, RPE, hunger, coupling, habit) and the optional drug-hunger vignette overlay.

---

## What `?sim=1` does

Handled in [`src/client/index.ts`](../src/client/index.ts) at boot:

1. **`setSimulationQueryOverride(true)`** — same effect as `CONFIG.SIMULATION.ENABLED: true` for `isSimulationActive()`, but only when the query flag is present.
2. **Initial environment** — loads **SynapticLab** (`SIMULATION_LAB_ENVIRONMENT_NAME` in [`assets.ts`](../src/client/config/assets.ts)) instead of the default `isDefault` environment.
3. **Simulation systems** — after scene init, [`simulation_bootstrap.ts`](../src/client/simulation/simulation_bootstrap.ts) wires:
   - `StateSimulationManager` (meters, decay, outcomes)
   - `BehaviorManager` handlers for `adjustSimulation`, `simulationPulse`, `setCoupling`, volume zones
   - `HUDManager.enableSimulationMeters`
4. **Overlays** — SynapticLab’s `overlays[]` binding applies the **Drug Hunger Vignette** (DOM/CSS via [`OverlayManager`](../src/client/managers/overlay_manager.ts)).

Without `?sim=1` and with `CONFIG.SIMULATION.ENABLED: false`, none of the above runs at startup and you get the normal default world.

---

## Gameplay loop (SynapticLab)

| Area | What to try |
|------|-------------|
| **Withdrawal zone** | Red-edge particle near spawn `(0, 1, -4)` — proximity raises `drugHunger` |
| **Orange cue particles** | Craving pulses when you get close |
| **Blue ACC zone** | Hold **F** (`INPUT_KEYS.INTERACT`) while in the zone to build ACC awareness / coupling |
| **Green safe zone** | Nebula volume — D2 recovery over time |
| **Collectibles** | Dopamine Proxy (`collectRole: drug`), PFC Exercise crate (`pfcExercise`) |

On-screen tips appear once when simulation starts.

---

## Drug hunger vignette (DOM overlay)

- **Catalog:** `Drug Hunger Vignette` in `CONFIG.EFFECTS.OVERLAY_SNIPPETS` (`kind: 'dom'`).
- **Driver:** `drugHunger > 0.7` **and** `accAwareness` below `REGULATION.lowAccThreshold` (0.35) — see [`simulation_config.ts`](../src/client/simulation/simulation_config.ts).
- **Rendering:** Full-screen CSS radial gradient on the canvas parent; strength lerps on the render loop (no `setTimeout`).
- **Teardown:** `OverlayManager.clearAllOverlays()` runs at the **start of every** environment switch — the vignette never carries into Level Test, Mushroom Village, etc.

GPU camera post-process or SFE graphs are **not** used for this effect in v1; see [AUTHORING_SNIPPETS.md](./AUTHORING_SNIPPETS.md).

---

## Leaving the lab

- **Settings → Environment** — pick any other map; overlay and lab-specific bindings are cleared on load.
- **Portals** — same `switchToEnvironment` path; overlay clears before the new GLB loads.

Simulation query override (`?sim=1`) stays active for the session until reload without the flag. Meters remain available if you return to SynapticLab while the flag is still set.

---

## Alternatives to `?sim=1`

| Method | Behavior |
|--------|----------|
| **`CONFIG.SIMULATION.ENABLED: true`** in [`game_config.ts`](../src/client/config/game_config.ts) | Simulation always active; **default env unchanged** unless you also change startup in `index.ts` |
| **Settings → SynapticLab** | Loads the lab without `?sim=1` only if simulation is already enabled via config |
| **`?overlay=Drug%20Hunger%20Vignette`** | Dev: force a catalog overlay on the current env (use with `?sim=1` for the driver to matter) |

---

## Babylon Playground

1. Export or use the repo’s `playground.json` (`npm run export:playground`).
2. Enable the **Havok WASM** plugin in the playground UI.
3. Append **`?sim=1`** to the playground URL when testing the multifile snippet.

With a current export you should see two glowing **Dopamine Proxy** crystals (near `(3, 1.2, -2)` and `(-2, 1.2, 6)`) and the **PFC Exercise** crate at `(7, 1, 0)`. Collectibles spawn even if collection audio is blocked by autoplay or CORS.

See [PLAYGROUND.md](../PLAYGROUND.md) and [MULTIPLAYER.md](../MULTIPLAYER.md) for the full classroom flow.

---

## Related docs

- [AUTHORING_SNIPPETS.md](./AUTHORING_SNIPPETS.md) — particles, NME, overlay catalog
- [USERS_GUIDE.md](../USERS_GUIDE.md) — managers and config layout
- [evaluation/README.md](./evaluation/README.md) — circuit-hijack port notes (optional reading)
