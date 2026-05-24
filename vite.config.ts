import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import {
  buildWebManifest,
  loadBrandingConfigJson,
  resolveBrandingConfig
} from './src/deployment/branding/load_branding_config.mjs';
import deploymentSettings from './src/deployment/settings/settings';

import type { EndpointService } from './src/deployment/types/settings';

// Use fileURLToPath so spaces in the repo path (e.g. "SIGMA PRODUCTIONS") are
// decoded. URL.pathname keeps "%20", which points at a different directory than
// the real workspace and breaks the HTML entry / dev server.
const clientRoot = fileURLToPath(new URL('./src/client/', import.meta.url));
const distOutDir = fileURLToPath(new URL('./dist/', import.meta.url));

const isStaticGithub =
  deploymentSettings.host === 'github.io' && deploymentSettings.type === 'static';

const base = isStaticGithub ? (deploymentSettings.static?.basePath ?? '/') : '/';

const brandingResolved = resolveBrandingConfig(loadBrandingConfigJson());
const webManifest = buildWebManifest(brandingResolved, base);

// Longer prefixes must win: `/api` matches `/api/multiplayer/*` if registered first,
// sending multiplayer traffic to the wrong backend (Node :8787 vs Go :5000).
const proxiedServices = deploymentSettings.services
  .filter((service: EndpointService) => typeof service.localPort === 'number')
  .slice()
  .sort((a, b) => b.routePrefix.length - a.routePrefix.length);

const serviceProxy = Object.fromEntries(
  proxiedServices.map((service: EndpointService) => [
    service.routePrefix,
    {
      target: `http://127.0.0.1:${service.localPort}`,
      changeOrigin: true
    }
  ])
) as Record<
  string,
  { target: string; changeOrigin: boolean; timeout?: number; proxyTimeout?: number }
>;

// Long-lived SSE streams must not inherit http-proxy default timeouts (can drop ~10s in dev).
const multiplayerPrefix = proxiedServices.find((s) => s.name === 'multiplayer')?.routePrefix;
if (multiplayerPrefix && serviceProxy[multiplayerPrefix]) {
  serviceProxy[multiplayerPrefix] = {
    ...serviceProxy[multiplayerPrefix],
    timeout: 0,
    proxyTimeout: 0
  };
}

const cacheFirstRuntime = [
  {
    urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
      sameOrigin &&
      (request.destination === 'image' ||
        request.destination === 'font' ||
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.url.includes('/branding/')),
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'local-assets',
      expiration: {
        maxEntries: 256,
        maxAgeSeconds: 60 * 60 * 24 * 30
      }
    }
  },
  {
    urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*/i,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'game-models',
      expiration: {
        maxEntries: 128,
        maxAgeSeconds: 60 * 60 * 24 * 30
      },
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  },
  {
    urlPattern: /^https:\/\/cdn\.babylonjs\.com\/.*/i,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'babylon-cdn',
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 30
      },
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  }
];

export default defineConfig({
  root: clientRoot,
  base,
  server: {
    port: 3000,
    open: false,
    host: '0.0.0.0',
    strictPort: false,
    proxy: serviceProxy
  },
  build: {
    target: 'ES2020',
    outDir: distOutDir,
    sourcemap: true,
    emptyOutDir: true
  },
  plugins: [
    ...(brandingResolved.pwa.enabled
      ? [
          VitePWA({
            registerType: 'prompt',
            injectRegister: false,
            includeAssets: ['branding/**/*'],
            manifest: webManifest,
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,json}'],
              globIgnores: ['**/playground.json', '**/playground/**'],
              navigateFallback: 'index.html',
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              runtimeCaching: cacheFirstRuntime
            },
            devOptions: {
              enabled: true,
              type: 'module'
            }
          })
        ]
      : [])
  ]
});
