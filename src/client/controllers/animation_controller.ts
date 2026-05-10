// ============================================================================
// ANIMATION CONTROLLER
// ============================================================================

// /// <reference path="../types/babylon.d.ts" />

import { CHARACTER_ANIM_META_KEY } from '../config/character_animation_meta';
import { CHARACTER_STATES } from '../config/character_states';

import type { CharacterState } from '../config/character_states';
import type { Character } from '../types/character';

/**
 * Semantic role of the currently-playing locomotion clip.
 *
 * `null` while no role-driven clip has been started (init, post-character-switch,
 * or a custom-key clip is active via {@link AnimationController.playAnimation}).
 */
export type AnimationRole = 'idle' | 'walk' | 'jump' | null;

export class AnimationController {
  private scene: BABYLON.Scene;
  private currentCharacter: Character | null = null;
  private currentAnimation: string | null = null;
  private currentRole: AnimationRole = null;
  private previousAnimation: string | null = null;
  private blendStartTime = 0;
  private blendDuration = 400; // Default blend duration in milliseconds
  private isBlending = false;

  // Jump delay tracking
  private jumpDelayStartTime = 0;
  private isJumpDelayed = false;
  private lastCharacterState: CharacterState | null = null;
  private animationCache = new Map<string, BABYLON.AnimationGroup>();

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  /**
   * Sets the current character and its animation blend settings
   */
  public setCharacter(character: Character): void {
    this.currentCharacter = character;
    this.blendDuration = character.animationBlend ?? 400;

    // Reset animation state when character changes
    this.currentAnimation = null;
    this.currentRole = null;
    this.previousAnimation = null;
    this.isBlending = false;

    // Drop cached groups from any previous character; disposed refs break playback.
    this.animationCache.clear();

    // Reset jump delay state
    this.isJumpDelayed = false;
    this.jumpDelayStartTime = 0;
    this.lastCharacterState = null;

    // Don't stop all animations here - let the character loading process handle it
    // The new character's animations will be set up properly in loadCharacter
  }

  /**
   * Updates the animation state based on character movement and state
   */
  public updateAnimation(isMoving: boolean, characterState?: CharacterState): void {
    if (!this.currentCharacter) return;

    // Handle jump delay logic
    this.handleJumpDelay(characterState);

    let targetAnimationName: string;
    let targetRole: AnimationRole;

    /** Single source of truth for the wire-format anim token (see {@link deriveWireAnimToken}). */
    if (characterState === CHARACTER_STATES.IN_AIR && !this.isJumpDelayed) {
      targetAnimationName = this.currentCharacter.animations.jump;
      targetRole = 'jump';
    } else if (isMoving) {
      targetAnimationName = this.currentCharacter.animations.walk;
      targetRole = 'walk';
    } else {
      targetAnimationName = this.currentCharacter.animations.idle;
      targetRole = 'idle';
    }
    this.currentRole = targetRole;

    // If the current clip was disposed (e.g. after a character switch), clear stale state
    if (
      this.currentAnimation != null &&
      this.scene.getAnimationGroupByName(this.currentAnimation) == null
    ) {
      this.currentAnimation = null;
      this.previousAnimation = null;
      this.isBlending = false;
    }

    const targetGroup = this.findAnimationGroup(targetAnimationName);
    const targetResolvedName = targetGroup?.name ?? null;

    // Same clip name as before — skip only if that group is actually playing (after character
    // switch we may have stopped clips while `currentAnimation` was reset, or duplicate names).
    if (
      targetResolvedName !== null &&
      this.currentAnimation === targetResolvedName &&
      !this.isBlending
    ) {
      const grp = this.scene.getAnimationGroupByName(targetResolvedName);
      if (grp?.isPlaying === true) {
        return;
      }
      this.currentAnimation = null;
    }

    // If no animation is currently playing, start the target animation
    if (this.currentAnimation == null) {
      this.startAnimation(targetAnimationName);
      return;
    }

    // If we're already blending, let the blend complete
    if (this.isBlending) {
      return;
    }

    // If the character has animationBlend set to 0, skip weighted blending
    if (this.currentCharacter.animationBlend === 0) {
      this.switchAnimationDirectly(targetAnimationName);
      return;
    }

    // Start weighted blending between current and target animation
    this.startWeightedBlend(targetAnimationName);
  }

  /**
   * Triggers a specific animation by name (key-triggered custom configs on `Character.animations`).
   * Uses the same tagged-group resolution as locomotion so cached multi-character scenes pick
   * the correct GLB’s clip. Re-fires after a **non-looping** clip has finished (`!isPlaying`).
   */
  public playAnimation(animationName: string, loop: boolean): void {
    const targetAnimation = this.findAnimationGroup(animationName);
    if (!targetAnimation) {
      return;
    }

    if (this.currentAnimation === targetAnimation.name && targetAnimation.isPlaying) {
      return;
    }

    /** Custom-key clip is not part of the locomotion role set; clear so the wire path falls back. */
    this.currentRole = null;
    this.startAnimation(targetAnimation.name, loop);
  }

  /**
   * Finds an animation group by exact, partial, or known fallback naming.
   */
  private findAnimationGroup(animationName: string): BABYLON.AnimationGroup | null {
    if (this.animationCache.has(animationName)) {
      const cached = this.animationCache.get(animationName);
      if (cached != null && this.scene.animationGroups.includes(cached)) {
        return cached;
      }
      this.animationCache.delete(animationName);
    }

    // First try exact name
    let animation = this.scene.getAnimationGroupByName(animationName);

    // Then try partial name matching
    animation ??=
      this.scene.animationGroups.find(
        (anim: BABYLON.AnimationGroup) =>
          anim.name.toLowerCase().includes(animationName.toLowerCase()) ||
          animationName.toLowerCase().includes(anim.name.toLowerCase())
      ) ?? null;

    // Finally, try common movement-state fallbacks
    if (!animation) {
      if (animationName.toLowerCase().includes('idle')) {
        animation =
          this.scene.animationGroups.find(
            (anim: BABYLON.AnimationGroup) =>
              anim.name.toLowerCase().includes('idle') || anim.name.toLowerCase().includes('stand')
          ) ?? null;
      } else if (animationName.toLowerCase().includes('walk')) {
        animation =
          this.scene.animationGroups.find(
            (anim: BABYLON.AnimationGroup) =>
              anim.name.toLowerCase().includes('walk') ||
              anim.name.toLowerCase().includes('run') ||
              anim.name.toLowerCase().includes('move')
          ) ?? null;
      } else if (animationName.toLowerCase().includes('jump')) {
        animation =
          this.scene.animationGroups.find(
            (anim: BABYLON.AnimationGroup) =>
              anim.name.toLowerCase().includes('jump') ||
              anim.name.toLowerCase().includes('leap') ||
              anim.name.toLowerCase().includes('hop')
          ) ?? null;
      }
    }

    if (animation) {
      const resolved = this.resolveTaggedForCurrentCharacter(animationName, animation) ?? animation;
      this.animationCache.set(animationName, resolved);
      return resolved;
    }
    return animation;
  }

  /**
   * Prefer clips tagged for the active playable character so cached swaps do not drive
   * the wrong skeleton when multiple GLBs share names (`idle`, `walk`, or identical custom
   * / emote names across characters). Custom clips from the same import are tagged too.
   */
  private resolveTaggedForCurrentCharacter(
    animationName: string,
    fallback: BABYLON.AnimationGroup | null
  ): BABYLON.AnimationGroup | null {
    const char = this.currentCharacter;
    if (!char) {
      return fallback;
    }

    const tagged = this.scene.animationGroups.filter((g) => {
      const meta = g.metadata ?? {};
      return meta[CHARACTER_ANIM_META_KEY] === char.name;
    });
    if (tagged.length === 0) {
      return fallback;
    }

    const resolveFrom = (pool: BABYLON.AnimationGroup[]): BABYLON.AnimationGroup | null => {
      let anim = pool.find((a) => a.name === animationName) ?? null;
      anim ??=
        pool.find(
          (a) =>
            a.name.toLowerCase().includes(animationName.toLowerCase()) ||
            animationName.toLowerCase().includes(a.name.toLowerCase())
        ) ?? null;

      if (!anim) {
        if (animationName.toLowerCase().includes('idle')) {
          anim =
            pool.find(
              (a) => a.name.toLowerCase().includes('idle') || a.name.toLowerCase().includes('stand')
            ) ?? null;
        } else if (animationName.toLowerCase().includes('walk')) {
          anim =
            pool.find(
              (a) =>
                a.name.toLowerCase().includes('walk') ||
                a.name.toLowerCase().includes('run') ||
                a.name.toLowerCase().includes('move')
            ) ?? null;
        } else if (animationName.toLowerCase().includes('jump')) {
          anim =
            pool.find(
              (a) =>
                a.name.toLowerCase().includes('jump') ||
                a.name.toLowerCase().includes('leap') ||
                a.name.toLowerCase().includes('hop')
            ) ?? null;
        }
      }
      return anim;
    };

    return resolveFrom(tagged) ?? fallback;
  }

  /**
   * Animation groups owned by the LOCAL character.
   *
   * Filters `scene.animationGroups` by {@link CHARACTER_ANIM_META_KEY} === current character name.
   * Remote peer GLB clips imported in {@link remote_peer_proxy} are NOT tagged, so they are correctly
   * excluded — local controller must never stop/start groups it does not own.
   */
  private getOwnedAnimationGroups(): BABYLON.AnimationGroup[] {
    const char = this.currentCharacter;
    if (!char) {
      return [];
    }
    return this.scene.animationGroups.filter((g) => {
      const meta = g.metadata ?? {};
      return meta[CHARACTER_ANIM_META_KEY] === char.name;
    });
  }

  /**
   * Starts a new animation directly (no blending)
   */
  private startAnimation(animationName: string, loop = true): void {
    const animation = this.findAnimationGroup(animationName);

    if (!animation) {
      return;
    }

    /** Scope stops to LOCAL-owned groups only — never touch remote peer clips. */
    for (const anim of this.getOwnedAnimationGroups()) {
      if (anim !== animation) {
        anim.stop();
      }
    }

    animation.weight = 1.0;
    animation.start(loop);
    this.currentAnimation = animation.name;
    this.previousAnimation = null;
    this.isBlending = false;
  }

  /**
   * Switches animation directly without blending
   */
  private switchAnimationDirectly(targetAnimation: string): void {
    if (this.currentAnimation == null) return;
    const currentAnim = this.scene.getAnimationGroupByName(this.currentAnimation);
    const targetAnim = this.findAnimationGroup(targetAnimation);

    if (!currentAnim || !targetAnim) {
      return;
    }

    // Stop current animation
    currentAnim.stop();

    // Start target animation
    targetAnim.start(true);

    this.previousAnimation = this.currentAnimation;
    this.currentAnimation = targetAnim.name; // Use the actual animation name
    this.isBlending = false;
  }

  /**
   * Starts weighted blending between two animations
   */
  private startWeightedBlend(targetAnimation: string): void {
    if (this.currentAnimation == null) return;
    const currentAnim = this.scene.getAnimationGroupByName(this.currentAnimation);
    const targetAnim = this.findAnimationGroup(targetAnimation);

    if (!currentAnim || !targetAnim) {
      return;
    }

    // For now, use a simpler approach: start both animations with different weights
    // and gradually adjust them over time
    currentAnim.start(true);
    targetAnim.start(true);

    // Set initial weights
    currentAnim.weight = 1.0;
    targetAnim.weight = 0.0;

    // Set up blend state
    this.previousAnimation = this.currentAnimation;
    this.currentAnimation = targetAnim.name; // Use the actual animation name
    this.blendStartTime = Date.now();
    this.isBlending = true;
  }

  /**
   * Updates the weighted animation blend weights
   */
  public updateBlend(): void {
    if (!this.isBlending) return;

    const elapsedTime = Date.now() - this.blendStartTime;
    const blendProgress = Math.min(elapsedTime / this.blendDuration, 1.0);

    // Calculate weights using smooth easing
    const previousWeight = 1.0 - this.easeInOutCubic(blendProgress);
    const currentWeight = this.easeInOutCubic(blendProgress);

    // Update animation weights
    if (this.previousAnimation != null && this.currentAnimation != null) {
      const previousAnim = this.scene.getAnimationGroupByName(this.previousAnimation);
      const currentAnim = this.scene.getAnimationGroupByName(this.currentAnimation);

      if (previousAnim && currentAnim) {
        // Update weights directly on the animation groups
        previousAnim.weight = previousWeight;
        currentAnim.weight = currentWeight;
      }
    }

    // Check if blend is complete
    if (blendProgress >= 1.0) {
      this.completeBlend();
    }
  }

  /**
   * Completes the animation blend
   */
  private completeBlend(): void {
    if (this.currentAnimation == null) return;

    // Stop the previous animation
    if (this.previousAnimation != null) {
      const previousAnim = this.scene.getAnimationGroupByName(this.previousAnimation);
      if (previousAnim) {
        previousAnim.stop();
      }
    }

    // Ensure the target animation is running with full weight
    const targetAnim = this.scene.getAnimationGroupByName(this.currentAnimation);
    if (targetAnim) {
      targetAnim.weight = 1.0;
    }

    // Reset blend state
    this.isBlending = false;
    this.previousAnimation = null;
  }

  /**
   * Smooth easing function for animation blending
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Stops all LOCAL-owned animations.
   *
   * Scoped to {@link getOwnedAnimationGroups} so remote peer clips are not silenced.
   */
  public stopAllAnimations(): void {
    for (const anim of this.getOwnedAnimationGroups()) {
      anim.stop();
    }

    this.currentAnimation = null;
    this.previousAnimation = null;
    this.isBlending = false;
  }

  /**
   * Handles jump delay logic to avoid awkward jump transitions
   */
  private handleJumpDelay(characterState?: CharacterState): void {
    if (!this.currentCharacter || !characterState) return;

    const jumpDelay = this.currentCharacter.jumpDelay ?? 100; // Default to 100ms

    // Check if we just entered IN_AIR state
    if (
      characterState === CHARACTER_STATES.IN_AIR &&
      this.lastCharacterState !== CHARACTER_STATES.IN_AIR
    ) {
      // Start jump delay
      this.isJumpDelayed = true;
      this.jumpDelayStartTime = Date.now();
    }
    // Check if we left IN_AIR state
    else if (
      characterState !== CHARACTER_STATES.IN_AIR &&
      this.lastCharacterState === CHARACTER_STATES.IN_AIR
    ) {
      // Reset jump delay when leaving air state
      this.isJumpDelayed = false;
      this.jumpDelayStartTime = 0;
    }
    // Check if jump delay has expired
    else if (this.isJumpDelayed && characterState === CHARACTER_STATES.IN_AIR) {
      const elapsedTime = Date.now() - this.jumpDelayStartTime;
      if (elapsedTime >= jumpDelay) {
        this.isJumpDelayed = false;
      }
    }

    // Update last character state
    this.lastCharacterState = characterState;
  }

  /**
   * Gets the current animation state
   */
  public getCurrentAnimation(): string | null {
    return this.currentAnimation;
  }

  /**
   * Semantic role of the currently-playing locomotion clip.
   *
   * Reflects what the local avatar is actually rendering — used by the multiplayer
   * wire-format builders so remote viewers never see a state the local user does
   * not (e.g. jump pop-ins from terrain micro-bumps that {@link handleJumpDelay}
   * intentionally suppresses). Returns `null` until the first locomotion update
   * runs after a character switch, or while a custom-key clip is active.
   */
  public getCurrentRole(): AnimationRole {
    return this.currentRole;
  }

  /**
   * Checks if currently blending animations
   */
  public isCurrentlyBlending(): boolean {
    return this.isBlending;
  }

  /**
   * Normalized phase [0, 1] of the active AnimationGroup clip (BGS-MP-SYNC §5.1.1).
   */
  public getNormalizedPlaybackPhase(): number {
    const name = this.currentAnimation;
    if (!name) {
      return 0;
    }
    const group = this.scene.getAnimationGroupByName(name);
    if (!group?.isPlaying || group.animatables.length === 0) {
      return 0;
    }
    const animatable = group.animatables[0];
    if (!animatable) {
      return 0;
    }
    const from = animatable.fromFrame;
    const to = animatable.toFrame;
    const span = Math.max(to - from, 1e-9);
    const mf = animatable.masterFrame;
    return Math.min(1, Math.max(0, (mf - from) / span));
  }
}
