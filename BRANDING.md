# Branding and PWA configuration

Single source of truth for the loading screen, favicon, theme colors, and installable PWA manifest:

[`src/client/public/branding/config.json`](src/client/public/branding/config.json)

Fork authors edit this file and the assets under `public/branding/` to rebrand the game and satisfy browser install prompts. PWA service-worker code lives in the Vite build only and does **not** ship inside [`playground.json`](src/client/public/playground.json) — see [Playground isolation](#playground-isolation).

---

## Directory layout

```text
src/client/public/branding/
  config.json           ← loadscreen + PWA manifest metadata
  images/
    Babylon_logo.png    ← loading screen logo
    logo.png            ← favicon
  icons/                ← PWA install icons (192, 512, maskable)
  screenshots/          ← install dialog previews (wide + narrow) + og-card.png
```

Runtime loader: [`src/client/utils/branding_config.ts`](src/client/utils/branding_config.ts) (fetch once, apply loadscreen + `theme-color` meta).

Build-time manifest and social meta: [`vite.config.ts`](vite.config.ts) reads the same JSON via [`src/deployment/branding/load_branding_config.mjs`](src/deployment/branding/load_branding_config.mjs) and injects Open Graph / Twitter tags into `index.html` at build time (required for Discord, Slack, iMessage, and other crawlers that do not run JavaScript).

---

## Config reference

### Top-level (loading screen)

| Field | Type | Description |
| ----- | ---- | ----------- |
| `image` | string | Path to loading-screen logo (under `/branding/images/`) |
| `imageWidth` | number | Logo width in px |
| `imageHeight` | number | Logo height in px |
| `bgColor` | string | Loading screen background (`#rrggbb`) |
| `loadscreenText` | string | First line = title, second line = subtitle (newline-separated) |

### Nested `pwa` block

| Field | Type | Description |
| ----- | ---- | ----------- |
| `enabled` | boolean | Enable service worker + manifest (default `true`) |
| `name` | string | Full app name in manifest (defaults to first line of `loadscreenText`) |
| `shortName` | string | Home-screen label (defaults to truncated `name`) |
| `description` | string | Store-style description |
| `themeColor` | string | Browser chrome / status bar color (defaults to `#1a1a1a` when `bgColor` is white) |
| `backgroundColor` | string | Splash background (same fallback as `themeColor`) |
| `display` | string | Usually `"standalone"` |
| `icons` | object | Paths: `"192"`, `"512"`, `"512Maskable"` |
| `screenshots` | array | Install UI previews — see below |

### Screenshot entries

Each item:

| Field | Example | Notes |
| ----- | ------- | ----- |
| `src` | `/branding/screenshots/desktop-wide.png` | Path under `public/` |
| `sizes` | `1280x720` | Must match actual PNG dimensions |
| `type` | `image/png` | MIME type |
| `formFactor` | `wide` or `narrow` | Both required for rich install UI |
| `label` | `Explore 3D worlds` | Shown in Chromium install dialog |

### Nested `social` block (Open Graph / Twitter Card)

Injected into `dist/index.html` at build time for link previews.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `title` | string | Preview title (defaults to `pwa.name`) |
| `description` | string | Preview description (defaults to `pwa.description`) |
| `siteName` | string | `og:site_name` (defaults to `pwa.name`) |
| `siteUrl` | string | Optional canonical URL when `static.publicUrl` is not set in deployment settings |
| `image` | string | OG image path (defaults to wide screenshot or `/branding/screenshots/og-card.png`) |
| `imageWidth` | number | OG image width (default `1200`) |
| `imageHeight` | number | OG image height (default `630`) |
| `imageType` | string | MIME type (default `image/png`) |
| `twitterCard` | string | Usually `summary_large_image` |

**Absolute URLs:** `og:image` and `og:url` require full HTTPS URLs. Set `static.publicUrl` in [`src/deployment/settings/settings.mjs`](src/deployment/settings/settings.mjs) per deployment host (preserved on deploy branches). Optional `social.siteUrl` in branding is the fallback when settings omit `publicUrl`.

---

## Rebranding walkthrough

1. Replace `public/branding/images/logo.png` and `Babylon_logo.png`.
2. Edit `public/branding/config.json` (title, colors, PWA name, paths).
3. Regenerate PWA icons and screenshots:

   ```sh
   npm run generate:pwa-assets
   ```

4. Build and preview:

   ```sh
   npm run build && npm run preview
   ```

5. Validate full installability:

   ```sh
   npm run pwa:test
   ```

---

## PWA install assets

| Asset | Size | Purpose |
| ----- | ---- | ------- |
| `icon-192.png` | 192×192 | Install icon, apple-touch-icon |
| `icon-512.png` | 512×512 | Install icon |
| `icon-512-maskable.png` | 512×512 (safe zone) | Android adaptive icon |
| `desktop-wide.png` | 1280×720 | Install dialog screenshot (desktop) |
| `mobile-narrow.png` | 390×844 | Install dialog screenshot (mobile) |
| `og-card.png` | 1200×630 | Open Graph / Twitter Card preview image |

`npm run generate:pwa-assets` derives icons from `logo.png`, screenshots and `og-card.png` from [`resources/Babylon_Game_Starter_Banner.jpg`](resources/Babylon_Game_Starter_Banner.jpg).

---

## Runtime behavior

- **Cache strategy:** CacheFirst (local-first) for static assets, branding files, GitHub-hosted models, and Babylon CDN scripts. Configured in [`vite.config.ts`](vite.config.ts).
- **Updates:** When a new build deploys, a versioned service worker waits in the background. **Settings → Update App** applies the update.
- **Purge:** **Settings → Purge Cache** clears all caches, unregisters the service worker, and reloads.
- **Registration:** [`src/client/pwa/pwa_client.ts`](src/client/pwa/pwa_client.ts), wired from [`src/client/main.ts`](src/client/main.ts) only.

### iPad Safari install (Share → Add to Home Screen)

iPadOS Safari does **not** support Chrome’s automatic install prompt. This starter implements the recommended coach pattern:

- **iOS meta tags** — `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-touch-icon` (set in [`branding_config.ts`](src/client/utils/branding_config.ts)).
- **Repeat-visit coach** — After the second visit in Safari on iPad (not already installed), a modal explains: *Tap Share → Add to Home Screen*.
- **Settings → Install App** — On iPad Safari, opens the Share → Add to Home Screen coach modal. On Chromium (desktop/Android), triggers the browser’s native install prompt directly.

Logic lives in [`src/client/utils/pwa_install_coach.ts`](src/client/utils/pwa_install_coach.ts) (playground-safe). Chromium capture is wired from [`src/client/pwa/pwa_install.ts`](src/client/pwa/pwa_install.ts) in `main.ts` only.

### Playground isolation

The Babylon Playground export uses [`src/client/utils/pwa_runtime.ts`](src/client/utils/pwa_runtime.ts) stubs — no `pwa/` imports, no `workbox-window`. [`scripts/check-playground-export.mjs`](scripts/check-playground-export.mjs) fails if bundled code imports `pwa/`. The service worker excludes `playground.json` from precache.

---

## Validation

```sh
npm run social:test
```

Runs `npm run build`, validates Open Graph / Twitter meta tags in static `dist/index.html`, starts `vite preview`, and checks tags with Playwright plus OG image HTTP availability.

```sh
npm run pwa:test
```

Runs `npm run build`, validates `config.json` and `dist/` artifacts, starts `vite preview`, and runs Lighthouse PWA installability audits (`installable-manifest`, `service-worker`, `works-offline`, `maskable-icon`).

---

## Deployment

Branding paths are relative to the Vite `base` URL (same as the rest of the static site). If favicon or loading-screen assets 404 after deploy, verify `static.basePath` in [`src/deployment/settings/settings.mjs`](src/deployment/settings/settings.mjs) matches the live URL. For social previews, also set `static.publicUrl` to the canonical HTTPS origin + path (no trailing slash required).

- [GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md](GITHUB_PAGES_STATIC_SITE_DEPLOYMENT.md)
- [NETLIFY_STATIC_SITE_DEPLOYMENT.md](NETLIFY_STATIC_SITE_DEPLOYMENT.md)
