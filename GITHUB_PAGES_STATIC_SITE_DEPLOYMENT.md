# GitHub Pages Static Site Deployment

This guide describes how to deploy `babylon-game-starter` as a static site to GitHub Pages, and how to configure the multiplayer behavior for the published client.

## Overview

GitHub Pages deployment is a front-end-only build. No backend multiplayer service is hosted on GitHub Pages itself.

For multiplayer, the client must connect to a remote multiplayer server or run with multiplayer disabled.

The main difference from Netlify is pathing: GitHub Pages project sites are usually served from a repository subpath such as `/babylon-game-starter/`, so the Vite `base` path must match that published path.

## Supported multiplayer modes

1. **NONE**
   - Disable multiplayer entirely.
   - Use this when you want the game to run as a fully local single-player scene.
   - Configure in `src/client/config/game_config.ts`:
     ```ts
     MULTIPLAYER: {
       ENABLED: false,
       PRODUCTION_SERVER: 'bgs-mp.onrender.com',
       LOCAL_SERVER: 'localhost:5000',
       CONNECTION_TIMEOUT_MS: 15000,
       PRODUCTION_FIRST: true,
       // ...
     }
     ```
   - The client detects `ENABLED: false` and skips multiplayer server discovery.

2. **Shared Render multiplayer server**
   - Use the default public server at `bgs-mp.onrender.com`.
   - This is the same behavior used by the Babylon playground exports in this repo.
   - No additional build-time configuration is required if `CONFIG.MULTIPLAYER.PRODUCTION_SERVER` remains set to `bgs-mp.onrender.com`.

3. **Custom multiplayer server**
   - Point the client at your own multiplayer host.
   - Set the Vite build-time environment variable `VITE_MULTIPLAYER_HOST` in the GitHub Actions build environment.
   - Example values:
     - `my-mp.onrender.com`
     - `myserver.example.com:5000`
     - `https://myserver.example.com`
   - The client strips the scheme automatically and uses only the host portion.

## GitHub Pages configuration

### Step 1: Set deployment settings

In `src/deployment/settings/settings.mjs`, configure the deployment for GitHub Pages static hosting.

Example for this repository as a GitHub Pages project site:

```js
const deploymentSettings = {
  host: 'github.io',
  type: 'static',
  services: [
    {
      name: 'multiplayer',
      type: 'go',
      routePrefix: '/api/multiplayer',
      localPort: 5000
    }
  ],
  static: {
    basePath: '/babylon-game-starter/'
  }
};

export default deploymentSettings;
```

- `host: 'github.io'` and `type: 'static'` are required.
- `services` should include the multiplayer Go server entry with `localPort: 5000`. This tells the Vite dev server to proxy `/api/multiplayer/*` -> `localhost:5000` when running `npm run dev` locally, so that `npm run dev:multiplayer` is reachable from the browser. **`localPort` is only used by the Vite dev proxy; it has no effect on the GitHub Pages build or deployment.** Omitting the service entry (leaving `services: []`) causes every multiplayer API call to 404 in local dev.
- `basePath` controls the deployed base URL. For a GitHub Pages project site, set it to the repository path with leading and trailing slashes, for example `/babylon-game-starter/`.
- If you deploy to a user or organization Pages site at the domain root, use `basePath: '/'`.
- If you use a custom domain that serves the app from the domain root, use `basePath: '/'`. If the custom domain serves the app from a subpath, use that subpath.

### Step 2: Prepare deployment artifacts

Run:

```bash
npm run deploy:prepare
```

This script validates the deployment settings and generates the GitHub Pages workflow at `.github/workflows/deploy-github-pages.yml`.

`on.push.branches`, `deploy.environment.name`, and the **assert** ref use `static.githubPages` when set (`deployBranch`, `environmentName`; defaults **`gh-deploy`** / **`github-pages`**).

The generated workflow pins the static build and Pages deployment path (defaults shown):

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: ["gh-deploy"]
  # Only gh-deploy is a valid ref (see assert_deploy_branch). Pushes to other branches do not match on.push.
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  assert_deploy_branch:
    runs-on: ubuntu-latest
    steps:
      - name: Only deploy branch may reach the github-pages environment
        run: |
          if [ "${GITHUB_REF}" != "refs/heads/gh-deploy" ]; then
            echo "::error::Pages deploy runs only on ref gh-deploy."
            exit 1
          fi

  build:
    runs-on: ubuntu-latest
    needs: assert_deploy_branch
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    if: ${{ github.ref == 'refs/heads/gh-deploy' }}
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`npm run build` already sets `NODE_OPTIONS=--max-old-space-size=4096` through the package script, so local and hosted builds use the same heap limit. The Babylon Inspector is loaded only in Vite development, so production builds should not bundle the Inspector's React/Fluent UI dependency graph.

### Step 3: Build the static site locally

Run:

```bash
npm run build
```

This produces the static assets under `dist/`. With `host: 'github.io'`, Vite uses `static.basePath` as the production asset base path.

### Step 4: Configure GitHub Pages

In the GitHub repository:

- Open **Settings -> Pages**.
- Set **Source** to **GitHub Actions**.
- Confirm Actions are enabled for the repository.
- Confirm repository Actions settings allow workflows to create Pages deployments. The generated workflow requests `pages: write` and `id-token: write`.
- Open **Settings -> Environments -> github-pages** and confirm the deployment branch policy allows `gh-deploy`. If the environment is restricted to selected branches, add `gh-deploy` to the allowed deployment branches. Otherwise, choose unrestricted deployment branches if that matches your repo policy.
- **Do not** add **`main`** to the allowed list unless you deliberately publish Pages from the default branch. The usual pattern is to allow only **`gh-deploy`**, which is the branch this generated workflow uses for push triggers.

The generated workflow deploys to the `github-pages` environment:

```yaml
  deploy:
    if: ${{ github.ref == 'refs/heads/gh-deploy' }}
    environment:
      name: github-pages
```

GitHub checks this environment's deployment protection rules after the workflow starts. If `gh-deploy` is not allowed there, the build can succeed but the deploy job will fail with:

```text
Branch "gh-deploy" is not allowed to deploy to github-pages due to environment protection rules.
```

Deployment rules use the **ref that started the run** (for example the branch selected for **Run workflow**), not only the branch named under `on.push`. If **`gh-deploy`** is already allowed but you see:

```text
Branch "main" is not allowed to deploy to github-pages due to environment protection rules.
```

you most likely ran **workflow_dispatch** with **Use workflow from** still set to **`main`**. Rerun from **`gh-deploy`** (see Step 6); you do not need to add **`main`** to the environment for the normal deploy-branch workflow.

### Step 5: Configure GitHub Actions environment variables

For the shared default multiplayer server, no extra GitHub Actions environment variable is required.

For a custom multiplayer server:

1. Add a repository variable or secret named `VITE_MULTIPLAYER_HOST`.
2. Add it to the generated workflow's build job environment before `npm run build`.

Example using a repository variable:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      VITE_MULTIPLAYER_HOST: ${{ vars.VITE_MULTIPLAYER_HOST }}
    steps:
      - uses: actions/checkout@v4
      # ...
      - run: npm run build
```

If you want to disable multiplayer entirely, do not set `VITE_MULTIPLAYER_HOST`; instead use `CONFIG.MULTIPLAYER.ENABLED = false`.

### Step 6: Deploy

Deploy through GitHub Actions:

- Commit the generated `.github/workflows/deploy-github-pages.yml`.
- Push to `gh-deploy` to trigger the workflow on push.
- Or run **Deploy GitHub Pages** manually: **Actions** → select the workflow → **Run workflow**, and set **Use workflow from** to **`gh-deploy`** (not **`main`**). The default branch in that dropdown is often **`main`**; leaving it there makes GitHub check **`main`** against the **`github-pages`** environment, which fails if only **`gh-deploy`** is allowed.
- **`assert_deploy_branch`** checks **`GITHUB_REF` for every event** (not only `workflow_dispatch`). **`deploy`** also has `if: github.ref == refs/heads/<deployBranch>` so the **`github-pages`** environment is never requested from **`main`**, even if `on.push` were mis-edited. **Pushing to `main` does not match `on.push`** for the default workflow; a `Branch "main" is not allowed…` error usually means an older workflow on **`gh-deploy`** only gated manual runs, or **Run workflow** used **`main`** without these guards.
- From the CLI: `gh workflow run "Deploy GitHub Pages" --ref gh-deploy`
- After deployment, GitHub Pages serves the uploaded `dist/` artifact.

For the default project-site URL, the published app is expected at:

```text
https://<owner>.github.io/babylon-game-starter/
```

If the page loads without styles, JavaScript, favicon, or loading-screen logo, check that `static.basePath` exactly matches the deployed path; branding assets under `src/client/public/branding/` use the same Vite base path as the rest of the build.

## Multiplayer behavior details

### Using the shared default server

- The built client will probe `https://bgs-mp.onrender.com/api/multiplayer/health`.
- If the health check succeeds, it will connect to `https://bgs-mp.onrender.com/api/multiplayer/stream`.
- This server is shared and suitable for demos, but not for production-grade or large-class deployments.

### Using a custom server

- Set `VITE_MULTIPLAYER_HOST` in the GitHub Actions build environment.
- The client will validate the host with a health check before using it.
- If the health probe fails, the client throws a clear error instead of silently falling back.
- The custom server must allow CORS from the deployed GitHub Pages origin if the server is on a different domain.
- For a project site, the origin is still only the scheme and host, for example `https://<owner>.github.io`; the `/babylon-game-starter/` path is not part of the CORS origin.

### Disabling multiplayer

- Set `CONFIG.MULTIPLAYER.ENABLED = false` in `src/client/config/game_config.ts`.
- The client gracefully carries on without any backend multiplayer server.
- This is the recommended mode for a purely static GitHub Pages deployment that does not require remote multiplayer.

## Notes for GitHub Pages static sites

- GitHub Pages cannot host the Go multiplayer server for this repo as a backend service in a static site deployment.
- If you require a live multiplayer server, use a remote host such as `bgs-mp.onrender.com` or your own server.
- GitHub Pages project sites require the correct Vite base path. In this repo, that comes from `static.basePath` when `host: 'github.io'`.
- Unlike Netlify, GitHub Pages does not use `netlify.toml` or Netlify redirects. The generated GitHub Actions workflow uploads the built `dist/` directory directly to Pages.
- Use `?mp=<host>` or `#mp=<host>` URL overrides only for exported playground snippets and runtime steering; GitHub Pages builds still respect the environment-set `VITE_MULTIPLAYER_HOST` before defaulting to `bgs-mp.onrender.com`.

## Troubleshooting

- If the site loads without assets, verify `static.basePath` matches the GitHub Pages URL path, including leading and trailing slashes.
- If **`assert_deploy_branch`** fails, the workflow ref is not **`gh-deploy`**. For **Run workflow**, set **Use workflow from** to **`gh-deploy`**. Pushes to **`main`** do not start this workflow unless **`on.push`** mistakenly lists **`main`**—fix the YAML in that case.
- If the deploy job says `Branch "gh-deploy" is not allowed to deploy to github-pages due to environment protection rules`, open **Settings -> Environments -> github-pages** and allow `gh-deploy` in the deployment branch policy.
- If the message names **`main`** (`Branch "main" is not allowed...`), rerun the workflow from **`gh-deploy`** (or push to **`gh-deploy`**). You likely used **Run workflow** with **Use workflow from** set to **`main`**. Widening **`github-pages`** to allow **`main`** is not the default solution.
- If the workflow does not deploy, confirm Pages source is set to **GitHub Actions** and the workflow has `pages: write` and `id-token: write` permissions.
- If the site loads but multiplayer fails, open the browser console and confirm the client is probing the expected host.
- If using a custom host, confirm the server responds to `/api/multiplayer/health` and that CORS allows the GitHub Pages origin.
- If multiplayer should be disabled, verify `CONFIG.MULTIPLAYER.ENABLED` is `false` and not overwritten by another build-time setting.
