# NME & SFE integration — audit and recommendations

**Editors:** [Node Material Editor (NME)](https://nme.babylonjs.com/) · [Smart Filter Editor (SFE)](https://sfe.babylonjs.com/)

**BGS baseline:** `main` @ mobile UI + particle/NME hooks as documented in [USERS_GUIDE.md](../../USERS_GUIDE.md).

---

## Current BGS support (audit)

| Tool | Runtime API | Config / convention | Manager |
|------|-------------|---------------------|---------|
| Legacy particles | `BABYLON.ParticleHelper.ParseFromSnippetAsync(id, scene)` | `CONFIG.EFFECTS.PARTICLE_SNIPPETS` (`type: 'legacy'`) | `VisualEffectsManager` |
| Node particles | `BABYLON.NodeParticleSystemSet.ParseFromSnippetAsync(id)` | Same catalog (`type: 'nodes'`, e.g. `#T54JV7#67`) | `VisualEffectsManager` |
| Node materials | `BABYLON.NodeMaterial.ParseFromSnippetAsync(id, scene)` | GLB mesh name `#nm{ID}` | `NodeMaterialManager` |
| Smart Filters | **Not integrated** | **None** | **None** |

**Environment usage:**

```typescript
// assets.ts — particle name must exist in PARTICLE_SNIPPETS
particles: [{ name: 'Magic Sparkles', position: new BABYLON.Vector3(...) }]
```

**Circuit Hijack:** Heavy use of **particles** + `behavior.neuroZone` in SynapticLab; **no SFE** code paths.

---

## Gaps vs Babylon snippet ecosystem

1. **SFE not wired** — Post-process filters from [SFE](https://sfe.babylonjs.com/) require `@babylonjs/smart-filters` or serialized JSON + runtime ([how to use smart filters](https://doc.babylonjs.com/features/featuresDeepDive/smartFilters/howToUseSmartFilters)), not the same `ParseFromSnippetAsync` flow as NME materials.
2. **NME tied to DCC mesh naming** — Teachers using stock GLBs never see NME unless they embed `#nm{id}` in mesh names.
3. **Catalog is code-only** — `PARTICLE_SNIPPETS` in `game_config.ts` is not discoverable from Settings UI.
4. **Playground export** — New managers must stay on static imports + global `BABYLON` ([PLAYGROUND.md](../../PLAYGROUND.md)).
5. **Multiplayer** — Post-process is **per-client**; do not sync via `multiplayer_bootstrap` unless designing shared world mood.

---

## Scored opportunities (D1–D6)

See [capability-matrix.md](./capability-matrix.md) for scores. Summary:

| Tier | Action | Phase 5 spike |
|------|--------|---------------|
| **D1** | `docs/AUTHORING_SNIPPETS.md` + links in USERS_GUIDE / RESOURCES | Docs (shipped) |
| **D2** | More entries in `PARTICLE_SNIPPETS` | Optional follow-up |
| **D3** | `materialSnippetId` on item instances | **Spike E** |
| **D4** | `SmartFilterManager` + `Environment.smartFilter` | **Spike F** (stub + `?sf=`) |
| **D5** | Sim drives filter uniforms (hunger vignette) | After sim + D4 |
| **D6** | Settings snippet browser | Future |

---

## Recommended config shapes (future)

```typescript
// types/environment.ts (proposed)
interface SmartFilterConfig {
  readonly snippetId?: string; // SFE / hosted JSON id — TBD per API spike
  readonly enabled?: boolean;
}

interface Environment {
  // ...
  readonly smartFilter?: SmartFilterConfig;
}

// ItemInstance (Spike E)
interface ItemInstance {
  readonly materialSnippetId?: string; // NME id without #nm in GLB
}
```

---

## SFE load path — spike notes (Spike F)

**Findings:**

- SFE saves **serializable smart filter graphs**; runtime uses `@babylonjs/smart-filters` (`SmartFilter`, `createRuntimeAsync`) with `ThinEngine` or Babylon engine integration.
- **Not** exposed as `BABYLON.SmartFilter.ParseFromSnippetAsync` in the same way as `NodeMaterial.ParseFromSnippetAsync`.
- **Playground implication:** Adding `@babylonjs/smart-filters` as a dependency may **break** or bloat `playground.json` unless the export script bundles it or the manager no-ops in playground.

**BGS approach (Spike F):**

- `SmartFilterManager` stub: reads `?sf=snippetId` via `queryHook`, logs intent, stores id for future wiring.
- Per-environment `smartFilter` field **documented only** until load path is validated in CI + playground smoke check.
- Offline: filter load fails gracefully (no crash); document in AUTHORING_SNIPPETS.

---

## Circuit Hijack × NME/SFE

| CH feature | Today | Opportunity |
|------------|-------|-------------|
| Cue particles | `particles` + `neuroPulse` | More NME node-particle snippets |
| Safe / ACC zones | `neuroZone` proximity | SFE color grade per zone |
| Hunger feedback | CSS vignette in HUD | SFE uniform driven by `drugHunger` |
| Drug crystals | `neuroRole: 'drug'` | `materialSnippetId` on items |

---

## Cross-references

- [circuit-hijack-delta.md](./circuit-hijack-delta.md)
- [evaluation-decision.md](./evaluation-decision.md)
- [spikes-outcomes.md](./spikes-outcomes.md)
- [AUTHORING_SNIPPETS.md](../AUTHORING_SNIPPETS.md)
