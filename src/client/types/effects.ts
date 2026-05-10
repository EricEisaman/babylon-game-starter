// ============================================================================
// EFFECTS TYPE DEFINITIONS
// ============================================================================

export type EffectType = 'GLOW';

export type ParticleSnippetType = 'legacy' | 'nodes';

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

export type ParticleSnippet = LegacyParticleSnippet | NodesParticleSnippet;

export interface SoundEffect {
  readonly name: string;
  readonly url: string;
  readonly volume: number;
  readonly loop: boolean;
}

export interface EffectsConfig {
  readonly PARTICLE_SNIPPETS: readonly ParticleSnippet[];
  readonly DEFAULT_PARTICLE: string;
  readonly AUTO_SPAWN: boolean;
  readonly SOUND_EFFECTS: readonly SoundEffect[];
}
