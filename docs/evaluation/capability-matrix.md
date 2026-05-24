# Capability matrix — Circuit Hijack → BGS

**Scoring:** 0 = do not port · 1 = sample/docs only · 2 = optional module / behind flag · 3 = core framework

Dimensions: **Reusability** · **Config-first fit** · **Maintenance / SemVer** · **Playground export safety**

---

## Tier A — Framework patterns (from Circuit Hijack)

| # | Capability | R | C | M | P | **Total** | Recommendation |
|---|------------|---|---|---|---|-----------|----------------|
| 1 | Optional simulation module (`SIMULATION.ENABLED`, init/dispose in scene) | 3 | 3 | 2 | 2 | **10** | Port behind flag; default off |
| 2 | Behavior action extensibility (registry / injectable handlers) | 3 | 2 | 2 | 3 | **10** | Generic `BehaviorActionHandler` map |
| 3 | Proximity volume zones (enter/exit state) | 3 | 3 | 3 | 3 | **12** | Add `volumeZone?: string` (neutral name) |
| 4 | Item collect role hook (`collectRole` + handler map) | 3 | 3 | 2 | 3 | **11** | Neutral `collectRole`; sample maps to sim |
| 5 | HUD meter bars + screen overlay | 3 | 3 | 2 | 3 | **11** | Generic `HUD_METERS` config |
| 6 | Movement modifier providers | 3 | 2 | 3 | 3 | **11** | `CharacterModifierProvider[]` |
| 7 | Hold-to-interact input (`INTERACT` + mobile) | 3 | 3 | 3 | 3 | **12** | `INPUT_KEYS.INTERACT`; mobile button |

---

## Tier B — Sample / demo pack

| # | Capability | R | C | M | P | **Total** | Recommendation |
|---|------------|---|---|---|---|-----------|----------------|
| 8 | SynapticLab environment content | 1 | 3 | 3 | 3 | **10** | Stay in circuit-hijack or `examples/` |
| 9 | Neurochemistry tuning tables | 1 | 3 | 3 | 3 | **10** | With sample module only |
| 10 | Win/lose + educational notifications | 2 | 2 | 3 | 3 | **10** | Use existing `Notification` util |
| 11 | `VISIBLE_ENVIRONMENTS` / demo mode | 2 | 3 | 3 | 3 | **11** | `CONFIG.DEMO_MODE` optional block |

---

## Tier C — Fork-only

| # | Capability | Score | Note |
|---|------------|------:|------|
| 12 | Deployment branch divergence | 0 | No gameplay value |
| 13 | Full CH rebranding | 0 | README / banners |
| 14 | Medical copy in BGS core | 0 | Disclaimer in sample only |
| 15 | MP sync of neuro state | 0 | New `sync/` design if ever needed |

---

## Tier D — NME / SFE integration (broader than CH)

| # | Capability | R | C | M | P | **Total** | Recommendation |
|---|------------|---|---|---|---|-----------|----------------|
| D1 | Authoring docs + SFE link | 3 | 3 | 3 | 3 | **12** | **Ship** — `docs/AUTHORING_SNIPPETS.md` |
| D2 | Expand particle snippet catalog | 3 | 3 | 3 | 3 | **12** | Low risk; designer-facing |
| D3 | `materialSnippetId` without `#nm` mesh rename | 3 | 3 | 2 | 2 | **10** | Spike E |
| D4 | `SmartFilterManager` + env `smartFilter` | 3 | 3 | 1 | 1 | **8** | Spike F; needs API spike |
| D5 | Gameplay-driven filter uniforms | 2 | 2 | 1 | 1 | **6** | After D4 + sim module |
| D6 | Settings snippet browser / preview | 2 | 2 | 1 | 2 | **7** | Future designer UX |

---

## Priority order (implementation)

1. **D1** — documentation (immediate)
2. **A3, A7, A5, A6** — generic hooks (Spikes A, B, D partial)
3. **A1 + B9** — simulation module behind flag (Spike C)
4. **D3, D4** — NME/SFE spikes E, F
5. **B8** — SynapticLab as external sample, not core `assets.ts`
