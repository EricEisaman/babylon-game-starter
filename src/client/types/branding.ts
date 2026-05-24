// ============================================================================
// BRANDING + PWA TYPE DEFINITIONS
// ============================================================================

export interface PwaScreenshotConfig {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly formFactor: 'wide' | 'narrow';
  readonly label: string;
}

export interface PwaIconsConfig {
  readonly '192': string;
  readonly '512': string;
  readonly '512Maskable': string;
}

export interface PwaConfig {
  readonly enabled: boolean;
  readonly name?: string;
  readonly shortName?: string;
  readonly description?: string;
  readonly themeColor?: string;
  readonly backgroundColor?: string;
  readonly display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  readonly icons: PwaIconsConfig;
  readonly screenshots: readonly PwaScreenshotConfig[];
}

export interface BrandingConfig {
  readonly image?: string;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly bgColor?: string;
  readonly loadscreenText?: string;
  readonly pwa?: PwaConfig;
}

export interface ResolvedPwaConfig {
  readonly enabled: boolean;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly themeColor: string;
  readonly backgroundColor: string;
  readonly display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  readonly icons: PwaIconsConfig;
  readonly screenshots: readonly PwaScreenshotConfig[];
}

export interface ResolvedBrandingConfig {
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly bgColor: string;
  readonly loadscreenText: string;
  readonly title: string;
  readonly subtitle: string;
  readonly pwa: ResolvedPwaConfig;
}
