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
  "serviceUrl": "https://your-chat-slayer.onrender.com",
  "clientId": "babylon-game",
  "roomMode": "per-environment",
  "gameRoomName": "Lobby"
}
```

| Field | Description |
|-------|-------------|
| `enabled` | `true` to show the chat button and connect |
| `serviceUrl` | Chat Slayer base URL (no trailing slash) |
| `clientId` | Must match an entry in Chat Slayer `ALLOWED_CLIENTS` |
| `roomMode` | `per-environment` (default): one room per map in `ASSETS.ENVIRONMENTS`; `game-wide`: single `gameRoomName` |
| `gameRoomName` | Display name for the game-wide room |
| `roomNamePrefix` | Optional prefix for per-environment room names |
| `warmupTimeoutMs` | Max wait for a sleeping Render instance (default `60000`) |
| `warmupRetryIntervalMs` | Delay between warmup retries (default `2000`) |
| `allowRegistration` | `true` (default): show **Register** and allow new accounts. `false`: **login only** |
| `allowedUsers` | When `allowRegistration` is `false`, optional list of usernames (dropdown in chat). Passwords must exist on Chat Slayer (e.g. `BACKEND_INITIAL_USERS`) |
| `tlsPinEnforced` / `expectedTlsFingerprintSha256` | Optional production TLS pin (see Chat Slayer docs) |

### Registration vs preconfigured users

**Open registration (default)** — omit `allowRegistration` or set it to `true`. Players can register and log in.

**Preconfigured users only** — set `allowRegistration` to `false` and list accounts in `allowedUsers`. The game hides Register and only offers login. Seed matching users on Chat Slayer, for example:

```json
{
  "enabled": true,
  "serviceUrl": "https://your-chat-slayer.onrender.com",
  "clientId": "babylon-game",
  "allowRegistration": false,
  "allowedUsers": ["alice", "bob"]
}
```

On Chat Slayer, set `BACKEND_INITIAL_USERS=alice:secret1;bob:secret2` (or create accounts another way). Usernames in `allowedUsers` must match Matrix localparts on the server.

**Login only, any existing server account** — set `"allowRegistration": false` and omit `allowedUsers` (or use an empty array). The username field stays free-text; only the Register button is hidden.

## Allow the game origin on Chat Slayer

Browser requests require CORS. Add your **deployed game origin(s)** to Chat Slayer `ALLOWED_CLIENTS` for the same `clientId`, for example:

- `http://localhost:5173` (Vite dev)
- `https://<user>.github.io` or your custom domain

See [chat-slayer/CLIENT_GUIDE.md](../chat-slayer/CLIENT_GUIDE.md) and [chat-slayer/RENDER_DEPLOYMENT.md](../chat-slayer/RENDER_DEPLOYMENT.md).

Example Dashboard entry:

```json
{
  "id": "babylon-game",
  "label": "Babylon Game Starter",
  "origins": ["http://localhost:5173", "https://your-game.example.com"],
  "allowWithoutOrigin": false
}
```

## Render free tier (cold start)

On Render’s free tier, Chat Slayer **sleeps when idle**. The first request after sleep can take **30–60 seconds**. The game shows **“Waking chat server…”** and retries until `warmupTimeoutMs` (default one minute). Local `npm run dev` in chat-slayer has no sleep delay.

## Local development

1. In **chat-slayer**: copy `.env.example` to `.env`, add `babylon-game` to `ALLOWED_CLIENTS` with `http://localhost:5173`, run `npm run dev` (default `http://localhost:8008`).
2. In **babylon-game-starter**: enable `chat/config.json` with `"serviceUrl": "http://localhost:8008"`.
3. Run the game (`npm run dev`), open chat, register or log in (unless `allowRegistration` is `false`), send messages.

## Room behavior

- **per-environment**: On connect, the client registers all environment display names via `POST /demo/actions/register-rooms`. Switching maps in Settings joins the matching room automatically.
- **game-wide**: One room; environment changes do not switch rooms.

## API surface

The client uses Chat Slayer’s **demo HTTP API** (`/demo/actions/*`, `GET /demo/stream`), not the full Matrix JS SDK. Plaintext messages in v1; `e2eeEnabled` is reserved for a future release.
