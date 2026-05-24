# Render Deployment Pipeline: Multiplayer Edition

## Overview

This document walks through the complete Render deployment pipeline for babylon-game-starter with integrated multiplayer support. The setup uses a single Docker container that:
1. **Builds the TypeScript client** (Babylon.js game)
2. **Compiles the Go multiplayer server** endpoint
3. **Serves the client** via Nginx
4. **Proxies API requests** to backend services

---

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    Render Deployment (Single Container)             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
         ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
         │  Client     │  │  Go Server  │  │   Nginx     │
         │  (Babylon.js)  │  (Port 5000)│  │ (Port 10000)│
         │  Build       │  │  Build      │  │  Proxy      │
         └──────┬───────┘  └──────┬──────┘  └──────┬──────┘
                │                 │                 │
         ┌──────▼──────────────────▼──────┐        │
         │   Docker Builder Stage         │        │
         │                                │        │
         │  FROM node:22-alpine           │        │
         │  - npm ci                      │        │
         │  - npm run build               │        │
         │  - apk add go (if NEED_GO=1)  │        │
         │  - Compile Go multiplayer      │        │
         └──────┬───────────────────────────┘        │
                │                                    │
         ┌──────▼──────────────────────────────┐     │
         │   Docker Runtime Stage               │     │
         │                                      │     │
         │  FROM nginx:alpine                   │     │
         │  - Copy dist/ to /usr/share/nginx/html
         │  - Copy nginx.conf                   │     │
         │  - Listen on port 10000              │◄────┘
         └───────────────────────────────────────┘
```

---

## Deployment Settings

### 1. **Deployment Configuration** (`src/deployment/settings/settings.mjs`)

```typescript
// ✅ Updated with both services:
const deploymentSettings = {
  host: 'render.com',
  type: 'web-service',
  services: [
    {
      name: 'api',
      type: 'node',
      routePrefix: '/api',
      localPort: 8787  // Node API service (future use)
    },
    {
      name: 'multiplayer',
      type: 'go',
      routePrefix: '/api/multiplayer',
      localPort: 5000  // ✅ GO Multiplayer service
    }
  ],
  static: {
    basePath: '/',
    publicUrl: 'https://your-service.onrender.com'
  }
};
```

**What this does:**
- Registers `multiplayer` as a Go service with route `/api/multiplayer`
- Docker build script detects `NEED_GO=1` and installs Go compiler
- `vite.config.ts` proxy automatically routes `/api/multiplayer/*` to `localhost:5000` in dev
- Nginx proxies production requests to Go service port 5000

**Social link previews:** Set `static.publicUrl` on the **`render-deploy`** branch to your live Render URL (for example `https://your-service.onrender.com`). Build-time Open Graph tags use that value — see [BRANDING.md — Social link previews](BRANDING.md#social-link-previews).

### 2. **Nginx Proxy Configuration** (`nginx.conf`)

```nginx
# ✅ Updated with API proxying:

# Multiplayer service (Go) on port 5000
location /api/multiplayer/ {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    # SSE support (no Upgrade header needed)
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Default API proxy (Node service) on port 8787
location /api/ {
    proxy_pass http://localhost:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Client SPA routing
location / {
    try_files $uri $uri/ /index.html;
}
```

**Key features:**
- SSE support for Datastar: Standard HTTP proxy (standard headers only)
- Multiplayer routes go to port 5000 (Go)
- Default API routes to port 8787 (Node)
- X-Forwarded-* headers preserve client info

---

## Docker Build Pipeline

### Build Stage (Conditional Runtime Installation)

The `Dockerfile` uses `runtime-install-plan.mjs` to detect required runtimes:

```bash
# Step 1: Check which runtimes are needed
eval "$(node src/deployment/scripts/runtime-install-plan.mjs)"

# Output: NEED_GO=1, NEED_RUST=0, NEED_PYTHON=0

# Step 2: Install Go compiler (Alpine)
if [ "$NEED_GO" = "1" ]; then
    apk add --no-cache go  # ~150MB
fi

# Step 3: Build client
npm run build  # TypeScript + Babylon.js → /dist

# Step 4: (Production) Go binary is built in a separate `golang:1.24-alpine` stage; see Dockerfile.
```

### Runtime (nginx + Go in one container)

The production `Dockerfile` copies a static **`multiplayer-server`** binary into the nginx image and starts it with **`docker-entrypoint.sh`**: Go listens on **`:5000`** (nginx `proxy_pass`), nginx listens on **10000**. Render sets `PORT=10000`; the entrypoint runs Go with **`PORT=5000`** so it does not inherit the nginx port.

---

## Client Configuration for Production

### Game Config (`src/client/config/game_config.ts`)

```typescript
MULTIPLAYER: {
  ENABLED: true,
  PRODUCTION_SERVER: 'bgs-mp.onrender.com',   // Your Render deployment
  LOCAL_SERVER: 'localhost:5000',             // Dev fallback
  CONNECTION_TIMEOUT_MS: 30000,               // 30 s covers Render free-tier cold starts
  PRODUCTION_FIRST: true                      // Try production first
}
```

### Cross-origin access (important for classroom / playground use)

The Go server applies `withCORS` (see [`src/server/multiplayer/cors.go`](src/server/multiplayer/cors.go)) to every route. Two deployment modes:

- **Unpinned (recommended for classrooms).** Leave `MULTIPLAYER_CORS_ALLOW_ORIGIN` **unset**. The server echoes the request `Origin`, so the API accepts browsers on any page — including `https://playground.babylonjs.com` when students paste the exported snippet.
- **Pinned.** Set `MULTIPLAYER_CORS_ALLOW_ORIGIN=https://your-host.example.com` to lock the API down to a single front-end origin. Students pasting into the Babylon playground will then see `CORS blocked` in the browser console unless you add `https://playground.babylonjs.com` to the allowed list (the server currently supports a single origin in the env var; for multi-origin support, edit `cors.go`).

Classroom guidance: do not pin this variable unless you have a specific security reason. The default echo-origin behavior is both playground-friendly and compatible with fork deploys without any extra plumbing.

### Client Connection Flow

```text
Browser (Render Web Service)
         ↓
(/index.html served by Nginx on port 10000)
         ↓
(JavaScript loads - Babylon.js client)
         ↓
MultiplayerManager.join('env', 'char')
         ↓
getDatastarClient() → determineMultiplayerUrl()
         ↓
Tries: https://bgs-mp.onrender.com/api/multiplayer/health
         ↓
Health check succeeds
         ↓
SSE: `https://bgs-mp.onrender.com/api/multiplayer/stream`
         ↓
✅ Connected to multiplayer server
```

---

## Build Commands

### Local Development

```bash
# Terminal 1: Start Go multiplayer server
cd src/server/multiplayer
go run *.go  # Listens on :5000

# Terminal 2: Start Vite dev server
npm run dev  # Listens on :3000, proxies /api/multiplayer to :5000
```

### Local Build (Simulating Production)

```bash
# Build everything
npm run build

# Check output
ls -la dist/
# dist/
# ├── index.html          (SPA entry)
# ├── assets/             (JS, CSS, images)
# └── branding/           (config files)
```

### Docker Build (Simulating Render)

```bash
# Build Docker image
docker build -t babylon-mp:latest .

# Run locally
docker run -p 10000:10000 babylon-mp:latest

# Test
curl http://localhost:10000/
curl http://localhost:10000/api/multiplayer/health
```

---

## Render Deployment Checklist

### Pre-Deployment (Local Verification)

- [ ] **Go binaries compile**: `cd src/server/multiplayer && go build -o multiplayer *.go`
- [ ] **Client builds**: `npm run build && ls dist/index.html`
- [ ] **Docker builds**: `docker build -t babylon-mp:latest .`
- [ ] **Docker runs**: `docker run -p 10000:10000 babylon-mp:latest`
- [ ] **Health check works**: `curl http://localhost:10000/api/multiplayer/health`
- [ ] **Git status clean**: `git status` (all multiplayer changes committed)

### Render Configuration

- [ ] **Create new Web Service** on Render
- [ ] **Git repo**: Connect `babylon-game-starter` repository
- [ ] **Branch**: Select `mp` (or your branch)
- [ ] **Dockerfile**: `./Dockerfile` (default)
- [ ] **Port**: `10000` (default on free tier)
- [ ] **Environment**: No special vars needed (PORT auto-set by Render)

### Post-Deployment

- [ ] **Service deployed**: Status shows "Live"
- [ ] **URL accessible**: `https://your-service.onrender.com`
- [ ] **Health check**: `curl https://your-service.onrender.com/api/multiplayer/health`
- [ ] **Client loads**: Open in browser, check console for errors
- [ ] **Multiplayer connects**: Client should connect to production server

### Peer visibility (same environment)

Remote avatars are shown only when each client’s **`environmentName`** (from `ASSETS.ENVIRONMENTS[].name`) matches the peer’s reported environment. If two players pick different maps (e.g. Mansion vs Level Test), they will not see each other even though join/SSE succeed—this is intentional routing, not a broken deploy.

---

## File Structure

```text
babylon-game-starter/
├── Dockerfile                          # Client build + Go binary + nginx runtime
├── docker-entrypoint.sh                # Starts Go :5000 + nginx :10000
├── nginx.conf                          # Proxies /api/multiplayer to port 5000
├── render.yaml                         # Render config
├── vite.config.ts                      # Dev server proxy setup
├── src/
│   ├── client/
│   │   ├── config/game_config.ts       # MULTIPLAYER config
│   │   ├── datastar/                   # SSE client
│   │   ├── managers/multiplayer_manager.ts
│   │   ├── managers/multiplayer_bootstrap.ts  # Wires MP into the scene
│   │   ├── sync/                       # State sync modules
│   │   └── types/multiplayer.ts        # Interfaces
│   ├── server/
│   │   ├── api/                        # Node API (future)
│   │   └── multiplayer/                # Go server
│   │       ├── main.go                 # Entry point + shared state
│   │       ├── handlers.go             # HTTP handlers
│   │       ├── item_authority.go       # Item / env authority state
│   │       ├── utils.go                # Helpers
│   │       └── go.mod                  # Go dependencies
│   └── deployment/
│       ├── settings/settings.mjs       # Service registration
│       └── scripts/
│           ├── runtime-install-plan.mjs # Detects NEED_GO=1
│           └── prepare-deployment.mjs
├── MULTIPLAYER.md                      # Onboarding + operations
├── MULTIPLAYER_SYNCH.md                # Normative protocol spec
└── RENDER_DEPLOYMENT.md                # This file
```

---

## Troubleshooting

### Build Fails: "go: command not found"

**Symptom**: Docker build fails in install phase

```text
error: go: command not found
```

**Root cause**: `NEED_GO` flag not detected
**Solution**: Verify `src/deployment/settings/settings.mjs` has:
```typescript
{
  name: 'multiplayer',
  type: 'go',
  // ... other fields
}
```

Then run `npm run deploy:prepare` to sync changes.

### Multiplayer Health Check Returns 404

**Symptom**: `curl bgs-mp.onrender.com/api/multiplayer/health` → 404

**Root cause**: Go service not running or Nginx routing incorrect
**Solutions**:
1. Check Render logs: `render logs multiplayer` (if separate service)
2. Verify nginx.conf has `/api/multiplayer/` location block
3. Ensure port 5000 is available (not conflicting with Node API on 8787)

### SSE Connection Fails

**Symptom**: Client error: "Failed to establish SSE connection"

**Root cause**: Nginx not forwarding keep-alive headers or firewall issue
**Solutions**:
1. Verify nginx.conf has:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```
2. Check browser console for actual error message
3. Verify `bgs-mp.onrender.com` resolves correctly (DNS)

### Cold Start Timeout

**Symptom**: "Connection timeout after 15000ms"

**Root cause**: Render free tier takes >30 seconds to warm up
**Solutions**:
1. Increase `CONNECTION_TIMEOUT_MS` in config:
   ```typescript
   MULTIPLAYER: {
     CONNECTION_TIMEOUT_MS: 60000  // 60 seconds for cold start
   }
   ```
2. Upgrade to paid tier for faster response
3. Keep service warm by pinging health endpoint every 60 seconds

---

## Performance Notes

### Container Size

- **Node.js**: ~80MB
- **Go binary**: ~3MB
- **Alpine Go**: ~150MB
- **Total image**: ~400MB (acceptable for Render)

### Memory Usage

- **Nginx**: ~5MB
- **Go runtime**: Low overhead (single-threaded model fine for Render free)
- **Total**: ~50-100MB (free tier typically has 512MB available)

### Cold Start Time

- **Render free tier**: 30-60 seconds on first request
- **Paid tier**: <1 second typically
- **Client handles this**: 15s timeout can be increased

---

## Next Steps

1. ✅ **Commit changes**:
   ```bash
   git add src/deployment/settings/settings.mjs nginx.conf
   git commit -m "feat: add multiplayer Go service to Render deployment"
   ```

2. ✅ **Test locally**:
   ```bash
   docker build -t babylon-mp:latest .
   docker run -p 10000:10000 babylon-mp:latest
   ```

3. ✅ **Deploy to Render**:
   - Push to GitHub branch
   - Connect via Render dashboard
   - Monitor build logs

4. ✅ **Verify multiplayer active**:
   ```bash
   curl https://your-service.onrender.com/api/multiplayer/health
   # Expected: {"ok":true,"service":"multiplayer",...}
   ```

---

## References

- [BRANDING.md](BRANDING.md) — PWA, loading screen, and [social link previews](BRANDING.md#social-link-previews) (`static.publicUrl` on `render-deploy`)
- [Render Documentation](https://render.com/docs)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/dockerfile_best-practices/)
- [Nginx Proxy Docs](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Go on Alpine](https://golang.org/dl/#docker)
