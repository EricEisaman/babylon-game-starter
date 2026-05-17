# GitHub setup for forks

Use this checklist after you **fork** the repo so Actions and GitHub Pages behave like upstream: deploys only from **`gh-deploy`**, no failed **`pages build and deployment`** runs on **`main`**.

Settings below are configured in the **GitHub web UI** for your fork. They are **not** stored in git, so each fork owner must apply them once.

## Branch roles

| Branch | Role |
| ------ | ---- |
| **`main`** | Default branch; feature merges; **does not** publish Pages |
| **`gh-deploy`** | GitHub Pages build + deploy (push or manual **Deploy GitHub Pages**) |
| **`netlify-deployment`**, **`render-deploy`** | Other hosts; updated via the same sync workflow |

Workflow files in `.github/workflows/` are copied when you fork. **GitHub repo settings** are not.

## One-time checklist

### 1. Enable Actions

**Settings → Actions → General** — allow Actions for this repository.

### 2. Pages source (required)

**Settings → Pages → Build and deployment → Source** must be **GitHub Actions**.

If **Source** is **Deploy from a branch** (often **`main`**), GitHub runs the built-in **`pages build and deployment`** workflow on every push to **`main`**. That workflow is **not** **Deploy GitHub Pages**. It often fails with `Branch "main" is not allowed to deploy to github-pages` when the environment only allows **`gh-deploy`**.

### 3. `github-pages` environment

**Settings → Environments → `github-pages` → Deployment branches**

- Allow **`gh-deploy`** (or your configured deploy branch).
- Do **not** add **`main`** unless you intentionally publish from **`main`**.

### 4. Deployment settings in git

Edit [`src/deployment/settings/settings.mjs`](src/deployment/settings/settings.mjs) for **your** fork:

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
    basePath: '/<your-repo-name>/', // project site: https://<user>.github.io/<your-repo-name>/
    githubPages: {
      deployBranch: 'gh-deploy',
      environmentName: 'github-pages'
    }
  }
};
```

- **`basePath`** must match your Pages URL path (leading and trailing `/`).
- Optional **`githubPages`** overrides defaults; omit it to use **`gh-deploy`** and **`github-pages`**.

Then:

```bash
npm run deploy:prepare
git add src/deployment/settings/settings.mjs .github/workflows/deploy-github-pages.yml
git commit -m "Configure GitHub Pages for fork"
git push origin main   # or your default branch; then sync to gh-deploy per FEATURE_RELEASE.md
```

Ensure branch **`gh-deploy`** exists on your fork (it is in the upstream repo; fetch or create it if missing).

### 5. Optional: set Pages source via CLI

With [GitHub CLI](https://cli.github.com/) and admin access to **your fork**:

```bash
gh auth login
gh repo set-default   # select your fork
gh api -X PUT "repos/$(gh repo view --json nameWithOwner -q .)/pages" -f build_type=workflow
```

Confirm: `gh api repos/$(gh repo view --json nameWithOwner -q .)/pages --jq '{build_type, source}'` should show `"build_type":"workflow"`.

## Day-to-day workflows

### Publish to GitHub Pages

1. Merge changes into **`gh-deploy`** (often via a sync PR — see below).
2. **Push** to **`gh-deploy`**, **or** **Actions → Deploy GitHub Pages → Run workflow** with **Use workflow from** = **`gh-deploy`**.

Never use **Use workflow from** = **`main`** for **Deploy GitHub Pages**; the workflow rejects non-**`gh-deploy`** refs before the **`github-pages`** environment runs.

### Sync feature work to `main` and deploy branches

On **your fork**, push a tag matching **`feature/**`** (or run **Sync feature ref to main and deployment branches** with **`feature_ref`**). That opens PRs into **`main`**, **`gh-deploy`**, **`netlify-deployment`**, and **`render-deploy`** on **your fork**, not on upstream.

See **[FEATURE_RELEASE.md](FEATURE_RELEASE.md)**.

## Two different workflows

| Workflow | Purpose |
| -------- | ------- |
| **Sync feature ref to main and deployment branches** | Open sync PRs from a **`feature/**`** tag or manual **`feature_ref`** |
| **Deploy GitHub Pages** | Build **`dist/`** and deploy to Pages from **`gh-deploy`** only |

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| **`pages build and deployment`** fails on **`main`** | **Settings → Pages → Source** → **GitHub Actions** (step 2) |
| **`Branch "main" is not allowed...`** on **Deploy GitHub Pages** | Run workflow from **`gh-deploy`**, not **`main`** |
| **`Branch "gh-deploy" is not allowed...`** | Allow **`gh-deploy`** in **Environments → github-pages** (step 3) |
| Site loads without assets | Fix **`static.basePath`** to match `https://<user>.github.io/<repo>/` |
| Sync PRs appear on wrong repo | Tags and workflow runs apply to the repo you pushed to (your fork) |

## Related docs

- **[GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md](GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md)** — Settings, multiplayer, deploy steps
- **[FEATURE_RELEASE.md](FEATURE_RELEASE.md)** — Feature branch + **`feature/**`** tag flow
- **[src/deployment/DEPLOYMENT.md](src/deployment/DEPLOYMENT.md)** — Settings model and **`deploy:prepare`**
