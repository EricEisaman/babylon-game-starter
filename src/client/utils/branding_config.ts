// ============================================================================
// BRANDING CONFIG LOADER (runtime)
// ============================================================================

import type { BrandingConfig, ResolvedBrandingConfig } from '../types/branding';

const DEFAULT_BRANDING: ResolvedBrandingConfig = {
  image: '/branding/images/Babylon_logo.png',
  imageWidth: 256,
  imageHeight: 256,
  bgColor: '#ffffff',
  loadscreenText: 'Babylon Game Starter\nLoading your game ...',
  title: 'Babylon Game Starter',
  subtitle: 'Loading your game ...',
  pwa: {
    enabled: true,
    name: 'Babylon Game Starter',
    shortName: 'BGS',
    description: 'A modular 3D browser game built with Babylon.js',
    themeColor: '#1a1a1a',
    backgroundColor: '#1a1a1a',
    display: 'standalone',
    icons: {
      '192': '/branding/icons/icon-192.png',
      '512': '/branding/icons/icon-512.png',
      '512Maskable': '/branding/icons/icon-512-maskable.png'
    },
    screenshots: [
      {
        src: '/branding/screenshots/desktop-wide.png',
        sizes: '1280x720',
        type: 'image/png',
        formFactor: 'wide',
        label: 'Explore 3D worlds'
      },
      {
        src: '/branding/screenshots/mobile-narrow.png',
        sizes: '390x844',
        type: 'image/png',
        formFactor: 'narrow',
        label: 'Play on mobile'
      }
    ]
  }
};

let cachedConfig: ResolvedBrandingConfig | null = null;
let loadPromise: Promise<ResolvedBrandingConfig> | null = null;

/** Vite injects `import.meta.env`; playground TS has no `ImportMetaEnv` type. */
function readViteBaseUrl(): string {
  try {
    const meta = import.meta as { env?: { BASE_URL?: string } };
    const base = meta.env?.BASE_URL;
    if (typeof base === 'string' && base.length > 0) {
      return base.endsWith('/') ? base : `${base}/`;
    }
  } catch {
    // Playground runtime: no Vite env injection.
  }
  return '/';
}

function withAppBasePath(path: string): string {
  const base = readViteBaseUrl();
  if (
    /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(path) ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  return `${base}${path.replace(/^\/+/, '')}`;
}

function resolveBrandingConfig(raw: BrandingConfig): ResolvedBrandingConfig {
  const merged = { ...DEFAULT_BRANDING, ...raw };
  const textValue =
    typeof merged.loadscreenText === 'string' && merged.loadscreenText.length > 0
      ? merged.loadscreenText
      : DEFAULT_BRANDING.loadscreenText;
  const [title = DEFAULT_BRANDING.title, subtitle = DEFAULT_BRANDING.subtitle] = textValue.split(
    /\r?\n/,
    2
  );

  const pwaRaw = raw.pwa ?? DEFAULT_BRANDING.pwa;
  const themeFallback = merged.bgColor === '#ffffff' ? '#1a1a1a' : merged.bgColor;

  return {
    image: merged.image ?? DEFAULT_BRANDING.image,
    imageWidth: merged.imageWidth ?? DEFAULT_BRANDING.imageWidth,
    imageHeight: merged.imageHeight ?? DEFAULT_BRANDING.imageHeight,
    bgColor: merged.bgColor ?? DEFAULT_BRANDING.bgColor,
    loadscreenText: textValue,
    title,
    subtitle,
    pwa: {
      enabled: pwaRaw.enabled ?? true,
      name: pwaRaw.name ?? title,
      shortName: pwaRaw.shortName ?? title.slice(0, 12),
      description: pwaRaw.description ?? DEFAULT_BRANDING.pwa.description,
      themeColor: pwaRaw.themeColor ?? themeFallback,
      backgroundColor: pwaRaw.backgroundColor ?? themeFallback,
      display: pwaRaw.display ?? 'standalone',
      icons: pwaRaw.icons ?? DEFAULT_BRANDING.pwa.icons,
      screenshots: pwaRaw.screenshots ?? DEFAULT_BRANDING.pwa.screenshots
    }
  };
}

function applyLoadscreenBranding(config: ResolvedBrandingConfig): void {
  const loadingScreenEl = document.getElementById('loadingScreen');
  const imageEl = document.getElementById('loadingBrandImage');
  const titleEl = document.getElementById('loadingTitle');
  const subtitleEl = document.getElementById('loadingSubtitle');

  if (loadingScreenEl instanceof HTMLElement) {
    loadingScreenEl.style.background = config.bgColor;

    const normalizedHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(config.bgColor)
      ? config.bgColor
      : DEFAULT_BRANDING.bgColor;
    const hex =
      normalizedHex.length === 4
        ? `#${normalizedHex[1]}${normalizedHex[1]}${normalizedHex[2]}${normalizedHex[2]}${normalizedHex[3]}${normalizedHex[3]}`
        : normalizedHex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const foreground = luminance > 0.55 ? '#111111' : '#f5f5f5';
    const spinnerBorder = luminance > 0.55 ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.35)';

    loadingScreenEl.style.setProperty('--loading-foreground', foreground);
    loadingScreenEl.style.setProperty('--loading-spinner-border', spinnerBorder);
  }

  if (imageEl instanceof HTMLImageElement) {
    imageEl.src = withAppBasePath(config.image);
    imageEl.width = config.imageWidth;
    imageEl.height = config.imageHeight;
    imageEl.style.width = `${config.imageWidth}px`;
    imageEl.style.height = `${config.imageHeight}px`;
  }

  if (titleEl) {
    titleEl.textContent = config.title;
  }

  if (subtitleEl) {
    subtitleEl.textContent = config.subtitle;
  }
}

function applyPwaHeadTags(config: ResolvedBrandingConfig): void {
  const { pwa } = config;

  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!(themeMeta instanceof HTMLMetaElement)) {
    themeMeta = document.createElement('meta');
    themeMeta.setAttribute('name', 'theme-color');
    document.head.appendChild(themeMeta);
  }
  themeMeta.setAttribute('content', pwa.themeColor);

  const appleTitle = pwa.shortName || pwa.name;
  const iosMetaTags: [string, string][] = [
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-title', appleTitle],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent']
  ];

  for (const [name, content] of iosMetaTags) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!(meta instanceof HTMLMetaElement)) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  const appleIconHref = withAppBasePath(pwa.icons['192']);
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!(appleIcon instanceof HTMLLinkElement)) {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = appleIconHref;
    document.head.appendChild(link);
    return;
  }
  appleIcon.href = appleIconHref;
}

export async function loadBrandingConfig(): Promise<ResolvedBrandingConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const response = await fetch(withAppBasePath('/branding/config.json'), { cache: 'no-store' });
      if (!response.ok) {
        cachedConfig = DEFAULT_BRANDING;
      } else {
        const data = (await response.json()) as BrandingConfig;
        cachedConfig = resolveBrandingConfig(data);
      }
    } catch {
      cachedConfig = DEFAULT_BRANDING;
    }

    applyLoadscreenBranding(cachedConfig);
    applyPwaHeadTags(cachedConfig);
    return cachedConfig;
  })();

  return loadPromise;
}

export function getBrandingConfig(): ResolvedBrandingConfig | null {
  return cachedConfig;
}

export { withAppBasePath, DEFAULT_BRANDING };
