# Authoring snippets (NME, particles, overlays)

How to reference Babylon.js editor snippets from **Babylon Game Starter** config and assets.

---

## Try it locally

```sh
npm install
npm run dev
```

| Goal | URL or action |
|------|----------------|
| **SynapticLab simulation** | [http://localhost:3000/?sim=1](http://localhost:3000/?sim=1) — see [SYNAPTIC_LAB.md](./SYNAPTIC_LAB.md) |
| Overlay dev test | `?overlay=Drug%20Hunger%20Vignette` (with `?sim=1` on SynapticLab) |
| Manual | Settings → **SynapticLab** with `CONFIG.SIMULATION.ENABLED: true` |

---

## Particle snippets (legacy + node)

Configured in `game_config.ts` under `CONFIG.EFFECTS.PARTICLE_SNIPPETS` and referenced by **name** on environment or item entries (`particles[].name`).

| Format | Example | Notes |
|--------|---------|--------|
| Legacy snippet id | `#T54JV7#67` | Full playground particle snippet string |
| Bare node id | `HYB2FR` | Parsed via `ParticleSystem.ParseFromSnippetAsync` |

Create or edit snippets at the [Babylon.js Playground](https://playground.babylonjs.com/) (Particles tab) or compatible editors.

---

## Node Material Editor (NME)

**Editor:** [nme.babylonjs.com](https://nme.babylonjs.com/)

| Method | Format | Example |
|--------|--------|---------|
| Mesh name tag (import) | `#nm` + uppercase id | `crate#nmHYB2FR` |
| Item instance field | `materialSnippetId` | `"HYB2FR"` on `ItemInstance` in `assets.ts` |

`NodeMaterialManager` loads snippets with `NodeMaterial.ParseFromSnippetAsync` and caches by id. Meshes without `#nm…` or `materialSnippetId` keep their glTF materials.

---

## Full-screen overlays (`OverlayManager`)

**v1 runtime:** **`kind: 'dom'` only** — CSS vignette on the canvas parent (playground-safe, no extra npm packages).

| Layer | Config |
|-------|--------|
| Catalog | `CONFIG.EFFECTS.OVERLAY_SNIPPETS` in `game_config.ts` (`name`, `kind`, `editor`, `snippetId`) |
| Per environment | `overlays: [{ catalogName, driver?, enabled? }]` on `Environment` in `assets.ts` |

**Env switch:** `OverlayManager.clearAllOverlays()` runs at the start of every `loadEnvironment` — overlays never persist across worlds.

**SynapticLab (`?sim=1`):** `Drug Hunger Vignette` (`kind: 'dom'`) with a simulation driver (`drugHunger > 0.7` and low ACC). See [SYNAPTIC_LAB.md](./SYNAPTIC_LAB.md).

| Dev query | Effect |
|-----------|--------|
| `?overlay=Catalog Name` | Forces a catalog overlay on the current env (in addition to env bindings) |

**Reserved (not implemented):**

| `kind` | Notes |
|--------|--------|
| `smartFilter` | SFE graphs — deferred; vignette-style effects are better as camera **post-process** |
| `nodePostProcess` | NME fullscreen pass — future spike |

---

## Smart Filter Editor (SFE)

**Editor:** [sfe.babylonjs.com](https://sfe.babylonjs.com/)

SFE is useful for composable filter graphs in dedicated tools; this starter does **not** load SFE snippets at runtime. For screen-edge vignettes on the main camera, plan on a **PostProcess** overlay adapter instead of `kind: 'smartFilter'`.

---

## Optional state simulation

When `CONFIG.SIMULATION.ENABLED` is `true` **or** the URL has `?sim=1` (off by default):

- **Collect roles:** `collectRole` on `ItemConfig` (`drug`, `cravingCue`, `safeZone`, `accAnchor`, `pfcExercise`)
- **Volume zones:** `volumeZone` on proximity behaviors (`safe`, `accAnchor`)
- **Behaviors:** `simulationPulse`, `adjustSimulation`, `setCoupling` actions
- **Interact key:** `INPUT_KEYS.INTERACT` (`f`)

Full walkthrough: [SYNAPTIC_LAB.md](./SYNAPTIC_LAB.md). Reference implementation: [circuit-hijack](https://github.com/EricEisaman/circuit-hijack). Evaluation notes: [evaluation/](./evaluation/).

---

## Related docs

- [SYNAPTIC_LAB.md](./SYNAPTIC_LAB.md) — `?sim=1` and SynapticLab gameplay
- [USERS_GUIDE.md](../USERS_GUIDE.md) — managers and `assets.ts`
- [PLAYGROUND.md](../PLAYGROUND.md) — export and static import rules
- [evaluation/evaluation-decision.md](./evaluation/evaluation-decision.md) — port decision
