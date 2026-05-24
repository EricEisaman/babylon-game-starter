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
