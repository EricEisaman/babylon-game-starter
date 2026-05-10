/**
 * Character Loader - Handles character model loading and caching
 */

// /// <reference path="../types/babylon.d.ts" />

import { ASSETS } from '../config/assets';
import { CHARACTER_ANIM_META_KEY } from '../config/character_animation_meta';
import { CONFIG } from '../config/game_config';
import {
  stampScenePerfConsoleContext,
  tryFlushDeferredScenePerfDevLog
} from '../utils/scene_perf_console_stamp';

import { AudioManager } from './audio_manager';
import { NodeMaterialManager } from './node_material_manager';
import { VisualEffectsManager } from './visual_effects_manager';

import type { SceneManager } from './scene_manager';
import type { CharacterController } from '../controllers/character_controller';
import type { Character } from '../types/character';

type CharacterEnvironmentReadyGate = Pick<
  SceneManager,
  'showPlayerMeshResumePhysicsAndRevealEnvironment'
>;

export class CharacterLoader {
  private static characterCache = new Map<string, BABYLON.AbstractMesh[]>();
  private static currentCharacterName: string | null = null;
  private static scene: BABYLON.Scene | null = null;
  private static characterController: CharacterController | null = null;
  private static environmentReadyGate: CharacterEnvironmentReadyGate | null = null;

  /** Tags **all** groups from the character file (idle/walk/jump + any custom/emote clips). */
  private static tagCharacterAnimationGroups(
    characterName: string,
    groups: readonly BABYLON.AnimationGroup[]
  ): void {
    for (const group of groups) {
      const meta = (group.metadata ??= {});
      meta[CHARACTER_ANIM_META_KEY] = characterName;
    }
  }

  private static stampCharacterPerfContext(characterName: string): void {
    if (!this.scene) {
      return;
    }
    stampScenePerfConsoleContext(this.scene, {
      characterName,
      loggedAtIso: new Date().toISOString()
    });
    tryFlushDeferredScenePerfDevLog(this.scene);
  }

  private static disposeAnimationGroupsForCharacter(
    scene: BABYLON.Scene,
    characterName: string
  ): void {
    for (const group of scene.animationGroups.slice()) {
      const meta = group.metadata;
      if (meta?.[CHARACTER_ANIM_META_KEY] === characterName) {
        group.dispose();
      }
    }
  }

  /**
   * Initializes the CharacterLoader with scene and character controller
   * @param scene The Babylon.js scene
   * @param characterController The character controller instance
   */
  public static initialize(
    scene: BABYLON.Scene,
    characterController: CharacterController,
    environmentReadyGate?: CharacterEnvironmentReadyGate | null
  ): void {
    this.scene = scene;
    this.characterController = characterController;
    this.environmentReadyGate = environmentReadyGate ?? null;
  }

  /**
   * Loads a character model
   * @param character The character to load
   * @param preservedPosition Optional preserved position for character switching
   * @param spawnPoint Optional spawn point, defaults to environment spawn point
   */
  public static loadCharacter(
    character: Character,
    preservedPosition?: BABYLON.Vector3 | null,
    spawnPoint?: BABYLON.Vector3
  ): void {
    if (!this.characterController || !this.scene) {
      return;
    }

    // Check if character is already cached (including previously-active characters)
    if (this.characterCache.has(character.name)) {
      this.activateCachedCharacter(character, preservedPosition);
      return;
    }

    // Disable current character if switching
    if (this.currentCharacterName && this.currentCharacterName !== character.name) {
      this.disableCurrentCharacter();
    }

    // Do **not** dispose outgoing clips here: meshes stay in `characterCache` and must
    // keep their AnimationGroups when the player switches back (dispose only in `pruneCache`).

    const revealEnvironmentAfterThisLoad = this.currentCharacterName === null;

    BABYLON.ImportMeshAsync(character.model, this.scene)
      .then(async (result) => {
        // Process node materials for character meshes
        await NodeMaterialManager.processImportResult(result);

        // Rename the root node to "player" for better organization
        if (result.meshes.length > 0) {
          // Find the root mesh (the one without a parent)
          const rootMesh = result.meshes.find((mesh) => !mesh.parent);
          if (rootMesh) {
            rootMesh.name = 'player';
          }
        }

        if (this.characterController) {
          this.tagCharacterAnimationGroups(character.name, result.animationGroups);

          // Apply character scale to all meshes
          result.meshes.forEach((mesh) => {
            mesh.scaling.setAll(character.scale);
          });

          // Cache the character meshes
          this.characterCache.set(character.name, result.meshes);
          this.currentCharacterName = character.name;
          this.stampCharacterPerfContext(character.name);

          const rootMesh = result.meshes[0];
          if (!rootMesh) {
            return;
          }
          this.characterController.setPlayerMesh(rootMesh);

          // Determine position for new character
          let characterPosition: BABYLON.Vector3;
          if (preservedPosition) {
            // Use preserved position when switching characters
            characterPosition = preservedPosition;
          } else if (spawnPoint) {
            // Use provided spawn point
            characterPosition = spawnPoint;
          } else {
            // Fallback to default position
            characterPosition = new BABYLON.Vector3(0, 1, 0);
          }

          // Update character physics with determined position
          this.characterController.updateCharacterPhysics(character, characterPosition);

          // Set character rotation only when not preserving position
          if (!preservedPosition) {
            this.characterController.setRotation(new BABYLON.Vector3(0, 0, 0)); // Default
          }

          // Setup animations using character's animation mapping with fallbacks
          const playerAnimations = {
            walk:
              result.animationGroups.find((a) => a.name === character.animations.walk) ??
              result.animationGroups.find((a) => a.name.toLowerCase().includes('walk')) ??
              result.animationGroups.find((a) => a.name.toLowerCase().includes('run')) ??
              result.animationGroups.find((a) => a.name.toLowerCase().includes('move')),

            idle:
              result.animationGroups.find((a) => a.name === character.animations.idle) ??
              result.animationGroups.find((a) => a.name.toLowerCase().includes('idle')) ??
              result.animationGroups.find((a) => a.name.toLowerCase().includes('stand'))
          };

          // Stop animations initially
          playerAnimations.walk?.stop();
          playerAnimations.idle?.stop();

          // Set character in animation controller
          this.characterController.animationController.setCharacter(character);

          // Create particle system attached to player mesh
          const playerParticleSystem = await VisualEffectsManager.createParticleSystem(
            CONFIG.EFFECTS.DEFAULT_PARTICLE,
            result.meshes[0]
          );
          if (playerParticleSystem) {
            this.characterController.setPlayerParticleSystem(playerParticleSystem);
          }

          // Set up thruster sound for character controller
          const thrusterSound = AudioManager.getSound('Thruster');
          if (thrusterSound) {
            this.characterController.setThrusterSound(thrusterSound);
          }
        }
      })
      .catch(() => {
        // Ignore character loading errors for playground compatibility
      })
      .finally(() => {
        if (revealEnvironmentAfterThisLoad) {
          this.environmentReadyGate?.showPlayerMeshResumePhysicsAndRevealEnvironment();
        }
      });
  }

  /**
   * Loads a character model with default or specified character
   * @param character Optional character to load, defaults to first in ASSETS
   * @param preservedPosition Optional preserved position
   * @param spawnPoint Optional spawn point, defaults to environment spawn point
   */
  public static loadCharacterModel(
    character?: Character,
    preservedPosition?: BABYLON.Vector3 | null,
    spawnPoint?: BABYLON.Vector3
  ): void {
    const characterToLoad = character ?? ASSETS.CHARACTERS[0];
    if (!characterToLoad) {
      throw new Error('ASSETS.CHARACTERS must contain at least one character');
    }
    this.loadCharacter(characterToLoad, preservedPosition, spawnPoint);
  }

  /**
   * Activates a cached character
   * @param character The character to activate
   * @param preservedPosition Optional preserved position
   */
  private static activateCachedCharacter(
    character: Character,
    preservedPosition?: BABYLON.Vector3 | null
  ): void {
    if (!this.characterController || !this.scene) return;

    const cachedMeshes = this.characterCache.get(character.name);
    if (!cachedMeshes) return;

    // Disable current character
    this.disableCurrentCharacter();

    // Enable cached meshes
    cachedMeshes.forEach((mesh) => {
      mesh.setEnabled(true);
    });

    this.currentCharacterName = character.name;
    const rootCached = cachedMeshes[0];
    if (!rootCached) {
      return;
    }
    this.characterController.setPlayerMesh(rootCached);

    const spawnPosition =
      preservedPosition?.clone() ?? this.characterController.getPosition().clone();
    this.characterController.updateCharacterPhysics(character, spawnPosition);
    this.characterController.animationController.setCharacter(character);

    this.stampCharacterPerfContext(character.name);
  }

  /**
   * Disables the current character
   */
  private static stopAnimationGroupsForCharacter(
    scene: BABYLON.Scene,
    characterName: string
  ): void {
    for (const group of scene.animationGroups.slice()) {
      const meta = group.metadata;
      if (meta?.[CHARACTER_ANIM_META_KEY] === characterName) {
        try {
          group.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private static disableCurrentCharacter(): void {
    if (!this.currentCharacterName) return;

    if (this.scene) {
      this.stopAnimationGroupsForCharacter(this.scene, this.currentCharacterName);
    }

    const currentMeshes = this.characterCache.get(this.currentCharacterName);
    if (currentMeshes) {
      currentMeshes.forEach((mesh) => {
        mesh.setEnabled(false);
      });
    }
  }

  /**
   * Gets the current character name
   * @returns The current character name or null
   */
  public static getCurrentCharacterName(): string | null {
    return this.currentCharacterName;
  }

  /**
   * Prunes the character cache to prevent memory leaks
   * @param maxCachedCharacters Maximum number of characters to keep cached
   */
  public static pruneCache(maxCachedCharacters = 3): void {
    if (this.characterCache.size <= maxCachedCharacters) return;

    // Get all character names except current
    const cachedNames = Array.from(this.characterCache.keys()).filter(
      (name) => name !== this.currentCharacterName
    );

    // Remove oldest cached characters beyond the limit
    const toRemove = cachedNames.slice(0, cachedNames.length - maxCachedCharacters + 1);
    for (const name of toRemove) {
      if (this.scene) {
        this.disposeAnimationGroupsForCharacter(this.scene, name);
      }
      const meshes = this.characterCache.get(name);
      if (meshes) {
        meshes.forEach((mesh) => {
          mesh.dispose();
        });
      }
      this.characterCache.delete(name);
    }
  }
}
