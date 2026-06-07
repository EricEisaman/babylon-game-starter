// ============================================================================
// EFFECTS TYPE DEFINITIONS
// ============================================================================

export type EffectType = 'GLOW';

export type ParticleSnippetType = 'legacy' | 'nodes' | 'fog';

export type FogColorTuple = readonly [number, number, number, number];

export interface FogParticleConfig {
  readonly particleCount?: number;
  readonly radius?: number;
  readonly voronoiSitesCount?: number;
  readonly heightVariation?: number;
  readonly emitBoxMinYOffset?: number;
  readonly emitBoxMaxYOffset?: number;
  readonly useGpu?: boolean;
  readonly textureUrl?: string;
  readonly color1?: FogColorTuple;
  readonly color2?: FogColorTuple;
  readonly colorDead?: FogColorTuple;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly minLifeTime?: number;
  readonly emitRate?: number;
  readonly minAngularSpeed?: number;
  readonly maxAngularSpeed?: number;
  readonly minEmitPower?: number;
  readonly maxEmitPower?: number;
  readonly updateSpeed?: number;
  readonly seed?: number;
}

export const DEFAULT_FOG_PARTICLE_CONFIG: Required<
  Omit<FogParticleConfig, 'useGpu' | 'seed'>
> & { readonly useGpu: undefined; readonly seed: undefined } = {
  particleCount: 15000,
  radius: 25,
  voronoiSitesCount: 50,
  heightVariation: 4,
  emitBoxMinYOffset: -2,
  emitBoxMaxYOffset: 6,
  useGpu: undefined,
  textureUrl: 'textures/cloud.png',
  color1: [0.8, 0.8, 0.8, 0.1],
  color2: [0.95, 0.95, 0.95, 0.15],
  colorDead: [0.9, 0.9, 0.9, 0.1],
  minSize: 3.5,
  maxSize: 5.0,
  minLifeTime: 1000000,
  emitRate: 50000,
  minAngularSpeed: -2,
  maxAngularSpeed: 2,
  minEmitPower: 0.5,
  maxEmitPower: 1,
  updateSpeed: 0.005,
  seed: undefined
};

export interface LegacyParticleSnippet {
  readonly type: 'legacy';
  readonly name: string;
  readonly description: string;
  readonly snippetId: string;
  readonly category: 'fire' | 'magic' | 'nature' | 'tech' | 'cosmic';
}

export interface NodesParticleSnippet {
  readonly type: 'nodes';
  readonly name: string;
  readonly description: string;
  readonly snippetId: string;
  readonly category: 'fire' | 'magic' | 'nature' | 'tech' | 'cosmic';
}

export interface FogParticleSnippet {
  readonly type: 'fog';
  readonly name: string;
  readonly description: string;
  readonly category: 'fire' | 'magic' | 'nature' | 'tech' | 'cosmic';
  readonly defaults: FogParticleConfig;
}

export type ParticleSnippet = LegacyParticleSnippet | NodesParticleSnippet | FogParticleSnippet;

export interface SoundEffect {
  readonly name: string;
  readonly url: string;
  readonly volume: number;
  readonly loop: boolean;
}

export type OverlayEditor = 'dom' | 'sfe' | 'nme';

export type OverlaySnippetKind = 'dom' | 'smartFilter' | 'nodePostProcess';

export interface OverlaySnippetEntry {
  readonly name: string;
  readonly description: string;
  readonly editor: OverlayEditor;
  readonly kind: OverlaySnippetKind;
  /** SFE graph id / NME snippet id; unused for `dom`. */
  readonly snippetId: string;
}

export type OverlaySimulationInput = 'drugHunger' | 'accAwareness';

export interface OverlayDriverBinding {
  readonly type: 'simulation';
  readonly input: OverlaySimulationInput;
  readonly threshold: number;
  readonly alsoRequiresLowAcc?: boolean;
}

export interface EnvironmentOverlayBinding {
  readonly catalogName: string;
  readonly enabled?: boolean;
  readonly driver?: OverlayDriverBinding;
}

export interface EffectsConfig {
  readonly PARTICLE_SNIPPETS: readonly ParticleSnippet[];
  readonly DEFAULT_PARTICLE: string;
  readonly AUTO_SPAWN: boolean;
  readonly SOUND_EFFECTS: readonly SoundEffect[];
  readonly OVERLAY_SNIPPETS: readonly OverlaySnippetEntry[];
}
