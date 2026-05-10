// ============================================================================
// ENVIRONMENT LOCK UTILITY
// ============================================================================
// Provides globally accessible, MDC-compliant utility for runtime environment locking
// ============================================================================

import { ASSETS } from '../config/assets';

import type { Environment } from '../types/environment';

interface EnvironmentLockUiHooks {
  getCurrentEnvironmentName(): string | null;
  getLastSelectedEnvironmentName(): string | null;
  changeEnvironment(name: string): void | Promise<void>;
  regenerateSections(): void;
}

export class EnvironmentLock {
  // Map to track runtime lock state (since ASSETS is 'as const' and cannot be mutated)
  private static environmentLockState = new Map<string, boolean>();
  private static uiHooks: EnvironmentLockUiHooks | null = null;

  public static setUiHooks(hooks: EnvironmentLockUiHooks | null): void {
    this.uiHooks = hooks;
  }

  /**
   * Sets the runtime lock state for an environment by name
   * Triggers reactive UI refresh of Settings UI dropdown
   * If locking the current environment, automatically switches to last selected environment if unlocked,
   * otherwise switches to the first available unlocked environment
   * @param name - Environment name
   * @param locked - true to lock, false to unlock
   */
  public static setEnvironmentLocked(name: string, locked: boolean): void {
    // Validate environment exists
    const environment = ASSETS.ENVIRONMENTS.find((e: Environment) => e.name === name);
    if (!environment) {
      return; // Environment not found, silently ignore
    }

    // Update runtime lock state
    this.environmentLockState.set(name, locked);

    // If locking the current environment, switch to an unlocked environment
    if (locked) {
      const currentEnvironmentName = this.uiHooks?.getCurrentEnvironmentName() ?? null;
      if (currentEnvironmentName === name) {
        // Try to get the last selected environment if unlocked
        const lastSelectedEnvironment = this.getLastSelectedEnvironmentIfUnlocked();
        if (lastSelectedEnvironment !== null) {
          void this.uiHooks?.changeEnvironment(lastSelectedEnvironment.name);
        } else {
          // Fall back to first unlocked environment
          const firstUnlockedEnvironment = this.getFirstUnlockedEnvironment();
          if (firstUnlockedEnvironment !== null) {
            void this.uiHooks?.changeEnvironment(firstUnlockedEnvironment.name);
          }
        }
      }
    }

    // Trigger reactive UI refresh of Settings UI dropdown
    this.uiHooks?.regenerateSections();
  }

  /**
   * Checks if an environment is locked
   * Returns true if environment's default locked property is true OR runtime Map has it locked
   * @param name - Environment name
   * @returns true if locked, false otherwise
   */
  public static isEnvironmentLocked(name: string): boolean {
    // Check runtime lock state first (takes precedence)
    const runtimeState = this.environmentLockState.get(name);
    if (runtimeState !== undefined) {
      return runtimeState;
    }

    // Check environment's default locked property
    const environment = ASSETS.ENVIRONMENTS.find((e: Environment) => e.name === name);
    if (environment) {
      return !!environment.locked;
    }

    // Environment not found, assume unlocked
    return false;
  }

  /**
   * Gets the runtime lock state from Map (returns undefined if not set)
   * Useful for checking if runtime state differs from default
   * @param name - Environment name
   * @returns runtime lock state or undefined if not set
   */
  public static getEnvironmentLockState(name: string): boolean | undefined {
    return this.environmentLockState.get(name);
  }

  /**
   * Removes runtime lock state, reverting to default locked property
   * Clears the entry from the Map
   * @param name - Environment name
   */
  public static resetEnvironmentLock(name: string): void {
    this.environmentLockState.delete(name);
    // Trigger reactive UI refresh
    this.uiHooks?.regenerateSections();
  }

  /**
   * Gets the first unlocked environment from ASSETS.ENVIRONMENTS
   * @returns First unlocked environment or null if all are locked
   */
  private static getFirstUnlockedEnvironment(): Environment | null {
    for (const environment of ASSETS.ENVIRONMENTS) {
      if (!this.isEnvironmentLocked(environment.name)) {
        return environment;
      }
    }
    return null;
  }

  /**
   * Gets the last selected environment if it's unlocked
   * @returns Last selected environment if unlocked, otherwise null
   */
  private static getLastSelectedEnvironmentIfUnlocked(): Environment | null {
    const lastSelectedName = this.uiHooks?.getLastSelectedEnvironmentName() ?? null;
    if (lastSelectedName === null) {
      return null;
    }

    const environment = ASSETS.ENVIRONMENTS.find((e: Environment) => e.name === lastSelectedName);
    if (environment && !this.isEnvironmentLocked(environment.name)) {
      return environment;
    }

    return null;
  }
}
