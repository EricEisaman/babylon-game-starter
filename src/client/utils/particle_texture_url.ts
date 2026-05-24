// ============================================================================
// PARTICLE TEXTURE URL — rewrite playground-relative paths for deployed hosts
// ============================================================================

const BABYLON_PARTICLE_TEXTURE_CDN = 'https://assets.babylonjs.com';

/**
 * Snippets such as HYB2FR embed `textures/flare.png`, which resolves against the
 * page origin. Playground serves that path; Render, Netlify, and GitHub Pages do not.
 */
export function absolutizeParticleTextureUrl(url: string): string {
  const trimmed = url.trim();
  if (
    /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(trimmed) ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const path = trimmed.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${BABYLON_PARTICLE_TEXTURE_CDN}/${path}`;
}

function getParticleTextureSourceUrl(texture: BABYLON.BaseTexture): string | null {
  const maybeUrl = Reflect.get(texture, 'url');
  if (typeof maybeUrl === 'string' && maybeUrl.length > 0) {
    return maybeUrl;
  }
  if (typeof texture.name === 'string' && texture.name.length > 0) {
    return texture.name;
  }
  return null;
}

/**
 * Reassigns a particle system's texture when the snippet used a relative URL.
 */
export function fixParticleSystemTexture(
  particleSystem: BABYLON.IParticleSystem,
  scene: BABYLON.Scene
): void {
  const texture = particleSystem.particleTexture;
  if (!texture) {
    return;
  }

  const rawUrl = getParticleTextureSourceUrl(texture);
  if (!rawUrl) {
    return;
  }

  const absoluteUrl = absolutizeParticleTextureUrl(rawUrl);
  if (absoluteUrl === rawUrl) {
    return;
  }

  texture.dispose();
  particleSystem.particleTexture = new BABYLON.Texture(absoluteUrl, scene);
}

/**
 * Normalizes textures on every system in a node-particle build result.
 */
export function fixParticleSystemsInSet(
  particleSystemSet: { systems?: readonly BABYLON.IParticleSystem[] },
  scene: BABYLON.Scene
): void {
  const systems = particleSystemSet.systems;
  if (!Array.isArray(systems)) {
    return;
  }

  for (const system of systems) {
    fixParticleSystemTexture(system, scene);
  }
}
