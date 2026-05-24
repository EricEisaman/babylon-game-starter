# Netlify Static Site Deployment

This guide describes how to deploy `babylon-game-starter` as a static site to Netlify, and how to configure the multiplayer behavior for the published client.

## Overview

Netlify static deployment is a front-end-only build. No backend multiplayer service is hosted on Netlify itself.

For multiplayer, the client must connect to a remote multiplayer server or run with multiplayer disabled.

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
   - Set the Vite build-time environment variable `VITE_MULTIPLAYER_HOST` in Netlify site settings.
   - Example values:
     - `my-mp.onrender.com`
     - `myserver.example.com:5000`
     - `https://myserver.example.com`
   - The client strips the scheme automatically and uses only the host portion.

## Netlify configuration

### Step 1: Set deployment settings

In `src/deployment/settings/settings.mjs`, configure the deployment for Netlify static hosting.

Example (with local multiplayer dev server):

```js
const deploymentSettings = {
  host: 'netlify',
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
    basePath: '/'
  }
};

export default deploymentSettings;
```

- `host: 'netlify'` and `type: 'static'` are required.
- `services` should include the multiplayer Go server entry with `localPort: 5000`. This tells the Vite dev server to proxy `/api/multiplayer/*` → `localhost:5000` when running `npm run dev` locally, so that `npm run dev:multiplayer` is reachable from the browser. **`localPort` is only used by the Vite dev proxy — it has no effect on the Netlify build or deployment.** Omitting the service entry (leaving `services: []`) causes every multiplayer API call to 404 in local dev.
- `basePath` controls the deployed base URL if you publish to a subpath; `/` is the default.

### Step 2: Prepare deployment artifacts

Run:

```bash
npm run deploy:prepare
```

This script validates the deployment settings and generates the Netlify host files (for example `netlify.toml`).

The generated `netlify.toml` pins the static build settings used by Netlify:

```toml
[build]
command = "npm ci && npm run build"
publish = "dist"

[build.environment]
NODE_VERSION = "22"
NODE_OPTIONS = "--max-old-space-size=4096"
```

`NODE_OPTIONS` raises the Node heap for Vite's production build; the `npm run build` script also sets the same heap limit so local and hosted builds behave consistently. The Babylon Inspector is loaded only in Vite development, so production builds should not bundle the Inspector's React/Fluent UI dependency graph.

### Step 3: Build the static site

Run:

```bash
npm run build
```

This produces the static assets under `dist/`.

### Step 4: Configure Netlify environment variables

In your Netlify site settings, add the environment variables:

- `VITE_MULTIPLAYER_HOST` — optional, set only when using a custom multiplayer server
- `NODE_ENV=production` — optional, but recommended for production builds
- `NODE_VERSION=22` and `NODE_OPTIONS=--max-old-space-size=4096` are already provided by `netlify.toml`; only override them in the Netlify UI if you intentionally want different build runtime settings.

If you want to disable multiplayer entirely, do not set `VITE_MULTIPLAYER_HOST`; instead use `CONFIG.MULTIPLAYER.ENABLED = false`.

### Step 5: Deploy

Deploy the generated site through Netlify as usual:

- Connect your Git repository in the Netlify dashboard
- Set the build command to `npm run build`
- Set the publish directory to `dist`
- Add the `VITE_MULTIPLAYER_HOST` environment variable if needed

## Multiplayer behavior details

### Using the shared default server

- The built client will probe `https://bgs-mp.onrender.com/api/multiplayer/health`.
- If the health check succeeds, it will connect to `https://bgs-mp.onrender.com/api/multiplayer/stream`.
- This server is shared and suitable for demos, but not for production-grade or large-class deployments.

### Using a custom server

- Set `VITE_MULTIPLAYER_HOST` in Netlify site environment variables.
- The client will validate the host with a health check before using it.
- If the health probe fails, the client throws a clear error instead of silently falling back.
- The custom server must allow CORS from the deployed front-end origin if the server is on a different domain.

### Disabling multiplayer

- Set `CONFIG.MULTIPLAYER.ENABLED = false` in `src/client/config/game_config.ts`.
- The client gracefully carries on without any backend multiplayer server.
- This is the recommended mode for a purely static Netlify deployment that does not require remote multiplayer.

## Notes for Netlify static sites

- Netlify cannot host the Go multiplayer server for this repo as a backend service in a static site deployment.
- If you require a live multiplayer server, use a remote host such as `bgs-mp.onrender.com` or your own server.
- Use `?mp=<host>` or `#mp=<host>` URL overrides only for exported playground snippets and runtime steering; Netlify builds still respect the environment-set `VITE_MULTIPLAYER_HOST` before defaulting to `bgs-mp.onrender.com`.

## Troubleshooting

- If the page loads without favicon or loading-screen logo, check that `static.basePath` matches the deployed path; branding assets under `src/client/public/branding/` use the same Vite base path as the rest of the build. See [BRANDING.md](BRANDING.md) for the full config reference and PWA asset requirements.
- If the site loads but multiplayer fails, open the browser console and confirm the client is probing the expected host.
- If using a custom host, confirm the server responds to `/api/multiplayer/health` and that CORS allows the site origin.
- If multiplayer should be disabled, verify `CONFIG.MULTIPLAYER.ENABLED` is `false` and not overwritten by another build-time setting.
