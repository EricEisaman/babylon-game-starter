# Evaluation decision — Circuit Hijack & NME/SFE

**Date:** 2026-05-17  
**Inputs:** [circuit-hijack-delta.md](./circuit-hijack-delta.md) · [capability-matrix.md](./capability-matrix.md) · [nme-sfe-integration.md](./nme-sfe-integration.md)

---

## Chosen direction

### Primary: **Option 2 — Optional simulation package**

- Add `src/client/simulation/` with neutral naming (`StateSimulationManager`, `simulation_config.ts`, types).
- Wire via generic BGS hooks (volume zones, collect roles, HUD meters, movement providers).
- **`CONFIG.SIMULATION.ENABLED: false`** by default on `main`.
- **SynapticLab** remains in [circuit-hijack](https://github.com/EricEisaman/circuit-hijack); BGS links to it as the reference edu sim.

### Secondary: **Option 2b — NME/SFE documentation + thin spikes**

- **D1 shipped:** [docs/AUTHORING_SNIPPETS.md](../AUTHORING_SNIPPETS.md) + resource links.
- **D3 / D4:** Minimal code spikes (material snippet id, smart filter query stub) without full SFE dependency yet.

### Rejected

| Option | Reason |
|--------|--------|
| **Option 1 only** | Under-delivers on reusable hooks the fork already proved |
| **Option 3** | Premature abstraction before a second edu sim exists |
| **Option 4** | Couples core BGS to one lesson plan and CH branding |

---

## Phase 3 — Constraint checklist

| Constraint | Tier A / D items | Status |
|------------|------------------|--------|
| Playground export (`PLAYGROUND.md`) | Sim module, new managers | Must run `npm run export:playground` in CI; static imports only |
| SemVer (`CONTRIBUTING.md`) | New config keys, behavior fields | Default `SIMULATION.ENABLED: false`; document in FEATURE_RELEASE |
| Config-first | Neuro tuning | All constants in `simulation_config.ts` |
| Multiplayer seam | Sim state, SFE | Local-only; no `sync/` changes in this tranche |
| Minimal scope | CH names in core | Use `volumeZone`, `collectRole`, `SIMULATION` not `CIRCUIT_HIJACK` |

---

## Phase 5 — Spikes executed

| Spike | Description | Status |
|-------|-------------|--------|
| **A** | `volumeZone` on proximity + handler registration | Implemented — see [spikes-outcomes.md](./spikes-outcomes.md) |
| **B** | HUD meter bar API (generic, config-gated) | Implemented |
| **C** | Simulation module behind `ENABLED: false` | Implemented (port from CH, neutral names) |
| **D** | `INTERACT` key + handler hook | Implemented |
| **E** | `materialSnippetId` on item instances | Implemented |
| **F** | `?sf=` query + `SmartFilterManager` stub | Implemented |

**Acceptance:** `npm run typecheck`, `lint`, `format:check`, `export:playground`.

---

## Next PRs (suggested)

1. Enable `SIMULATION.ENABLED` in a branch with SynapticLab content port (fork-only assets).
2. Add `@babylonjs/smart-filters` + real SFE load after playground bundling strategy is decided.
3. Mobile **INTERACT** button beside jump/boost when sim enabled.

---

## Reference fork

- Repo: https://github.com/EricEisaman/circuit-hijack  
- Play: `npm run dev` — SynapticLab, Tech Girl, hold **F** in ACC zone.
