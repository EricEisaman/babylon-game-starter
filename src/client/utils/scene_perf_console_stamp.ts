/**
 * Keys on scene.metadata so dev console + __babylon.logSceneStats() can show
 * which environment load and which character were last stamped.
 */
const META_ENV = 'babylon_game_starter_perfEnv';
const META_CHARACTER = 'babylon_game_starter_perfCharacter';
const META_AT = 'babylon_game_starter_perfAt';

/** Values merged into `scene.metadata` for dev perf logging. */
export interface StampScenePerfConsoleContextOptions {
  readonly environmentName?: string;
  readonly characterName?: string;
  readonly loggedAtIso?: string;
}

/** Snapshot read back from `scene.metadata` for `__babylon.logSceneStats()`. */
export interface ScenePerfConsoleContext {
  readonly environmentName: string;
  readonly characterName: string;
}

export type DeferredScenePerfDevLogFlush = (scene: BABYLON.Scene) => void;

let deferredScenePerfDevLogFlush: DeferredScenePerfDevLogFlush | undefined;

/**
 * SceneManager registers this so the first dev [ScenePerf] line can wait until
 * the playable character exists (env load completes before loadCharacterModel in index.ts).
 */
export function registerDeferredScenePerfDevLogFlush(fn: DeferredScenePerfDevLogFlush): void {
  deferredScenePerfDevLogFlush = fn;
}

export function tryFlushDeferredScenePerfDevLog(scene: BABYLON.Scene): void {
  deferredScenePerfDevLogFlush?.(scene);
}

export function stampScenePerfConsoleContext(
  scene: BABYLON.Scene,
  options: StampScenePerfConsoleContextOptions
): void {
  const prev = scene.metadata;
  const bag = prev != null && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
  if (options.environmentName !== undefined) {
    bag[META_ENV] = options.environmentName;
  }
  if (options.characterName !== undefined) {
    bag[META_CHARACTER] = options.characterName;
  }
  if (options.loggedAtIso !== undefined) {
    bag[META_AT] = options.loggedAtIso;
  }
  scene.metadata = bag;
}

export function readScenePerfConsoleContext(scene: BABYLON.Scene): ScenePerfConsoleContext {
  const meta = scene.metadata;
  let environmentName = '(unknown)';
  let characterName = '(unknown)';
  if (meta != null && typeof meta === 'object' && !Array.isArray(meta)) {
    const env = meta[META_ENV];
    if (typeof env === 'string' && env !== '') {
      environmentName = env;
    }
    const ch = meta[META_CHARACTER];
    if (typeof ch === 'string' && ch !== '') {
      characterName = ch;
    }
  }
  return { environmentName, characterName };
}
