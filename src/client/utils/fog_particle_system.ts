// ============================================================================
// FOG PARTICLE SYSTEM — Voronoi-distributed atmospheric fog
// ============================================================================

import { DEFAULT_FOG_PARTICLE_CONFIG } from '../types/effects';

import { absolutizeParticleTextureUrl } from './particle_texture_url';

import type { FogColorTuple, FogParticleConfig } from '../types/effects';

type ResolvedFogConfig = Required<Omit<FogParticleConfig, 'useGpu' | 'seed'>> & {
  readonly useGpu: boolean | undefined;
  readonly seed: number | undefined;
};

interface ParticlePositionGeneratorHost {
  particlePositionGenerator?: (
    index: number,
    particle: BABYLON.Particle,
    out: BABYLON.Vector3
  ) => void;
}

function toColor4([r, g, b, a]: FogColorTuple): BABYLON.Color4 {
  return new BABYLON.Color4(r, g, b, a);
}

function mergeFogConfig(
  catalogDefaults: FogParticleConfig,
  overrides?: Partial<FogParticleConfig>
): ResolvedFogConfig {
  const merged = { ...DEFAULT_FOG_PARTICLE_CONFIG, ...catalogDefaults, ...overrides };
  return {
    particleCount: merged.particleCount,
    radius: merged.radius,
    voronoiSitesCount: merged.voronoiSitesCount,
    heightVariation: merged.heightVariation,
    emitBoxMinYOffset: merged.emitBoxMinYOffset,
    emitBoxMaxYOffset: merged.emitBoxMaxYOffset,
    useGpu: merged.useGpu,
    textureUrl: merged.textureUrl,
    color1: merged.color1,
    color2: merged.color2,
    colorDead: merged.colorDead,
    minSize: merged.minSize,
    maxSize: merged.maxSize,
    minLifeTime: merged.minLifeTime,
    emitRate: merged.emitRate,
    minAngularSpeed: merged.minAngularSpeed,
    maxAngularSpeed: merged.maxAngularSpeed,
    minEmitPower: merged.minEmitPower,
    maxEmitPower: merged.maxEmitPower,
    updateSpeed: merged.updateSpeed,
    seed: merged.seed
  };
}

function hashCenterSeed(center: BABYLON.Vector3): number {
  const x = Math.floor(center.x * 1000);
  const y = Math.floor(center.y * 1000);
  const z = Math.floor(center.z * 1000);
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function generateVoronoiSites(
  center: BABYLON.Vector3,
  radius: number,
  count: number,
  random: () => number
): BABYLON.Vector2[] {
  const sites: BABYLON.Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius;
    sites.push(
      new BABYLON.Vector2(
        center.x + distance * Math.cos(angle),
        center.z + distance * Math.sin(angle)
      )
    );
  }
  return sites;
}

function calculatePositionDensity(
  position: BABYLON.Vector3,
  sites: readonly BABYLON.Vector2[],
  radius: number,
  random: () => number
): number {
  let minDist = Infinity;
  for (const site of sites) {
    const dx = position.x - site.x;
    const dz = position.z - site.y;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  const density = 1 - minDist / radius;
  return density * 0.7 + 0.3 * random();
}

function createVoronoiPositionGenerator(
  center: BABYLON.Vector3,
  config: ResolvedFogConfig,
  sites: readonly BABYLON.Vector2[],
  random: () => number
): (index: number, particle: BABYLON.Particle, out: BABYLON.Vector3) => void {
  return (index: number, particle: BABYLON.Particle, out: BABYLON.Vector3) => {
    void index;
    void particle;
    let position = center.clone();
    let attempts = 0;

    while (attempts < 10) {
      attempts++;
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * config.radius;

      position = new BABYLON.Vector3(
        center.x + distance * Math.cos(angle),
        center.y + random() * config.heightVariation,
        center.z + distance * Math.sin(angle)
      );

      const density = calculatePositionDensity(position, sites, config.radius, random);
      if (random() < density) {
        break;
      }
    }

    out.x = position.x;
    out.y = position.y;
    out.z = position.z;
  };
}

function applyFogVisualParams(
  particleSystem: BABYLON.ParticleSystem | BABYLON.GPUParticleSystem,
  config: ResolvedFogConfig,
  scene: BABYLON.Scene
): void {
  particleSystem.particleTexture = new BABYLON.Texture(
    absolutizeParticleTextureUrl(config.textureUrl),
    scene
  );
  particleSystem.color1 = toColor4(config.color1);
  particleSystem.color2 = toColor4(config.color2);
  particleSystem.colorDead = toColor4(config.colorDead);
  particleSystem.minSize = config.minSize;
  particleSystem.maxSize = config.maxSize;
  particleSystem.minLifeTime = config.minLifeTime;
  particleSystem.maxLifeTime = config.minLifeTime;
  particleSystem.emitRate = config.emitRate;
  particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  particleSystem.gravity = new BABYLON.Vector3(0, 0, 0);
  particleSystem.direction1 = new BABYLON.Vector3(0, 0, 0);
  particleSystem.direction2 = new BABYLON.Vector3(0, 0, 0);
  particleSystem.minAngularSpeed = config.minAngularSpeed;
  particleSystem.maxAngularSpeed = config.maxAngularSpeed;
  particleSystem.minEmitPower = config.minEmitPower;
  particleSystem.maxEmitPower = config.maxEmitPower;
  particleSystem.updateSpeed = config.updateSpeed;
}

function setFogEmitBox(
  particleSystem: BABYLON.ParticleSystem | BABYLON.GPUParticleSystem,
  center: BABYLON.Vector3,
  config: ResolvedFogConfig
): void {
  particleSystem.minEmitBox = new BABYLON.Vector3(
    center.x - config.radius,
    center.y + config.emitBoxMinYOffset,
    center.z - config.radius
  );
  particleSystem.maxEmitBox = new BABYLON.Vector3(
    center.x + config.radius,
    center.y + config.emitBoxMaxYOffset,
    center.z + config.radius
  );
}

function shouldUseGpu(config: ResolvedFogConfig): boolean {
  if (config.useGpu === false) {
    return false;
  }
  return BABYLON.GPUParticleSystem.IsSupported;
}

/**
 * Creates a Voronoi-distributed fog particle system at the given center.
 */
export function createFogParticleSystem(
  scene: BABYLON.Scene,
  center: BABYLON.Vector3,
  catalogDefaults: FogParticleConfig,
  systemName: string,
  overrides?: Partial<FogParticleConfig>
): BABYLON.IParticleSystem {
  const config = mergeFogConfig(catalogDefaults, overrides);
  const seed = config.seed ?? hashCenterSeed(center);
  const random = createSeededRandom(seed);
  const sites = generateVoronoiSites(center, config.radius, config.voronoiSitesCount, random);
  const positionGenerator = createVoronoiPositionGenerator(center, config, sites, random);

  let particleSystem: BABYLON.ParticleSystem | BABYLON.GPUParticleSystem;

  if (shouldUseGpu(config)) {
    const gpuCapacity = Math.max(config.particleCount, 50000);
    const gpuSystem = new BABYLON.GPUParticleSystem(systemName, { capacity: gpuCapacity }, scene);
    gpuSystem.activeParticleCount = config.particleCount;
    gpuSystem.manualEmitCount = config.particleCount;
    (gpuSystem as ParticlePositionGeneratorHost).particlePositionGenerator = positionGenerator;
    particleSystem = gpuSystem;
  } else {
    const cpuSystem = new BABYLON.ParticleSystem(systemName, config.particleCount, scene);
    cpuSystem.manualEmitCount = config.particleCount;
    (cpuSystem as ParticlePositionGeneratorHost).particlePositionGenerator = positionGenerator;
    particleSystem = cpuSystem;
  }

  particleSystem.emitter = center.clone();
  setFogEmitBox(particleSystem, center, config);
  applyFogVisualParams(particleSystem, config, scene);

  return particleSystem;
}
