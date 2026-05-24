# Contributing to Babylon Game Starter

Thanks for your interest in improving Babylon Game Starter. This document describes how to set up a development environment, the coding standards we expect, the versioning scheme the project follows, and how to submit changes.

Language in this document follows [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html): **MUST**, **SHOULD**, and **MAY** describe requirements and expectations for contributions.

---

## Code of conduct

Be respectful, assume good intent, and keep discussion focused on the work. Harassment, personal attacks, and discriminatory language are not welcome in issues, pull requests, commit messages, or any other project space. Maintainers reserve the right to remove or edit content that violates these expectations.

---

## Versioning — Semantic Versioning 2.0.0

This project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). The version in `package.json` is the single source of truth and **MUST** match the version in `package-lock.json`. The project is currently at **`1.6.0`** — the public API is stable and the standard `MAJOR.MINOR.PATCH` rules apply.

Given a version number `MAJOR.MINOR.PATCH`:

- **MAJOR** — incremented for incompatible API or behavior changes (breaking changes).
- **MINOR** — incremented for backwards-compatible feature additions.
- **PATCH** — incremented for backwards-compatible bug fixes and internal improvements.

Pre-release identifiers (for example `1.1.0-rc.1`) and build metadata (`+build.sha`) **MAY** be used per the SemVer spec when publishing release candidates.

### What counts as a "public API" for this project

Because this is a starter / framework, the public surface that SemVer rules apply to is:

- The shape and field names of typed config under `src/client/config/` (`assets.ts`, `game_config.ts`, `input_keys.ts`, `mobile_controls.ts`, `character_states.ts`).
- Exports from `src/client/index.ts` (the playground entry) and the `src/client/managers/` public methods consumed by application code.
- The multiplayer wire contract documented in [MULTIPLAYER_SYNCH.md](MULTIPLAYER_SYNCH.md).
- The serialization formats documented in [SERIALIZATION_GUIDE.md](SERIALIZATION_GUIDE.md).
- The deployment settings schema under `src/deployment/`.
- The shape of the generated `playground.json`.

Internal helpers that are not exported from these surfaces are not covered and **MAY** change without a version bump.

### Bumping the version

When you cut a release:

1. Update `package.json` `version`.
2. Run `npm install` (or `npm install --package-lock-only`) so `package-lock.json` is updated to match.
3. Add a `CHANGELOG.md` entry (or release notes) describing the change category — `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` — following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
4. Tag the release commit with `vMAJOR.MINOR.PATCH` (e.g. `git tag v0.1.0`).

---

## Development environment

### Prerequisites

- **Node.js ≥ 20.19** (CI runs Node 22; Vite 8 requires Node 20.19+ or 22.12+).
- **npm** (the project ships an `npm` lockfile; do not commit `pnpm-lock.yaml` or `yarn.lock`).
- **Go** (only required if you are working on the multiplayer server under `src/server/multiplayer/`).

### Setup

```sh
git clone https://github.com/EricEisaman/babylon-game-starter.git
cd babylon-game-starter
npm install
```

### Running locally

```sh
npm run dev               # Vite client on http://localhost:3000
npm run dev:fullstack     # Vite client + Go multiplayer server (auto-restarts)
```

See [README.md](README.md#quick-start) for the full script reference and [MULTIPLAYER.md](MULTIPLAYER.md) for multiplayer-specific configuration.

### GitHub Actions and Pages (forks)

If you fork the repository and use GitHub Pages or the **`feature/**`** sync workflow, complete the one-time checklist in **[FORK_GITHUB_SETUP.md](FORK_GITHUB_SETUP.md)**. That aligns **Pages → Source** (GitHub Actions), the **`github-pages`** environment (**`gh-deploy`** only), and **`settings.mjs`** (`basePath`, optional `githubPages`) with upstream so you do not get failed **`pages build and deployment`** runs on **`main`**.

---

## Coding standards

The full TypeScript style policy is in [STYLE.md](STYLE.md). The short version:

- Source files **MUST** be UTF-8.
- First-party `*.ts` modules under `src/` **MUST** use **`snake_case`** filenames (e.g. `scene_manager.ts`, `game_config.ts`).
- TypeScript runs in `strict` mode. All diagnostics **MUST** be fixed in source — do not suppress with `// @ts-ignore`.
- `@typescript-eslint/no-explicit-any` is `error` in first-party code.
- File- or line-level `eslint-disable` comments **MUST NOT** be used as a blanket workaround.
- Object shapes **SHOULD** be expressed with `interface`; reserve `type` for unions, intersections, and mapped types.
- Imports follow `import/order` (builtin → external → internal → parent → sibling).

### Tooling gates

These three commands **MUST** pass on the default branch and on every pull request — they are enforced by `.github/workflows/typecheck.yml`:

```sh
npm run format:check
npm run lint
npm run typecheck
```

Helpers:

```sh
npm run format     # Prettier write
npm run lint:fix   # ESLint --fix
```

### Playground export

If your change touches code that ships inside `playground.json`, run:

```sh
npm run export:playground
```

The export pipeline is smoke-checked by `scripts/check-playground-export.mjs`. See [PLAYGROUND.md](PLAYGROUND.md) for the static-imports-only rule and the ambient `BABYLON` global guardrails.

---

## Branching and pull requests

1. **Fork** the repository and create a topic branch from `main`. Branch names **SHOULD** be short and descriptive — e.g. `fix/inventory-credit-overflow`, `feat/sky-presets`.
2. **Keep PRs focused.** One logical change per pull request makes review and `git bisect` tractable.
3. **Run the gates locally** (`format:check`, `lint`, `typecheck`) before pushing.
4. **Update documentation** in the same PR when you change observable behavior, configuration shapes, or the multiplayer wire contract.
5. **Open the PR** against `main` and fill out the description, including:
   - What the change does and why.
   - Whether it is a breaking change (and if so, the migration path).
   - Manual test notes (browser, device, multiplayer scenario, etc.).
6. **CI must be green** before a maintainer merges.

### Commit messages

Commit messages **SHOULD** follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format:

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Use `!` after the type/scope (or a `BREAKING CHANGE:` footer) to flag a breaking change — these are the changes that drive a SemVer **MAJOR** bump.

Examples:

```
feat(hud): add iPad + keyboard layout
fix(multiplayer): clamp authority handoff jitter to 50ms
refactor(scene_manager)!: rename loadEnvironment → switchEnvironment
```

---

## Reporting bugs and requesting features

- **Bugs:** open a GitHub issue with reproduction steps, expected vs. actual behavior, browser/OS, and any console output. Multiplayer reports **SHOULD** include whether the host is local or hosted, and the relevant section of [MULTIPLAYER_SYNCH.md](MULTIPLAYER_SYNCH.md) if you suspect a contract violation.
- **Feature requests:** open an issue describing the use case before sending a PR. For larger changes, this avoids wasted effort on an approach the maintainers cannot accept.
- **Security issues** (e.g. multiplayer authority bypasses, credential exposure): do **not** file a public issue. Email the maintainer listed in the repository profile.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this repository.
