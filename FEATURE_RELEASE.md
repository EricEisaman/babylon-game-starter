# Feature release example (Monochrome + Rainbow Bright)

This guide walks through a concrete content change in [`src/client/config/assets.ts`](src/client/config/assets.ts) and the standard way to propagate that work to **`main`** and deployment branches using a **feature branch** and a **`feature/**` tag**.

**Fork:** Pushing a tag to **your fork** opens sync PRs on **your fork**. Complete **[FORK_GITHUB_SETUP.md](FORK_GITHUB_SETUP.md)** first so Pages and Actions match upstream.

## Purpose

You will:

1. Add a new collectible item to the **Monochrome** environment.
2. Verify it locally.
3. Push a **feature branch**, tag the commit with a name matching `feature/**`, and let GitHub Actions open sync pull requests into **`main`**, **`gh-deploy`**, **`netlify-deployment`**, and **`render-deploy`**.

This is documentation only: the snippets below are the example you would apply on a real feature branch.

## Example: add Rainbow Bright to Monochrome

The **Monochrome** environment is defined under `ASSETS.ENVIRONMENTS` in [`src/client/config/assets.ts`](src/client/config/assets.ts) (`name: 'Monochrome'`). Today it sets sky, spawn, and camera fields but **does not define `items`**. Add an **`items`** array to that environment object (for example after `cameraOffset`), using the same item shape as other environments in the same file.

```ts
items: [
  {
    name: 'Rainbow Bright',
    url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/RainbowBright.glb',
    collectible: true,
    creditValue: 500,
    minImpulseForCollection: 0.3,
    inventory: false,
    instances: [
      {
        position: new BABYLON.Vector3(5, 2, 3),
        scale: 1.0,
        rotation: new BABYLON.Vector3(0, 0, 0),
        mass: 10,
        colliderType: 'CONVEX_HULL',
        friction: 0.9
      }
    ]
  }
]
```

**Notes:**

- **`collectible: true`** — the item can be picked up for credits (`creditValue`).
- **`minImpulseForCollection`** — collection requires at least this collision impulse.
- **`instances`** — placement and physics for each spawned copy; adjust `position` if you want the mesh elsewhere in the scene.

### Local verification

```bash
npm install   # if needed
npm run dev
```

Open the game, switch to the **Monochrome** environment (in-game settings / UI), and confirm the Rainbow Bright mesh appears and collects as expected.

## Branch workflow

From your default branch (usually `main`):

```bash
git fetch origin
git switch main
git pull
git switch -c feature/rainbow-bright-monochrome
# edit src/client/config/assets.ts as above
git add src/client/config/assets.ts
git commit -m "Add Rainbow Bright collectible to Monochrome"
git push -u origin feature/rainbow-bright-monochrome
```

Optional but common: open a **pull request into `main`** yourself for early review. The sync workflow also opens (or updates) a **`sync/main/...` → `main`** PR with the same feature commit, so you can rely on that PR instead when you prefer a single automated path.

## Feature tag and what runs when you push it

The workflow [`.github/workflows/sync-feature-tag-to-deploy-branches.yml`](.github/workflows/sync-feature-tag-to-deploy-branches.yml) (**Sync feature ref to main and deployment branches** in the Actions UI) runs when:

- A tag matching **`feature/**`** is **pushed**, or
- You use **Actions → Sync feature ref to main and deployment branches → Run workflow** (see [Manual dispatch](#manual-dispatch-without-a-new-tag)).

### Create and push the tag

Create a lightweight tag on the commit you want deployed (often the tip of your feature branch):

```bash
git tag feature/rainbow-bright-monochrome
```

Push the tag to GitHub:

```bash
git push origin refs/tags/feature/rainbow-bright-monochrome
```

**Ref name collision:** If a **branch** and a **tag** share the same name (for example both `feature/rainbow-bright-monochrome`), `git push origin feature/rainbow-bright-monochrome` may fail with *refspec matches more than one*. Pushing with **`refs/tags/...`** as above avoids that. Alternatively, use different names for the branch and the tag.

### What GitHub Actions does

The workflow runs **four** matrix jobs in parallel (one target each):

**`main`**

1. Creates `sync/main/<label>` from `origin/main` and merges the feature commit with a **normal** merge (no special handling of deployment settings files).
2. Runs **`npm run export:playground`**, **`npm run typecheck`**, **`npm run lint`**, and **`npm run format:check`**.
3. Opens or updates a pull request **into `main`** (title like *Merge feature … into main*).

**Each deployment branch** (`render-deploy`, `netlify-deployment`, `gh-deploy`)

1. Merges your feature commit into a branch based off that deployment branch.
2. **Restores** branch-specific deployment settings from files such as [`src/deployment/settings/settings.mjs`](src/deployment/settings/settings.mjs) so host-specific config is not overwritten by `main`-style defaults.
3. Runs **`npm run export:playground`**, **`npm run typecheck`**, **`npm run lint`**, and **`npm run format:check`**.
4. Force-pushes `sync/<deploy-branch>/<label>` and **opens or updates a pull request** titled along the lines of *Sync `feature/...` into &lt;Host&gt; deployment*.

Merge those PRs when ready. For **GitHub Pages**, merge into **`gh-deploy`** so a **push** (or **Deploy GitHub Pages** from **`gh-deploy`**) publishes the site. Merge the **`main`** PR when you want the default branch updated without a manual fast-forward.

## Manual dispatch (without a new tag)

In the GitHub UI: **Actions** → **Sync feature ref to main and deployment branches** → **Run workflow**. Set **`feature_ref`** to a branch name, tag, or commit SHA. The same matrix jobs and PR behavior apply as for a tag push.

**Deploy GitHub Pages** is separate: manual redeploy only from **`gh-deploy`** ([GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md](GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md)).

## Related docs

- **[FORK_GITHUB_SETUP.md](FORK_GITHUB_SETUP.md)** — One-time GitHub settings for forks
- **[GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md](GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md)** — Pages deploy and multiplayer
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Local setup and PR expectations
