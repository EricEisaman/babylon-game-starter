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

const DEFAULT_OG_IMAGE = '/branding/screenshots/og-card.png';

/**
 * @param {string} publicUrl
 * @returns {string}
 */
function normalizePublicUrl(publicUrl) {
  return publicUrl.replace(/\/+$/, '');
}

/**
 * Join canonical site root with a branding asset path.
 * `publicUrl` is the deployed site root (may include a Vite base subpath).
 * Asset paths in config (`/branding/...`) are relative to that root — do not apply `base` again.
 * @param {string} publicUrl
 * @param {string} assetPath
 * @param {string} base
 * @returns {string}
 */
export function toAbsolutePublicUrl(publicUrl, assetPath, base) {
  const siteRoot = normalizePublicUrl(publicUrl);
  const strippedAsset = assetPath.replace(/^\/+/, '');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const baseSegment = normalizedBase.replace(/^\/+|\/+$/g, '');

  if (baseSegment && siteRoot.endsWith(`/${baseSegment}`)) {
    return `${siteRoot}/${strippedAsset}`;
  }

  const pathWithBase = toManifestPath(assetPath, base);
  const pathname = pathWithBase.startsWith('/') ? pathWithBase : `/${pathWithBase}`;
  return `${siteRoot}${pathname}`;
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

  const socialRaw = merged.social ?? {};
  const wideScreenshot = pwa.screenshots.find((shot) => shot.formFactor === 'wide');
  const imageFallback = wideScreenshot?.src ?? DEFAULT_OG_IMAGE;
  const imageTypeFallback = wideScreenshot?.type ?? 'image/png';
  const [fallbackWidth = '1200', fallbackHeight = '630'] = (wideScreenshot?.sizes ?? '1200x630').split('x');

  const social = {
    title: socialRaw.title ?? pwa.name,
    description: socialRaw.description ?? pwa.description,
    siteName: socialRaw.siteName ?? pwa.name,
    siteUrl: socialRaw.siteUrl,
    image: socialRaw.image ?? imageFallback,
    imageWidth: socialRaw.imageWidth ?? Number(fallbackWidth),
    imageHeight: socialRaw.imageHeight ?? Number(fallbackHeight),
    imageType: socialRaw.imageType ?? imageTypeFallback,
    twitterCard: socialRaw.twitterCard ?? 'summary_large_image'
  };

  return {
    image: merged.image,
    imageWidth: merged.imageWidth,
    imageHeight: merged.imageHeight,
    bgColor: merged.bgColor,
    loadscreenText: merged.loadscreenText,
    title,
    subtitle,
    pwa,
    social
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

/**
 * @param {import('../../client/types/branding').ResolvedBrandingConfig} resolved
 * @param {{ base: string, publicUrl?: string }} options
 * @returns {import('../../client/types/branding').SocialMetaTags}
 */
export function buildSocialMetaTags(resolved, { base, publicUrl }) {
  const { social } = resolved;
  const canonicalUrl = publicUrl ?? social.siteUrl;
  const ogUrl = canonicalUrl ? normalizePublicUrl(canonicalUrl) : undefined;
  const ogImage = canonicalUrl
    ? toAbsolutePublicUrl(canonicalUrl, social.image, base)
    : undefined;

  return {
    title: social.title,
    description: social.description,
    siteName: social.siteName,
    ogType: 'website',
    ogUrl,
    ogImage,
    ogImageWidth: social.imageWidth,
    ogImageHeight: social.imageHeight,
    ogImageType: social.imageType,
    twitterCard: social.twitterCard,
    twitterTitle: social.title,
    twitterDescription: social.description,
    twitterImage: ogImage
  };
}

/**
 * @param {import('../../client/types/branding').SocialMetaTags} tags
 * @returns {string}
 */
export function renderSocialMetaHtml(tags) {
  const escapeHtml = (value) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const metaLines = [
    `<meta name="description" content="${escapeHtml(tags.description)}">`,
    `<meta property="og:type" content="${escapeHtml(tags.ogType)}">`,
    `<meta property="og:title" content="${escapeHtml(tags.title)}">`,
    `<meta property="og:description" content="${escapeHtml(tags.description)}">`,
    `<meta property="og:site_name" content="${escapeHtml(tags.siteName)}">`
  ];

  if (tags.ogUrl) {
    metaLines.push(`<meta property="og:url" content="${escapeHtml(tags.ogUrl)}">`);
  }
  if (tags.ogImage) {
    metaLines.push(`<meta property="og:image" content="${escapeHtml(tags.ogImage)}">`);
    metaLines.push(
      `<meta property="og:image:width" content="${escapeHtml(String(tags.ogImageWidth))}">`
    );
    metaLines.push(
      `<meta property="og:image:height" content="${escapeHtml(String(tags.ogImageHeight))}">`
    );
    metaLines.push(
      `<meta property="og:image:type" content="${escapeHtml(tags.ogImageType)}">`
    );
  }

  metaLines.push(`<meta name="twitter:card" content="${escapeHtml(tags.twitterCard)}">`);
  metaLines.push(`<meta name="twitter:title" content="${escapeHtml(tags.twitterTitle)}">`);
  metaLines.push(
    `<meta name="twitter:description" content="${escapeHtml(tags.twitterDescription)}">`
  );
  if (tags.twitterImage) {
    metaLines.push(`<meta name="twitter:image" content="${escapeHtml(tags.twitterImage)}">`);
  }

  return metaLines.join('\n    ');
}
