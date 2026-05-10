// ============================================================================
// CHARACTER LOCK UTILITY
// ============================================================================
// Provides globally accessible, MDC-compliant utility for runtime character locking
// ============================================================================

import { ASSETS } from '../config/assets';

import type { Character } from '../types/character';

interface CharacterLockUiHooks {
  getCurrentCharacterName(): string | null;
  getLastSelectedCharacterName(): string | null;
  changeCharacter(name: string): void;
  regenerateSections(): void;
}

export class CharacterLock {
  // Map to track runtime lock state (since ASSETS is 'as const' and cannot be mutated)
  private static characterLockState = new Map<string, boolean>();
  private static uiHooks: CharacterLockUiHooks | null = null;

  public static setUiHooks(hooks: CharacterLockUiHooks | null): void {
    this.uiHooks = hooks;
  }

  /**
   * Sets the runtime lock state for a character by name
   * Triggers reactive UI refresh of Settings UI dropdown
   * If locking the current character, automatically switches to last selected character if unlocked,
   * otherwise switches to the first available unlocked character
   * @param name - Character name
   * @param locked - true to lock, false to unlock
   */
  public static setCharacterLocked(name: string, locked: boolean): void {
    // Validate character exists
    const character = ASSETS.CHARACTERS.find((c: Character) => c.name === name);
    if (!character) {
      return; // Character not found, silently ignore
    }

    // Update runtime lock state
    this.characterLockState.set(name, locked);

    // If locking the current character, switch to an unlocked character
    if (locked) {
      const currentCharacterName = this.uiHooks?.getCurrentCharacterName() ?? null;
      if (currentCharacterName === name) {
        // Try to get the last selected character if unlocked
        const lastSelectedCharacter = this.getLastSelectedCharacterIfUnlocked();
        if (lastSelectedCharacter !== null) {
          this.uiHooks?.changeCharacter(lastSelectedCharacter.name);
        } else {
          // Fall back to first unlocked character
          const firstUnlockedCharacter = this.getFirstUnlockedCharacter();
          if (firstUnlockedCharacter !== null) {
            this.uiHooks?.changeCharacter(firstUnlockedCharacter.name);
          }
        }
      }
    }

    // Trigger reactive UI refresh of Settings UI dropdown
    this.uiHooks?.regenerateSections();
  }

  /**
   * Checks if a character is locked
   * Returns true if character's default locked property is true OR runtime Map has it locked
   * @param name - Character name
   * @returns true if locked, false otherwise
   */
  public static isCharacterLocked(name: string): boolean {
    // Check runtime lock state first (takes precedence)
    const runtimeState = this.characterLockState.get(name);
    if (runtimeState !== undefined) {
      return runtimeState;
    }

    // Check character's default locked property
    const character = ASSETS.CHARACTERS.find((c: Character) => c.name === name);
    if (character) {
      return character.locked;
    }

    // Character not found, assume unlocked
    return false;
  }

  /**
   * Gets the runtime lock state from Map (returns undefined if not set)
   * Useful for checking if runtime state differs from default
   * @param name - Character name
   * @returns runtime lock state or undefined if not set
   */
  public static getCharacterLockState(name: string): boolean | undefined {
    return this.characterLockState.get(name);
  }

  /**
   * Removes runtime lock state, reverting to default locked property
   * Clears the entry from the Map
   * @param name - Character name
   */
  public static resetCharacterLock(name: string): void {
    this.characterLockState.delete(name);
    // Trigger reactive UI refresh
    this.uiHooks?.regenerateSections();
  }

  /**
   * Gets the first unlocked character from ASSETS.CHARACTERS
   * @returns First unlocked character or null if all are locked
   */
  private static getFirstUnlockedCharacter(): Character | null {
    for (const character of ASSETS.CHARACTERS) {
      if (!this.isCharacterLocked(character.name)) {
        return character;
      }
    }
    return null;
  }

  /**
   * Gets the last selected character if it's unlocked
   * @returns Last selected character if unlocked, otherwise null
   */
  private static getLastSelectedCharacterIfUnlocked(): Character | null {
    const lastSelectedName = this.uiHooks?.getLastSelectedCharacterName() ?? null;
    if (lastSelectedName === null) {
      return null;
    }

    const character = ASSETS.CHARACTERS.find((c: Character) => c.name === lastSelectedName);
    if (character && !this.isCharacterLocked(character.name)) {
      return character;
    }

    return null;
  }
}
