# GitHub Pages static site deployment

Front-end-only static hosting on GitHub Pages. The Go multiplayer server is **not** hosted on Pages; the client uses a remote host or multiplayer disabled (see [Supported multiplayer modes](#supported-multiplayer-modes)).

Project sites are served under a repo subpath (for example `/babylon-game-starter/`), so **`static.basePath`** in deployment settings must match that URL.

**Forked this repo?** Complete the one-time checklist in **[FORK_GITHUB_SETUP.md](FORK_GITHUB_SETUP.md)** before pushing to **`main`** or **`gh-deploy`**.

## How publishing works

| Trigger | Branch | Workflow |
| ------- | ------ | -------- |
| **Push** to deploy branch | **`gh-deploy`** (default) | [Deploy GitHub Pages](.github/workflows/deploy-github-pages.yml) |
| **Run workflow** (manual) | **Use workflow from** = **`gh-deploy`** | Same |
| **Push** to **`main`** | — | Does **not** deploy Pages |

**Do not** use **Settings → Pages → Deploy from a branch**. That runs GitHub’s built-in **`pages build and deployment`** on **`main`**, which is unrelated to **Deploy GitHub Pages** and commonly fails if the environment only allows **`gh-deploy`**.

**Feature / sync PRs** into **`main`**, **`gh-deploy`**, **`netlify-deployment`**, and **`render-deploy`** use **[`sync-feature-tag-to-deploy-branches.yml`](.github/workflows/sync-feature-tag-to-deploy-branches.yml)** and a **`feature/**`** tag — see **[FEATURE_RELEASE.md](FEATURE_RELEASE.md)**. That is separate from redeploying Pages via **Deploy GitHub Pages**.

The generated workflow (from `npm run deploy:prepare`) includes:

- **`on.push`** to **`static.githubPages.deployBranch`** (default **`gh-deploy`**)
- **`workflow_dispatch`** (manual runs must use the same branch in the UI)
- **`assert_deploy_branch`** — fails if **`GITHUB_REF`** is not **`refs/heads/<deployBranch>`**
- **`deploy.if`** — same ref check before the **`github-pages`** environment

## Setup

### 1. Deployment settings

Edit [`src/deployment/settings/settings.mjs`](src/deployment/settings/settings.mjs):

```js
const deploymentSettings = {
  host: 'github.io',
  type: 'static',
  services: [
    {
      name: 'multiplayer',
      type: 'go',
      routePrefix: '/api/multiplayer',
      localPort: 5000 // dev proxy only; not used on Pages build
    }
  ],
  static: {
    basePath: '/babylon-game-starter/',
    githubPages: {
      deployBranch: 'gh-deploy',
      environmentName: 'github-pages'
    }
  }
};
```

- **`basePath`**: repo subpath with slashes, or `'/'` for user/org site or custom domain at root.
- **`githubPages`**: optional; defaults above if omitted.

### 2. Generate workflow

```bash
npm run deploy:prepare
```

Writes [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml). Commit it with your settings.

### 3. GitHub repository settings

1. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
2. **Settings → Environments → `github-pages`:** deployment branches include **`gh-deploy`** only (not **`main`**, unless intentional)
3. Actions enabled; workflow needs **`pages: write`** and **`id-token: write`** (already in the generated file)

### 4. Local build (optional)

```bash
npm run build
```

Output: `dist/`. Vite uses **`static.basePath`** when `host` is **`github.io`**.

### 5. Deploy

- Merge to **`gh-deploy`** (often via sync PR), then **push**, **or**
- **Actions → Deploy GitHub Pages → Run workflow** with **Use workflow from** = **`gh-deploy`**

```bash
gh workflow run "Deploy GitHub Pages" --ref gh-deploy
```

Published URL (project site): `https://<owner>.github.io/<repo>/`

## Multiplayer on Pages

| Mode | Configuration |
| ---- | ------------- |
| **Disabled** | `CONFIG.MULTIPLAYER.ENABLED = false` in [`game_config.ts`](src/client/config/game_config.ts) |
| **Shared demo** | Default `PRODUCTION_SERVER` (`bgs-mp.onrender.com`); no build env var |
| **Custom host** | Repository variable `VITE_MULTIPLAYER_HOST` and add to workflow build job: `env: { VITE_MULTIPLAYER_HOST: ${{ vars.VITE_MULTIPLAYER_HOST }} }` |

Custom servers must allow CORS from `https://<owner>.github.io` (path is not part of the origin). Health: `/api/multiplayer/health`.

## Troubleshooting

| Symptom | Action |
| ------- | ------ |
| Broken assets / favicon | Match **`basePath`** to the live URL |
| **`pages build and deployment`** fails on **`main`** | **Pages → Source** = **GitHub Actions** ([fork checklist](FORK_GITHUB_SETUP.md)) |
| **`main` not allowed** on **Deploy GitHub Pages** | Run from **`gh-deploy`**, not **`main`** |
| **`gh-deploy` not allowed** | Add **`gh-deploy`** under **Environments → github-pages** |
| **`assert_deploy_branch`** failed | Wrong branch for manual run or fix **`on.push.branches`** / **`deployBranch`** |

## See also

- **[FORK_GITHUB_SETUP.md](FORK_GITHUB_SETUP.md)** — Fork one-time GitHub settings
- **[FEATURE_RELEASE.md](FEATURE_RELEASE.md)** — **`feature/**`** tag → sync PRs
- **[src/deployment/DEPLOYMENT.md](src/deployment/DEPLOYMENT.md)** — Settings model and other hosts
