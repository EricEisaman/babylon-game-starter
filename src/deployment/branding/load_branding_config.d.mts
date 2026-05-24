import type {
  BrandingConfig,
  ResolvedBrandingConfig,
  SocialMetaTags
} from '../../client/types/branding';

export function loadBrandingConfigJson(repoRootOverride?: string): BrandingConfig;
export function resolveBrandingConfig(config: BrandingConfig): ResolvedBrandingConfig;
export function toManifestPath(assetPath: string, base: string): string;
export function toAbsolutePublicUrl(publicUrl: string, assetPath: string, base: string): string;
export function buildWebManifest(resolved: ResolvedBrandingConfig, base: string): Record<string, unknown>;
export function buildSocialMetaTags(
  resolved: ResolvedBrandingConfig,
  options: { base: string; publicUrl?: string }
): SocialMetaTags;
export function renderSocialMetaHtml(tags: SocialMetaTags): string;
