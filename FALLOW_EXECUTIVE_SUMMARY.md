# Fallow Executive Summary

## Bottom Line

Fallow has been highly effective as a codebase hygiene and reduction tool for this project. Its strongest results were in dead surface area, duplicate exported types, and import graph simplification. It was less directly decisive for complexity reduction, but it identified the right hotspots and helped guide targeted refactors without breaking typecheck, lint, or Babylon Playground export compatibility.

The current Fallow-driven work removes a net `1,747` lines from the staged working tree (`522` insertions, `2,269` deletions), including deleted dormant sync/playground scaffolding and follow-up reductions in serialization, sky effects, mobile input, class APIs, and duplicate type definitions.

## Before / After

- `unused_exports`: `34` to `0`  
  Fallow was very effective here. The report exposed stale multiplayer serialization and wire guard APIs left behind after dormant sync modules were removed.

- `duplicate_exports`: `13` to `0`  
  Duplicate type definitions were consolidated into clearer canonical owners: UI types in `src/client/types/ui.ts`, environment/item/sky types in `src/client/types/environment.ts`, and config importing domain types instead of redeclaring them.

- `circular_dependencies`: `14` to `0`  
  This was the strongest architecture result. Fallow made the import cycle cluster visible enough to move runtime callbacks out of static config and replace direct cyclic imports with small callback registries.

- `unused_class_members`: `68` to `44`  
  Useful, but noisy. Some findings were true dead stubs and were removed; others are public singleton/runtime APIs that Fallow cannot reliably see through indirect usage. Keeping this category as `warn` is appropriate.

- `unused_types`: `13` to `7`  
  Progress came mostly from type consolidation. Remaining items appear lower priority and should be reviewed separately from value-level dead code.

- Health: `198` functions above threshold and maintainability `89.8` to `196` functions above threshold and maintainability `91`  
  Complexity improved modestly. The health report is best understood as a risk map rather than an automatic cleanup list. It correctly continues to point at larger areas such as `multiplayer_bootstrap.ts`, `settings_ui.ts`, and `character_loader.ts`.

## Effectiveness Assessment

Fallow was most effective where static analysis matches the problem shape: unused files, unused exports, duplicate exports, and import cycles. Those categories produced clear, actionable work with measurable improvement and low ambiguity once project-specific entry points were modeled in `.fallowrc.json`.

Fallow was moderately effective for LOC reduction. It did not simply say "delete code"; it separated likely-dead code from configuration-driven or Playground-related false positives. After configuration, the findings supported a substantial net reduction while preserving the project’s multi-target deployment and generated Playground output.

Fallow was useful but less authoritative for complexity. The health report identified real hotspots, but reducing complexity safely still required engineering judgment about runtime behavior, Babylon lifecycle ordering, and multiplayer synchronization invariants.

## Caveats

- This project is configuration-driven, so "unused" can mean dormant by current configuration rather than universally dead.
- Babylon Playground export paths and generated JSON need explicit ignore/configuration handling.
- The remaining `vite.config.ts` unresolved import finding is a known false positive around `new URL('./dist/', import.meta.url)`.
- Class member analysis is noisy for singleton-style managers and runtime-wired APIs.
- Health findings remain intentionally non-zero; they now serve as a prioritized refactor queue rather than evidence that the cleanup failed.

## Recommendation

Keep Fallow in the workflow, but keep the rollout warning-oriented for now. Promote high-confidence rules first: `unused-files`, `unused-exports`, `duplicate-exports`, and `circular-dependencies`. Leave `unused-class-members`, `unused-types`, and health findings as review inputs until the remaining intentional APIs and extension points are either documented or suppressed.

Do not treat "large function" as an automatic refactor mandate. Large functions should only be changed when the refactor creates real reuse and produces a net LOC reduction; splitting code into more helpers without reducing total code is not a win.

The next checkpoint should measure whether any continued health refactors reduce large-function risk in `src/client/managers/multiplayer_bootstrap.ts`, `src/client/ui/settings_ui.ts`, and `src/client/managers/character_loader.ts` while also reducing LOC and avoiding new dead-code or cycle counts.
