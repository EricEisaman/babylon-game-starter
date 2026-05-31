# Chat (Chat Slayer integration)

Optional in-game chat powered by [Chat Slayer](../chat-slayer) (sibling repo). When disabled (default), no chat button appears and no network calls are made.

## UI preview (`?chatui=true`)

Debug the chat overlay layout without configuring a service. Append to your dev URL (same truthy values as `?sim=1`: `true`, `1`, `yes`):

`http://localhost:3000/?chatui=true`

- Shows the chat button and panel including **Log in / Register** (same layout as live chat)
- **No** Chat Slayer HTTP requests; auth succeeds locally with mock messages after sign-in
- Send adds **local-only** lines for compose/layout testing
- Switching environments in Settings swaps mock room content (per-environment preview)
- Remove the flag or enable live chat in `chat/config.json` for real connectivity

When `chat/config.json` is fully enabled with a `serviceUrl`, live chat is used and preview mocks are not applied (even if `?chatui=true` is present).

## Enable chat in the game

Edit [`src/client/public/chat/config.json`](src/client/public/chat/config.json):

```json
{
  "enabled": true,
  "serviceUrl": "/chat-api",
  "clientId": "web-demo",
  "roomMode": "per-environment",
  "gameRoomName": "Lobby"
}
```

| Field | Description |
|-------|-------------|
| `enabled` | `true` to show the chat button and connect |
| `serviceUrl` | Chat Slayer base URL (no trailing slash), or `/chat-api` for same-origin proxy on Render |
| `clientId` | Must match an **`id`** field in Chat Slayer `ALLOWED_CLIENTS` (not an arbitrary label) |
| `roomMode` | `per-environment` (default): one room per map in `ASSETS.ENVIRONMENTS`; `game-wide`: single `gameRoomName` |
| `gameRoomName` | Display name for the game-wide room |
| `roomNamePrefix` | Optional prefix for per-environment room names |
| `warmupTimeoutMs` | Max wait for a sleeping Render instance (default `60000`) |
| `warmupRetryIntervalMs` | Delay between warmup retries (default `2000`) |
| `allowRegistration` | `true` (default): show **Register** and allow new accounts. `false`: **login only** |
| `allowedUsers` | When `allowRegistration` is `false`, optional list of usernames (dropdown in chat). Passwords must exist on Chat Slayer (e.g. `BACKEND_INITIAL_USERS`) |
| `tlsPinEnforced` / `expectedTlsFingerprintSha256` | Optional production TLS pin (see Chat Slayer docs) |

### `clientId` and `ALLOWED_CLIENTS`

Chat Slayer validates the `X-Chat-Slayer-Client-Id` request header against the **`id`** values in its `ALLOWED_CLIENTS` env JSON. The game’s `clientId` in `chat/config.json` must match one of those ids exactly.

For the shared `chat-slayer.onrender.com` deployment, use `"clientId": "web-demo"`. That entry allows these **CORS origins** (scheme + host only — **never** a path) for `web-demo`:

- `https://bgs-mp.onrender.com`
- `https://babylon-game-starter.onrender.com`
- `https://babylon-game-starter.netlify.app`
- `https://ericeisaman.github.io` (GitHub Pages project site for this repo)

**Game URL vs CORS origin:** a project site at `https://ericeisaman.github.io/babylon-game-starter/` still sends `Origin: https://ericeisaman.github.io`. Do **not** put the path in `ALLOWED_CLIENTS`.

| Game deploy URL | `serviceUrl` | `clientId` | CORS origin for `ALLOWED_CLIENTS` |
|---|---|---|---|
| `https://bgs-mp.onrender.com` | `/chat-api` | `web-demo` | `https://bgs-mp.onrender.com` |
| `https://babylon-game-starter.netlify.app` | `/chat-api` | `web-demo` | `https://babylon-game-starter.netlify.app` |
| `https://ericeisaman.github.io/babylon-game-starter/` | `/chat-api` (client uses direct Chat Slayer on Pages) | `web-demo` | `https://ericeisaman.github.io` |

The `/chat-api` proxy removes browser CORS errors; it does **not** bypass Chat Slayer’s client-id or origin checks.

### Registration vs preconfigured users

**Open registration (default)** — omit `allowRegistration` or set it to `true`. Players can register and log in.

**Preconfigured users only** — set `allowRegistration` to `false` and list accounts in `allowedUsers`. The game hides Register and only offers login. Seed matching users on Chat Slayer, for example:

```json
{
  "enabled": true,
  "serviceUrl": "/chat-api",
  "clientId": "web-demo",
  "allowRegistration": false,
  "allowedUsers": ["alice", "bob"]
}
```

On Chat Slayer, set `BACKEND_INITIAL_USERS=alice:secret1;bob:secret2` (or create accounts another way). Usernames in `allowedUsers` must match Matrix localparts on the server.

**Login only, any existing server account** — set `"allowRegistration": false` and omit `allowedUsers` (or use an empty array). The username field stays free-text; only the Register button is hidden.

## Allow the game origin on Chat Slayer

When using a **cross-origin** `serviceUrl` (for example `https://chat-slayer.onrender.com` from GitHub Pages or Render), your browser’s **`Origin`** header (not the full page URL) must appear in the **`origins`** array for the same `clientId` in Chat Slayer `ALLOWED_CLIENTS`. See [chat-slayer/CLIENT_GUIDE.md](../chat-slayer/CLIENT_GUIDE.md) and [chat-slayer/RENDER_DEPLOYMENT.md](../chat-slayer/RENDER_DEPLOYMENT.md).

**Render Docker deploy (recommended):** [`chat/config.json`](src/client/public/chat/config.json) uses `"serviceUrl": "/chat-api"`. Nginx proxies `/chat-api/` to Chat Slayer same-origin, so browsers never hit cross-origin CORS. Vite dev proxies `/chat-api` the same way (`vite.config.ts`).

## Production troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `403` + `Unknown or missing client id in x-chat-slayer-client-id` | `clientId` in `chat/config.json` does not match any `id` in Chat Slayer `ALLOWED_CLIENTS` | Set `"clientId": "web-demo"` (or add your id on Chat Slayer). |
| CORS error on `/demo/actions/*` from hosted game | Cross-origin `serviceUrl` without matching `ALLOWED_CLIENTS` entry | Use `"serviceUrl": "/chat-api"` on Render (nginx proxy), **or** add your game origin to the correct `clientId` in `ALLOWED_CLIENTS`. |
| CORS error on `GET /health` during warmup | Chat Slayer build without health CORS | Deploy latest **chat-slayer** (`/health` echoes `Origin`; game warmup uses a simple GET without client header). |
| `403` on `/demo/actions/*` or `/demo/stream` (other messages) | Origin not listed for your `clientId` | Confirm `ALLOWED_CLIENTS` includes your deployed game origin under the same `id` as `clientId`. |
| `400` + `Invalid datastar signals` on `GET /demo/stream` | Stream opened with Bearer auth instead of Datastar query param | Deploy a client that passes `{ "accessToken": "..." }` in the `datastar` query param on `GET /demo/stream`. POST actions use JSON body; only the stream uses the query param. |
| `404` on `/chat-api/*` from Netlify (HTML error in chat status) | Static host has no `/chat-api` proxy | Redeploy **`netlify-deployment`** with updated `netlify.toml` (`/chat-api/*` → Chat Slayer). See [NETLIFY_STATIC_SITE_DEPLOYMENT.md](NETLIFY_STATIC_SITE_DEPLOYMENT.md). |
| Chat blocked from **`*.github.io`** (CORS / “server blocked or unreachable”) | `ALLOWED_CLIENTS` lists the game URL with a path instead of the origin | Add `https://<user>.github.io` (**no path**) to `web-demo.origins` on Chat Slayer. Example: game at `/babylon-game-starter/` → origin is `https://ericeisaman.github.io`. |
| Chat 404 / fails on **GitHub Pages** | Pages cannot proxy `/chat-api` | The client auto-uses `https://chat-slayer.onrender.com` on `*.github.io` when config has `/chat-api`. Add the host-only origin above to `ALLOWED_CLIENTS`. See [GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md](GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md). |

Deploy **chat-slayer** before relying on cross-origin warmup from a hosted game.

## Render free tier (cold start)

On Render’s free tier, Chat Slayer **sleeps when idle**. The first request after sleep can take **30–60 seconds**. The game shows **“Waking chat server…”** and retries until `warmupTimeoutMs` (default one minute). Local `npm run dev` in chat-slayer has no sleep delay.

## Local development

1. In **chat-slayer**: copy `.env.example` to `.env`, ensure `web-demo` in `ALLOWED_CLIENTS` includes `http://localhost:3000` (or run Chat Slayer locally on port 8008).
2. In **babylon-game-starter**: enable `chat/config.json` with `"clientId": "web-demo"` and either:
   - `"serviceUrl": "/chat-api"` — Vite proxies to production Chat Slayer (**requires** `http://localhost:3000` in `web-demo.origins`), **or**
   - `"serviceUrl": "http://localhost:8008"` — direct local Chat Slayer (no origin list change needed).
3. Run the game (`npm run dev`), open chat, register or log in (unless `allowRegistration` is `false`), send messages.

## Room behavior

- **per-environment**: On connect, the client registers all environment display names via `POST /demo/actions/register-rooms`. Switching maps in Settings joins the matching room automatically.
- **game-wide**: One room; environment changes do not switch rooms.

## API surface

The client uses Chat Slayer’s **demo HTTP API** (`/demo/actions/*`, `GET /demo/stream`), not the full Matrix JS SDK. Plaintext messages in v1; `e2eeEnabled` is reserved for a future release.
