# TypeScript style compliance

Language in this document follows [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html): **MUST**, **SHOULD**, and **MAY** describe requirements and expectations for this repository.

## Authoritative guides

This project aims to follow:

- [Basarat’s TypeScript Style Guide](https://basarat.gitbook.io/typescript/styleguide)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

Tooling (**Prettier**, **TypeScript** `strict` options, **ESLint** with `typescript-eslint` type-aware presets) is the enforcement layer. `npm run format:check`, `npm run lint`, and `npm run typecheck` **MUST** pass on the default branch and in CI.

Prettier is configured in `package.json` to format **`src/**/*.ts`**, **`eslint.config.js`**, and **`vite.config.ts`** (see `format` / `format:check` scripts).

## Filename axis (dual guide resolution)

Basarat recommends **camelCase** source file names; Google requires **snake_case** module file names. Both cannot be satisfied literally for the same tree.

**Resolution:** this repository **MUST** use **Google snake_case** for all first-party `*.ts` modules under `src/` (for example `scene_manager.ts`, `game_config.ts`). Basarat’s filename rule is **not** satisfied on this axis; Google’s rule **is**.

One-shot renames were performed via `scripts/rename_modules_snake_case.py` (git history preserves moves).

## Compiler

Root `tsconfig.json` and `tsconfig.node.json` enable `strict`, unused/implicit rules, `noImplicitOverride`, `noUncheckedIndexedAccess`, and related checks. All diagnostics **MUST** be fixed in source.

### `skipLibCheck`

`skipLibCheck` is **true** in client and Node configs so declaration emit and editor performance remain practical while depending on large Babylon.js typings. Setting it to **false** is desirable in the abstract; flipping it **SHOULD** be revisited when Babylon’s packaged `.d.ts` quality makes a clean `tsc` run sustainable without broad suppressions.

## ESLint policy

ESLint extends `eslint:recommended`, `plugin:@typescript-eslint/recommended`, **`plugin:@typescript-eslint/strict-type-checked`**, **`plugin:@typescript-eslint/stylistic-type-checked`**, `eslint-config-prettier`, and `eslint-plugin-import` (including **`import/order`**).

### Babylon.js and `any`

Babylon’s global typings and mesh APIs are often typed loosely. A shared block in `eslint.config.js` turns off `@typescript-eslint/no-unsafe-*` and `restrict-template-expressions` so strict checking applies to first-party logic without drowning in engine noise. **`@typescript-eslint/no-explicit-any` remains `error`** in first-party code.

### Additional pragmatic rule adjustments

The following rules are relaxed at project scope and documented here (they fight common Babylon/DOM patterns or static service layout more than they catch real bugs here):

| Rule | Rationale |
| --- | --- |
| `@typescript-eslint/no-extraneous-class` | Many coordinators are intentional static-only classes. |
| `@typescript-eslint/no-unnecessary-condition` | DOM and engine APIs are often narrower in types than at runtime. |
| `@typescript-eslint/prefer-optional-chain` | Stylistic; optional chaining is used where it reads clearly. |
| `@typescript-eslint/prefer-for-of` | Indexed loops are sometimes clearer with Babylon collections. |
| `@typescript-eslint/no-deprecated` | **Enabled** (`error`). `navigator.platform` iPad heuristics use a line-level disable where `userAgentData` is unavailable. |
| `@typescript-eslint/no-non-null-assertion` | Rare `!` uses are allowed when paired with prior bounds checks. |

File- or line-level `eslint-disable` comments **MUST NOT** be used as a blanket substitute; any disable **MUST** cite a guide-recognized exception or a tracked third-party defect.

## `interface` vs `type`

Per Google, object shapes **SHOULD** be expressed with **`interface`**; **`type`** is reserved for unions, intersections, mapped types, and similar. Existing types in `src/client/types/` already follow this split in practice.

## Imports and `catch`

Relative imports **MUST** be used within the client tree. Import groups follow `import/order` (builtin → external → internal → parent → sibling).

Optional catch bindings **SHOULD** be omitted (`catch {`) when the error value is unused, per Google’s guidance and `@typescript-eslint/no-unused-vars` (`caughtErrors: 'none'`).

## UTF-8 and comments

Sources **MUST** be UTF-8. Prefer `//` for narrative comments where that matches Google’s readability guidance; keep `/** … */` for exported API documentation where it adds value.

## Continuous integration

GitHub Actions workflow `.github/workflows/typecheck.yml` runs, in order: **`npm run format:check`**, **`npm run lint`**, **`npm run typecheck`**.
