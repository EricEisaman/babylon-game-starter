/**
 * Build-time reader for public/branding/config.json.
 * Used by vite.config.ts and scripts/check-pwa.mjs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const DEFAULT_BRANDING = {
  image: '/branding/images/Babylon_logo.png',
  imageWidth: 256,
  imageHeight: 256,
  bgColor: '#ffffff',
  loadscreenText: 'Babylon Game Starter\nLoading your game ...'
};

/**
 * @param {string} [repoRootOverride]
 * @returns {import('../../client/types/branding').BrandingConfig & Record<string, unknown>}
 */
export function loadBrandingConfigJson(repoRootOverride = repoRoot) {
  const configPath = path.join(repoRootOverride, 'src', 'client', 'public', 'branding', 'config.json');
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * @param {import('../../client/types/branding').BrandingConfig} config
 * @returns {import('../../client/types/branding').ResolvedBrandingConfig}
 */
export function resolveBrandingConfig(config) {
  const merged = { ...DEFAULT_BRANDING, ...config };
  const [title = 'Babylon Game Starter', subtitle = 'Loading your game ...'] = (
    merged.loadscreenText ?? DEFAULT_BRANDING.loadscreenText
  ).split(/\r?\n/, 2);

  const pwaRaw = merged.pwa ?? {};
  const themeFallback = merged.bgColor === '#ffffff' ? '#1a1a1a' : merged.bgColor;

  const pwa = {
    enabled: pwaRaw.enabled !== false,
    name: pwaRaw.name ?? title,
    shortName: pwaRaw.shortName ?? title.slice(0, 12),
    description: pwaRaw.description ?? `${title} — a 3D browser game`,
    themeColor: pwaRaw.themeColor ?? themeFallback,
    backgroundColor: pwaRaw.backgroundColor ?? themeFallback,
    display: pwaRaw.display ?? 'standalone',
    icons: pwaRaw.icons ?? {
      '192': '/branding/icons/icon-192.png',
      '512': '/branding/icons/icon-512.png',
      '512Maskable': '/branding/icons/icon-512-maskable.png'
    },
    screenshots: pwaRaw.screenshots ?? []
  };

  return {
    image: merged.image,
    imageWidth: merged.imageWidth,
    imageHeight: merged.imageHeight,
    bgColor: merged.bgColor,
    loadscreenText: merged.loadscreenText,
    title,
    subtitle,
    pwa
  };
}

/**
 * Strip leading slash and prefix with Vite base for manifest asset paths.
 * @param {string} assetPath
 * @param {string} base
 */
export function toManifestPath(assetPath, base) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const stripped = assetPath.replace(/^\/+/, '');
  return `${normalizedBase}${stripped}`;
}

/**
 * @param {import('../../client/types/branding').ResolvedBrandingConfig} resolved
 * @param {string} base
 */
export function buildWebManifest(resolved, base) {
  const { pwa } = resolved;
  const icons = [
    {
      src: toManifestPath(pwa.icons['192'], base),
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: toManifestPath(pwa.icons['512'], base),
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: toManifestPath(pwa.icons['512Maskable'], base),
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ];

  const screenshots = pwa.screenshots.map((shot) => ({
    src: toManifestPath(shot.src, base),
    sizes: shot.sizes,
    type: shot.type,
    form_factor: shot.formFactor,
    label: shot.label
  }));

  return {
    name: pwa.name,
    short_name: pwa.shortName,
    description: pwa.description,
    start_url: base,
    scope: base,
    display: pwa.display,
    theme_color: pwa.themeColor,
    background_color: pwa.backgroundColor,
    icons,
    screenshots
  };
}
