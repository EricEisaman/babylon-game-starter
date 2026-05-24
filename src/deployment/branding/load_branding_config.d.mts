import type { BrandingConfig, ResolvedBrandingConfig } from '../../client/types/branding';

export function loadBrandingConfigJson(repoRootOverride?: string): BrandingConfig;
export function resolveBrandingConfig(config: BrandingConfig): ResolvedBrandingConfig;
export function toManifestPath(assetPath: string, base: string): string;
export function buildWebManifest(resolved: ResolvedBrandingConfig, base: string): Record<string, unknown>;
