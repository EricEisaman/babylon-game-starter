# Multiplayer

> [!NOTE]
> This is the **onboarding + operations** guide: how the multiplayer stack is wired, how to run it, and how to debug it. The **normative wire contract and authority rules** live in [`MULTIPLAYER_SYNCH.md`](MULTIPLAYER_SYNCH.md) — whenever this page and the spec disagree, the spec wins.

## Contents

- [30-second overview](#30-second-overview)
- [Architecture](#architecture)
- [File layout](#file-layout)
- [Configuration](#configuration)
- [Running it locally](#running-it-locally)
- [Running in the Babylon playground](#running-in-the-babylon-playground)
- [Data compression in the stack](#data-compression-in-the-stack)
- [How the client is wired](#how-the-client-is-wired)
- [Receiver rules (mandatory four)](#receiver-rules-mandatory-four)
- [Two-player item-sync flow](#two-player-item-sync-flow)
- [Client render-loop latch](#client-render-loop-latch)
- [Testing with multiple clients](#testing-with-multiple-clients)
- [Troubleshooting](#troubleshooting)
- [References](#references)

## 30-second overview

Babylon Game Starter ships a multiplayer stack built on a small Go server, SSE (`Content-Encoding: br`), and [Datastar](https://github.com/starfederation/datastar-go). Authority is split into three independent tiers, two of which apply to items:

1. **Every client publishes its own character** (position, rotation, animation, boost).
2. **Tier 1 — Base synchronizer** (one client, global). The first connected client publishes lights, sky effects, and environment particles.
3. **Tier 2 — Environment item authority** (one client per environment). The first client into an environment runs dynamic physics for every item in that env that nobody has explicitly claimed. Everyone else runs those bodies as `ANIMATED` (kinematic) and writes remote pose updates directly onto the mesh. Handoff goes in arrival order if the current authority leaves.
4. **Tier 3 — Explicit item owner** (any client, per `instanceId`). Proximity claims let a client override env-authority for one specific item until release.
5. **Server broadcasts** item / character / effect / light / sky updates every 50–100 ms with a **dirty filter** that drops unchanged item rows so bandwidth scales with actual motion.

> [!IMPORTANT]
> The resolved owner of any item row is: **explicit owner if present, else env-authority for the item's environment, else none**. The server's owner-pin invariant means owners should never receive rows for their own items; self-echo defense on the client is defense-in-depth only.

## Architecture

```mermaid
flowchart TD
  subgraph ClientA [Client A]
    A_mp["MultiplayerManager"]
    A_boot["multiplayer_bootstrap"]
    A_sync["sync/ modules<br/>(character, items,<br/>effects, lights, sky)"]
    A_boot --> A_mp
    A_boot --> A_sync
  end

  subgraph ClientB [Client B]
    B_mp["MultiplayerManager"]
    B_boot["multiplayer_bootstrap"]
    B_sync["sync/ modules"]
    B_boot --> B_mp
    B_boot --> B_sync
  end

  subgraph Server [Go server :5000]
    Router["HTTP mux<br/>/api/multiplayer/*"]
    Registry["Client registry<br/>+ itemOwners<br/>+ envAuthority"]
    Filter["Dirty filter<br/>+ freshness matrix"]
    Stream["SSE broadcaster<br/>(Brotli)"]
    Router --> Registry
    Router --> Filter
    Filter --> Stream
  end

  A_mp -- "PATCH /character-state<br/>/item-state<br/>/effects-state<br/>/lights-state<br/>/sky-effects-state" --> Router
  B_mp -- "PATCH ..." --> Router
  Stream -- "SSE signals<br/>character-state-update<br/>item-state-update<br/>item-authority-changed<br/>env-item-authority-changed<br/>synchronizer-changed" --> A_mp
  Stream -- "SSE signals" --> B_mp
```

## File layout

Client-side:

```text
src/client/
  datastar/datastar_client.ts            # SSE wrapper
  managers/multiplayer_manager.ts        # MP session + message bus
  managers/multiplayer_bootstrap.ts      # Wires MP into the scene (entry point)
  managers/remote_peer_proxy.ts          # Remote avatar loading / transform application
  sync/
    item_sync.ts
    configured_items_sync.ts
    environment_physics_sync.ts
    item_authority_tracker.ts
    proximity_claim_observer.ts
    multiplayer_wire_guards.ts
  types/multiplayer.ts
  utils/multiplayer_serialization.ts
```

Server-side:

```text
src/server/multiplayer/
  main.go                 # Entry point, HTTP mux
  handlers.go             # HTTP endpoint handlers
  item_authority.go       # Explicit + env-scope authority registries
  compression.go          # Brotli / gzip SSE middleware
  utils.go                # Helpers
  go.mod
```

The HTTP endpoints are:

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/multiplayer/join` | Join a session; returns client id and initial role |
| `POST` | `/api/multiplayer/leave` | Graceful leave |
| `GET`  | `/api/multiplayer/stream` | Long-lived SSE stream |
| `GET`  | `/api/multiplayer/health` | Health probe |
| `PATCH` | `/api/multiplayer/character-state` | Publish own character state |
| `PATCH` | `/api/multiplayer/item-state` | Publish `ItemInstanceState` rows + collection events |
| `PATCH` | `/api/multiplayer/effects-state` | Base-synchronizer: particle effects |
| `PATCH` | `/api/multiplayer/lights-state` | Base-synchronizer: lights |
| `PATCH` | `/api/multiplayer/sky-effects-state` | Base-synchronizer: sky effects |
| `PATCH` | `/api/multiplayer/item-authority-claim` | Proximity claim |
| `PATCH` | `/api/multiplayer/item-authority-release` | Release claim |
| `PATCH` | `/api/multiplayer/env-switch` | Server-observed env switch |

> [!WARNING]
> The HTTP path for item updates is `PATCH /api/multiplayer/item-state`. `item-state-update` is the **SSE signal name**, not the path. Older docs (now archived) conflated these.

## Configuration

All client-side multiplayer tunables live in [`src/client/config/game_config.ts`](src/client/config/game_config.ts). That file is the single source of truth:

```typescript
MULTIPLAYER: {
  ENABLED: true,
  PRODUCTION_SERVER: 'bgs-mp.onrender.com',
  LOCAL_SERVER: 'localhost:5000',
  CONNECTION_TIMEOUT_MS: 15000,     // Render cold-start tolerance
  PRODUCTION_FIRST: true,

  // Per-item authority tunables (MULTIPLAYER_SYNCH.md §4.7).
  CLAIM_RADIUS_METERS: 2.5,         // Proximity radius that triggers a claim
  CLAIM_GRACE_MS: 1200,             // Keep ownership for N ms after leaving bubble
  CLAIM_IDLE_TIMEOUT_MS: 1500       // Owner idle window before another client can claim
}
```

Forks can point the client at their own Go server without editing this block by setting `VITE_MULTIPLAYER_HOST` in `.env` / `.env.local` (see `.env.example`). To disable multiplayer entirely, set `ENABLED: false`.

The server reads these environment variables:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `5000` | Listen port |
| `MULTIPLAYER_SSE_COMPRESSION` | `brotli` | `brotli`, `gzip`, or `off` (last resort for proxy debugging) |
| `MULTIPLAYER_CORS_ALLOW_ORIGIN` | *(unset)* | Pin `Access-Control-Allow-Origin` to a single origin (e.g. `https://mygame.pages.dev`). When unset the server **echoes the request `Origin`**, which lets students hit the API from `https://playground.babylonjs.com` and from forks deployed anywhere. Pin it only if you specifically need to lock browsers out; the default already covers cross-origin playground use. |

## Running it locally

The simplest fullstack loop:

```bash
npm run dev:fullstack
```

This runs Vite and the Go server together. Go restarts automatically on changes under `src/server/multiplayer/**` (see `nodemon.multiplayer.json`). Alternatively run them in two terminals:

```bash
# Terminal 1 — Go multiplayer server on :5000
npm run dev:multiplayer

# Terminal 2 — Vite dev server on :3000
npm run dev
```

With `VITE_MULTIPLAYER_HOST` unset, the client talks to the server through Vite's proxy (same-origin `/api/multiplayer/*`) — see [`vite.config.ts`](vite.config.ts).

## Running in the Babylon playground

The exported `playground.json` is a self-contained copy of the client that students can paste into <https://playground.babylonjs.com/> and run — including the multiplayer stack. This is the fastest on-ramp for a classroom: no `npm install`, no local server, no build step.

> [!TIP]
> When in doubt, re-run `npm run export:playground` on the host repo before distributing. That script regenerates the snippet **and** runs [`scripts/check-playground-export.mjs`](scripts/check-playground-export.mjs), which walks every relative import and fails if the manifest is missing a file.

> [!NOTE]
> If you're **editing** code that ships to the playground (as opposed to running the snippet), read [`PLAYGROUND.md`](PLAYGROUND.md) first. It documents the two non-obvious constraints the Babylon playground imposes on bundled TypeScript — the ambient `BABYLON` global (never `import * as BABYLON from '@babylonjs/core'` in bundled files) and the static-imports-only rule — both of which the export smoke checker enforces.

### Step-by-step (student-facing)

1. Export the snippet from this repo: `npm run export:playground`.
2. Open the copy at `src/client/public/playground.json` (or the twin at `src/client/playground/playground.json`) and copy its entire contents.
3. Open <https://playground.babylonjs.com/> in a modern desktop browser.
4. In the playground's top bar, use **Scene → Load** (or paste directly into the editor via **Scene → Paste** — UI labels occasionally change; any "load JSON" path works). Paste the file contents.
5. In the top-right plugin menu, toggle on **Add WASM plugin → Havok**. This is required — `index.ts` assumes `HavokPhysics` has already been registered by the host, which is how `main.ts` handles it under Vite and how the playground toggle handles it here. Without this, physics bodies fail to construct and the scene will error out early.
6. Click **Run**. The default behavior connects to the shared classroom server at `bgs-mp.onrender.com` (see `CONFIG.MULTIPLAYER.PRODUCTION_SERVER`).

### Cold-start caveat

The shared default runs on Render's free tier, which sleeps after ~15 minutes of idle. A cold first connection can take 10–30 seconds. The client raises a `multiplayer-warming-up` custom event on `window` after 5 s of waiting so the UI can show a friendly hint, and `CONFIG.MULTIPLAYER.CONNECTION_TIMEOUT_MS` is set to 30 s to cover all observed cold starts. Students should expect a brief pause the first time the class wakes the server each day.

### Pointing the class at an instructor-hosted server

Two zero-code routes to override the default host, in priority order:

1. **URL query override.** Append `?mp=host[:port]` or `#mp=host[:port]` to the playground URL. Example:

   ```text
   https://playground.babylonjs.com/#mp=your-server.example.com
   ```

   `datastar_client.ts` reads the override first, normalizes off the scheme (it is assumed to match the playground's scheme — HTTPS in practice), runs a health probe, and only connects if the probe succeeds. If the probe fails a clear error is surfaced in the console; the client does **not** silently fall back to the shared default, because in a classroom that would mean a misconfigured class silently lands on the wrong server.
2. **Edit the constant.** Before running `npm run export:playground`, edit `CONFIG.MULTIPLAYER.PRODUCTION_SERVER` in [`src/client/config/game_config.ts`](src/client/config/game_config.ts). Use this for a permanent class deployment.

> [!IMPORTANT]
> An instructor-hosted server must accept cross-origin requests from `https://playground.babylonjs.com`. The default `MULTIPLAYER_CORS_ALLOW_ORIGIN` behavior (echoes the request `Origin`) already does this. If you pin the variable, **include** `https://playground.babylonjs.com` in your allowed origins, or students will see `CORS blocked` in the browser console and no data will flow. See also [`src/server/multiplayer/cors.go`](src/server/multiplayer/cors.go).

### Verification checklist

Use this as a classroom-ready smoke test right after pasting:

- [ ] Page loads and Havok is active (no `HavokPhysics is not defined` in console).
- [ ] Console has no `No audio engine` (AudioV2 uses explicit engine imports in bundled code; see [`PLAYGROUND.md`](PLAYGROUND.md)).
- [ ] Particle effects load without `Unable to load the snippet` 404s (catalog `snippetId` values in [`game_config.ts`](src/client/config/game_config.ts) must be real Babylon snippet ids).
- [ ] Browser console shows `[Datastar] Checking server at <host>...` and, within a few seconds or up to ~30 s on a cold start, `[Datastar] ✓ Server available at <host>`.
- [ ] If a cold start is in progress, console shows the warming-up notice.
- [ ] `GET /api/multiplayer/stream` in the Network tab has `Content-Encoding: br` (or `gzip`) and no `Content-Length`.
- [ ] Open a second playground tab in the same env; each tab sees the other's character move. Both tabs converge on the same inventory / scoreboard state.

> [!NOTE]
> The shared default server is best-effort. It is adequate for classroom demos but is **not** suitable for graded assessments or large cohorts. For either of those, stand up a per-class server (see [`RENDER_DEPLOYMENT.md`](RENDER_DEPLOYMENT.md)) and use the `?mp=` override.

## Data compression in the stack

Students frequently ask "why is this fast when multiplayer games are supposed to be hard?" The honest answer is that several independent layers of data reduction stack multiplicatively. Each layer has a cost/benefit crossover point worth understanding, because the right answer changes if your game ships 30 items per tick versus 3000.

### Where compression happens

```mermaid
flowchart LR
  owner["Owner client<br/>mesh pose"] --> poseCompress["(1) Pose-only<br/>wire shape"]
  poseCompress --> patch["HTTP PATCH<br/>/item-state"]
  patch --> dirtyFilter["(2) Server<br/>dirty filter"]
  dirtyFilter --> broadcast["SSE broadcast"]
  broadcast --> brotli["(3) Brotli / gzip<br/>content encoding"]
  brotli --> receiver["Receiver client<br/>decoded stream"]
```

#### 1. Pose-only wire shape (Invariant P)

Every item row carries `{ pos: [3 floats], rot: [4 floats] }` — 7 numbers — rather than a full 4×4 world matrix (16 numbers). The 4×4 matrix was the earlier design; the rationale for the switch is documented exhaustively in [`MULTIPLAYER_SYNCH.md §B.11`](MULTIPLAYER_SYNCH.md#b11-why-the-wire-ships-pos--rot-and-not-a-world-matrix).

- **Ratio**: ~16:7, i.e. **~2.3×** smaller per row (a ~55 % drop). Payload shape is JSON so the actual byte shrink is a little smaller than the float count suggests — roughly 180 B matrix rows become roughly 80 B pose rows after JSON escaping.
- **Cost**: zero extra CPU on both ends — the owner was already computing its mesh pose; the receiver was going to write it onto a mesh regardless.
- **Crossover**: always on. There is no scenario where a full matrix wins — it loses to scale-decomposition bugs *and* to bandwidth.

#### 2. Server-side dirty filter (`isDirtyRow`)

Every incoming row is compared against a cached copy of the previous broadcast (`itemTransformCache`); rows whose position moved less than `posEpsilon` **and** whose rotation quaternion moved less than a quaternion-dot tolerance are dropped before fan-out. See [`src/server/multiplayer/handlers.go`](src/server/multiplayer/handlers.go) `isDirtyRow` and [`MULTIPLAYER_SYNCH.md §5.2.1`](MULTIPLAYER_SYNCH.md#521-global-dirty-filter-server-side-transform-cache).

- **Ratio**: entirely scene-dependent. When every item is asleep, **every** row is dropped — so bandwidth per unmoved item is essentially zero. During active play in a typical scene most items are stationary at any given tick, so observed ratios sit around **5–20×** reduction in broadcast volume versus a naive "echo every row" server.
- **Cost**: one `sqrt` of a squared-distance (or two vector subtracts + one dot product) per accepted row. Measured on a mid-range laptop at ~0.2 µs per row; fully negligible next to JSON serialization.
- **Crossover**: always on. The only way this loses is if every single item moves every single tick, in which case it is a net no-op (cost = 0 rows saved × ~0 µs), never a loss.

#### 3. HTTP content encoding (Brotli, gzip, or off)

SSE responses on `/api/multiplayer/stream` pass through [`src/server/multiplayer/compression.go`](src/server/multiplayer/compression.go). Controlled by `MULTIPLAYER_SSE_COMPRESSION` (default `brotli`, with `gzip` fallback for clients that don't advertise `br`). Brotli runs at **quality 4** with **LGWin 18** (256 KiB window), tuned so the encoder flushes promptly after every event rather than buffering several events together — flush preservation is the part that makes this safe for SSE.

- **Ratio on our payloads**: SSE event streams are *extremely* compressible — the event names (`character-state-update`, `item-state-update`, `item-authority-changed`, …) and JSON field names repeat on every event, which is exactly what Brotli's static dictionary and sliding window exploit.
  - **Brotli q4** on our traffic: typically **6–12×** smaller. Small payloads (single-character update) see the low end; busy ticks with many items and repeated field names push toward the high end.
  - **gzip level 4** on the same traffic: typically **3–5×**.
  - Rule of thumb: Brotli roughly doubles the compression ratio of gzip on JSON-ish SSE, for almost the same CPU budget at low qualities.
- **Cost** (the interesting one):
  - **Encoder** (server, per event): q4 costs roughly **0.2–0.5 ms of CPU per KB** of input. Decoding in the browser is **~5–10× faster** than encoding, i.e. sub-100 µs per event for anything we broadcast.
  - **Memory**: LGWin 18 = 256 KiB per open SSE stream. For a classroom of 30 concurrent students that is ~8 MiB resident on the server. Fine on Render's free tier (512 MiB).
  - **Latency**: the flush-preservation setup adds at most one additional `Flush()` per event (low microseconds). It does **not** batch events together — that was the main thing we had to prove before turning it on.
- **Crossover** (when is Brotli not worth it?):
  - **Payload size**: the middleware uses `MinSize = 256` bytes, so individual PATCH ACKs and tiny `character-state` rows are sent uncompressed. Below ~200 bytes the Brotli frame overhead eats most of the savings.
  - **CPU-bound server**: if you ever see `br` encoding dominate the server flamegraph (unlikely at a classroom scale, possible at thousands of concurrent clients), step down to `MULTIPLAYER_SSE_COMPRESSION=gzip`. You trade ~2× worse ratio for roughly half the encoder CPU.
  - **Bad proxy**: some intermediate proxies (older nginx configurations, some corporate proxies) buffer the response body before forwarding, which makes compression invisible and hurts per-event latency. The escape hatch is `MULTIPLAYER_SSE_COMPRESSION=off`; see the troubleshooting entry for *SSE events arrive in bursts every few seconds*.

### Stacking: what students see on the wire

Multiply the three layers through a realistic example. Suppose your scene has 50 dynamic items, each publishing a 10 Hz update, across 4 clients:

- **Naive**: 50 items × 10 Hz × 180 B × 4 recipients × 2 directions ≈ **720 KB/s** aggregate.
- **Pose-only** (×0.44): ≈ 320 KB/s.
- **Plus dirty filter** (×0.1 in a mostly-idle scene, ×0.3 in a busy one): **32–100 KB/s**.
- **Plus Brotli q4** (×0.12): **4–12 KB/s**.

That is a **~60–180× reduction** over the naive baseline from three independent, orthogonal layers — each of which is also cheap. The teachable insight for students is that you do not need any one clever trick; you need several modest ones that compose.

## How the client is wired

Integration is centralized in [`src/client/managers/multiplayer_bootstrap.ts`](src/client/managers/multiplayer_bootstrap.ts). It is called from the top-level entry point and handles:

- `MultiplayerManager.join` / `leave` and SSE subscription.
- Character sampling + publishing each frame.
- Environment-physics and configured-item sampling / publishing gated by `ItemAuthorityTracker.isOwnedBySelf`.
- Incoming `item-state-update` dispatch: `collections[]` first, then `updates[]` routed to `applyRemoteConfiguredItemState` / `applyRemoteEnvironmentPhysicsItemState`.
- `item-authority-changed` / `env-item-authority-changed` / `synchronizer-changed` handling, including motion-type flips via `CollectiblesManager.setItemKinematic`.
- Scene/env-switch lifecycle: holding items `ANIMATED`, retaining `knownItemStates`, replaying on env load.

You do not need to wire multiplayer into `SceneManager` directly. The `multiplayer_bootstrap` module is the single seam; extending multiplayer usually means either adding a new `sync/` module, adding a listener inside the bootstrap, or extending an existing sync module's `sampleState` / `applyRemoteState` pair.

## Receiver rules (mandatory four)

Every client MUST implement these four rules when consuming `item-state-update`:

| # | Rule | Why |
|---|------|-----|
| 1 | **Self-owner drop.** If `authorityTracker.isOwnedBySelf(row.instanceId)` returns `true`, skip the row. | Defense-in-depth for the server's owner-pin invariant. Under a conforming server you should never receive self-owned rows; reconnect races can deliver them. Applying them corrupts the local simulation ("cake hovering / oscillating"). |
| 2 | **Non-owner kinematic apply (pose-direct write).** For non-self rows keep the body in `PhysicsMotionType.ANIMATED`. The wire carries exactly `pos` (3 floats, world position) and `rot` (4 floats, unit quaternion `[x,y,z,w]`) per Invariant P. Call `applyPoseToMesh(mesh, { pos, rot })` which writes `mesh.position.set(...)` and `mesh.rotationQuaternion.set(...)` verbatim; Havok's pre-step (default `disablePreStep = false`) copies mesh → body on the next tick. Never call `setTargetTransform`, `setLinearVelocity`, `applyImpulse`, or `addForce` on a non-owned body. Never touch `mesh.scaling` (static per-client config value). Never read/write `mesh.rotation.x/y/z` (Euler) — Invariant E. | The resolved owner's physics is authoritative. Pose-on-the-wire sidesteps the negative-scale decomposition trap that broke Present rotations historically. |
| 3 | **Collection hide, always — with feedback parity.** Process every `collections[]` entry by hiding/despawning locally, independent of `updates[]`. When the local representation is still present, play the same particle burst and spatialized sound as the local-collect path (anchored at the mesh's last world position). Never credit currency, mutate inventory, or emit scoring side-effects for a remote collection — those are the collector's. Idempotent: repeated collections MUST NOT error. | Server delivers collection events regardless of freshness state. Fixes "P2 does not see collectibles disappear" and "observer hears nothing when a peer collects." |
| 4 | **Unseeded-env hold (ANIMATED-default-then-promote).** On env entry, hold every item `ANIMATED` and wait for both the bootstrap `item-state-update` and the authority snapshot to arrive and be applied. Only then resume local physics. Promote to `DYNAMIC` **only** when an explicit authority signal names self as resolved owner (`item-authority-changed`, `env-item-authority-changed`, or the SSE-open authority snapshot). Treat "no confirmed authority yet" as "I am a non-owner." | Fixes "items whizzing in a blur on P2" and "cake runs DYNAMIC on both clients, no transforms propagate." Two clients both optimistically self-claiming drive each other's receivers into self-echo drops. |

> [!TIP]
> See [`MULTIPLAYER_SYNCH.md §5.2.2`](MULTIPLAYER_SYNCH.md#522-per-client-freshness-matrix) for the server-side freshness matrix that makes rule 1 defense-in-depth rather than primary defense.

## Two-player item-sync flow

```mermaid
flowchart LR
  subgraph P1 [P1 env-authority]
    P1_spawn["Item spawns<br/>DYNAMIC body"]
    P1_settle["Physics settles"]
    P1_sample["sampleMeshPose<br/>{pos, rot}"]
    P1_patch["PATCH item-state"]
  end

  subgraph Srv [Server]
    Srv_dirty["Dirty filter<br/>posEpsilon=5e-3<br/>rotDot=0.99996"]
    Srv_cache["itemTransformCache"]
    Srv_fan["Per-client fan-out<br/>via freshness matrix"]
    Srv_boot["Bootstrap on<br/>SSE open / env enter"]
  end

  subgraph P2 [P2 late joiner]
    P2_join["POST /join"]
    P2_sse["GET /stream"]
    P2_auth["env-item-authority-changed<br/>P1 is owner"]
    P2_snap["item-state-update<br/>bootstrap"]
    P2_seed["seedMotionTypesForEnv<br/>all ANIMATED"]
    P2_apply["applyPoseToMesh<br/>per item"]
    P2_live["Live updates<br/>applyPoseToMesh"]
  end

  P1_spawn --> P1_settle --> P1_sample --> P1_patch
  P1_patch --> Srv_dirty --> Srv_cache --> Srv_fan

  P2_join --> P2_sse --> Srv_boot
  Srv_boot -- "1 auth" --> P2_auth
  Srv_boot -- "2 items" --> P2_snap
  P2_auth --> P2_seed
  P2_snap --> P2_apply
  P2_seed --> P2_apply
  Srv_fan -- "live" --> P2_live
```

## Client render-loop latch

The bootstrap holds two latched booleans; both must be `true` before item state is applied to physics bodies:

```mermaid
stateDiagram-v2
  direction LR
  [*] --> WaitBoth : Join or env load start

  WaitBoth --> GotSnapshot : SSE item-state-update arrives
  WaitBoth --> GotEnvReady : isEnvironmentLoaded true

  GotSnapshot --> BothReady : isEnvironmentLoaded true
  GotEnvReady --> BothReady : knownItemStates has rows

  BothReady --> Applied : seedMotionTypesForEnv then applyItemSnapshot

  Applied --> Applied : new SSE update then applyItemSnapshot
```

## Testing with multiple clients

Run the dev server and open two browser tabs. Both talk to the same Go server on `:5000`:

```bash
# One terminal
npm run dev:fullstack

# Open two tabs at http://localhost:3000
```

Quick sanity checklist:

- [ ] Both tabs show "Connected to multiplayer"; first shows `(Sync)`, second `(Client)`.
- [ ] Character movement from one tab appears on the other.
- [ ] Items collected on one tab vanish on the other within one broadcast window.
- [ ] Disconnect the first tab — the second is promoted to base synchronizer (`synchronizer-changed`).
- [ ] Claim an item on tab A (walk up to it); tab B sees `item-authority-changed` and its body flips to `ANIMATED`.
- [ ] Env-authority handoff: tab A joins RV Life alone and sees the cake settle on the floor; tab B joins later and sees the cake in its final resting position (freshness AOI bootstrap), not bouncing.

## Troubleshooting

### SSE connection fails with 404

```text
Error: PATCH /api/multiplayer/character-state failed: 404
```

Backend isn't running. Start it:

```bash
npm run dev:multiplayer
```

### Characters move locally but not on other clients

- Check `mp.isMultiplayerActive()` and that you are seeing `character-state-update` events in the SSE stream.
- Confirm `applyRemotePeerState()` in `src/client/managers/remote_peer_proxy.ts` is reached for the remote client id.
- Throttle may be too aggressive for the movement scale; temporarily inspect `SYNC_INTERVAL_MS` in `src/client/managers/multiplayer_bootstrap.ts`.

### Item stays DYNAMIC on non-owner

Symptom: the cake (or any non-collectible physics item) runs local physics on both clients; each client's SSE stream shows it is not receiving rows for this `instanceId` (owner-pin drops them as self-echoes on both sides).

- Confirm `ItemAuthorityTracker.isOwnedBySelf(instanceId)` returns `false` by default — for any item the tracker has not seen an explicit authority assignment for. See [`MULTIPLAYER_SYNCH.md §4.8`](MULTIPLAYER_SYNCH.md#48-environment-item-authority-lifecycle) *No-authority-means-non-owner*.
- Verify `seedMotionTypesForEnv(envName)` runs on three triggers: (a) `item-authority-changed` for items in that env, (b) `env-item-authority-changed` for that env, (c) authority-snapshot application on SSE open.
- Confirm the server's authority snapshot pushed on SSE open includes **both** `envAuthority` and `itemOwners` for every active env.
- Confirm the client `includeRow` publish guard refuses to publish for an env whose authority snapshot has not been absorbed yet.

### Observer does not see collection burst

Symptom: P1 collects a present; on P1 there is a particle burst and a pop sound; on P2 the present simply disappears silently.

- Verify the `item-state-update` handler routes each `collections[]` entry through `applyRemoteCollectedWithFeedback(instanceId)`, not through the silent `applyRemoteCollected(instanceId)` path. See [`MULTIPLAYER_SYNCH.md §6.2`](MULTIPLAYER_SYNCH.md#62-item-state-update) rule 1 *Remote-collect feedback parity*.
- Capture the mesh world position **before** disabling / disposing. Reading `getAbsolutePosition()` after cleanup returns zero and anchors the VFX off-screen.
- Ensure the `isCollected: true` branch on `updates[]` stays silent (no VFX) — feedback is `collections[]`-only, or you get two bursts.
- Collection sound should be spatialized (`spatialSound = true`, emitter attached to the mesh or a transient node at the stored position).

### Non-owner bodies stay at spawn / items whiz in a blur

Symptom: P2 joins an env after P1 has it settled; items appear to spin, jitter, or fly around for ~1 second before snapping into place.

- P2's local physics loop is ticking before the bootstrap `item-state-update` has been applied. Confirm the env-physics loop is paused and every env item held `ANIMATED` until the first snapshot for this env is applied.
- The server should emit a bootstrap per-recipient `item-state-update` on AOI enter. Under the freshness matrix that burst arrives in the first broadcast window after `onEnvEnter`; if it does not, check that `onEnvEnter` was called for P2 when P2 joined the env.

### Cake hovers / oscillates for the owner (self-echo loop)

Symptom: P1 is the only client in an env; the cake hovers and oscillates; presents fall noticeably slower than gravity would predict.

- Capture the SSE stream for P1 and grep for any `item-state-update` row whose `instanceId` P1 resolves as self-owned. The count MUST be zero. Non-zero means the **owner-pin invariant** is not being enforced and the server is echoing rows back; P1 applies them via the non-owner path and fights its own dynamic body.
- As an interim mitigation, verify the client-side defense-in-depth drop in the `updates[]` handler: `if (authorityTracker.isOwnedBySelf(row.instanceId)) continue;`.
- Permanent fix: the server's fan-out producer must build per-recipient payloads filtered by the freshness matrix.

### Present rotations disagree between clients

Symptom: Presents appear face-forward on P1 and face-away (180° mismatch) on P2. Cake looks correct.

- Confirm the wire payload carries `pos: [3]` AND `rot: [4]` and does NOT carry `matrix`, `rotation` (Euler), `velocity`, or `scale` (Invariant P).
- Confirm `ItemSync.applyRemoteItemState` writes `mesh.position` / `mesh.rotationQuaternion` via `applyPoseToMesh` and does NOT call `body.setTargetTransform`.
- Confirm no code path writes `mesh.rotation.x/y/z` (Euler) on a replicated item mesh (Invariant E). Legacy spin-in-place animations on collectibles must be quaternion-based and gated to massless items.

### SSE events arrive in bursts every few seconds

Symptom: character or item updates arrive in bursts rather than continuously; authority signals lag.

- Inspect response headers on `GET /api/multiplayer/stream`: expect `Content-Encoding: br` (or `gzip`) and no `Content-Length`. A `Content-Length` header means the proxy is buffering the whole response.
- If a proxy sits between server and browser (nginx, Traefik, Cloudflare, etc.), confirm it forwards `Content-Encoding` unchanged and does not buffer chunks (nginx: `proxy_buffering off;` on that location; do not set `gzip on;` at that level).
- Last-resort mitigation: start the server with `MULTIPLAYER_SSE_COMPRESSION=off`. See [`MULTIPLAYER_SYNCH.md §9.1`](MULTIPLAYER_SYNCH.md#91-sse-transport-compression-non-normative) for the full invariants.

### Orphan items after env-authority leaves

Symptom: P1 (env-authority) leaves the env; P2 (no prior claim) is still present. Items stop moving or clients disagree about who should publish rows.

- Confirm the server emitted `env-item-authority-changed(newAuthorityId = P2, reason = "failover" | "env_switch" | "disconnect")`.
- On P2: after receiving the signal, every item whose resolved owner is now P2 must flip from `ANIMATED` to `DYNAMIC` and P2 must begin publishing rows within one send-tick.
- Server-side: confirm `markTerminalNextRow` was called so the next row from P2 is unconditionally dirty and projected via the freshness matrix.

## References

- [`MULTIPLAYER_SYNCH.md`](MULTIPLAYER_SYNCH.md) — normative spec (wire contract, authority rules, freshness matrix, appendices)
- [`SERIALIZATION_GUIDE.md`](SERIALIZATION_GUIDE.md) — character / item serialization helpers
- [Datastar Go SDK](https://github.com/starfederation/datastar-go)
- [Babylon.js v9 documentation](https://doc.babylonjs.com/)
- [Havok physics integration](https://www.babylonjs-playground.com/?version=9#NBVTQG)
