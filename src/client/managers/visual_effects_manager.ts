/**
 * Visual Effects Manager - Handles particle systems and glow effects
 */

// /// <reference path="../types/babylon.d.ts" />

import { CONFIG } from '../config/game_config';
import { fixParticleSystemTexture, fixParticleSystemsInSet } from '../utils/particle_texture_url';

/**
 * Result type for glow effect operations
 */
export type GlowResult =
  | { success: true; material: null }
  | { success: false; error: string; details?: string };

export class VisualEffectsManager {
  private static activeParticleSystems = new Map<string, BABYLON.IParticleSystem>();
  private static environmentParticleSystems = new Map<string, BABYLON.IParticleSystem>();
  private static itemParticleSystems = new Map<string, BABYLON.IParticleSystem>();
  private static scene: BABYLON.Scene | null = null;
  private static originalEdgeSettings = new Map<
    string,
    { width?: number; color?: BABYLON.Color4; enabled?: boolean }
  >();

  /**
   * Initializes the VisualEffectsManager with a scene
   * @param scene The Babylon.js scene
   */
  public static initialize(scene: BABYLON.Scene): void {
    this.scene = scene;
  }

  /**
   * Creates a particle system from a snippet by name
   * @param snippetName Name of the particle snippet to create
   * @param emitter Optional emitter (mesh or position) for the particle system
   * @param options Optional configuration including targetStopDuration
   * @returns The created particle system or null if not found
   */
  public static async createParticleSystem(
    snippetName: string,
    emitter?: BABYLON.AbstractMesh | BABYLON.Vector3,
    options?: { targetStopDuration?: number }
  ): Promise<BABYLON.IParticleSystem | null> {
    if (!this.scene) {
      return null;
    }

    const snippet = CONFIG.EFFECTS.PARTICLE_SNIPPETS.find((s) => s.name === snippetName);
    if (!snippet) {
      return null;
    }

    try {
      let particleSystem: BABYLON.IParticleSystem | null = null;

      // Handle different particle system types using discriminated union
      if (snippet.type === 'legacy') {
        // Parse legacy particle system from snippet
        particleSystem = await BABYLON.ParticleHelper.ParseFromSnippetAsync(
          snippet.snippetId,
          this.scene
        );
        fixParticleSystemTexture(particleSystem, this.scene);
      } else if (snippet.type === 'nodes') {
        // Parse node particle system set from snippet
        const nodeParticleSystemSet = await BABYLON.NodeParticleSystemSet.ParseFromSnippetAsync(
          snippet.snippetId
        );
        const particleSystemSet = await nodeParticleSystemSet.buildAsync(this.scene);
        fixParticleSystemsInSet(particleSystemSet, this.scene);
        particleSystemSet.start();

        // Get the first particle system from the set to return
        // Check if systems property exists and has elements
        if ('systems' in particleSystemSet) {
          const systemsProperty = particleSystemSet.systems;
          if (Array.isArray(systemsProperty) && systemsProperty.length > 0) {
            const firstSystem = systemsProperty[0];
            // Verify firstSystem has required IParticleSystem properties
            if (
              firstSystem &&
              'start' in firstSystem &&
              'stop' in firstSystem &&
              'emitter' in firstSystem &&
              'name' in firstSystem
            ) {
              // TypeScript should accept this as IParticleSystem based on property checks
              particleSystem = firstSystem;
            } else {
              return null;
            }
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        return null;
      }

      if (!particleSystem) {
        return null;
      }

      // Set emitter if provided
      if (emitter) {
        particleSystem.emitter = emitter;
      }

      // Start the particle system
      particleSystem.start();

      // Store reference for cleanup
      this.activeParticleSystems.set(snippetName, particleSystem);

      // Auto-stop after targetStopDuration if specified
      if (options?.targetStopDuration) {
        setTimeout(() => {
          particleSystem?.stop();
        }, options.targetStopDuration);
      }

      return particleSystem;
    } catch (error) {
      console.error(`Failed to create particle system "${snippetName}":`, error);
      return null;
    }
  }

  /**
   * Creates a particle system at a specific position
   * @param snippetName Name of the particle snippet
   * @param position Position to create the particle system at
   * @param options Optional configuration
   * @returns The created particle system or null
   */
  public static async createParticleSystemAt(
    snippetName: string,
    position: BABYLON.Vector3,
    options?: { targetStopDuration?: number }
  ): Promise<BABYLON.IParticleSystem | null> {
    return this.createParticleSystem(snippetName, position, options);
  }

  /**
   * Removes a particle system by name
   * @param name The name of the particle system to remove
   */
  public static removeParticleSystem(name: string): void {
    const particleSystem = this.activeParticleSystems.get(name);
    if (particleSystem) {
      particleSystem.stop();
      particleSystem.dispose();
      this.activeParticleSystems.delete(name);
    }
  }

  /**
   * Removes all environment particle systems
   */
  public static removeEnvironmentParticles(): void {
    for (const [, particleSystem] of this.environmentParticleSystems) {
      particleSystem.stop();
      particleSystem.dispose();
    }
    this.environmentParticleSystems.clear();
  }

  /**
   * Removes all item particle systems
   */
  public static removeItemParticles(): void {
    for (const [, particleSystem] of this.itemParticleSystems) {
      particleSystem.stop();
      particleSystem.dispose();
    }
    this.itemParticleSystems.clear();
  }

  /**
   * Applies a glow effect to a mesh
   * @param identifier The mesh or mesh name to apply glow to
   * @param edgeColor The color of the glow edges
   * @param edgeWidth The width of the glow edges
   * @returns Result indicating success or failure
   */
  public static applyGlow(
    identifier: BABYLON.Mesh | string,
    edgeColor: BABYLON.Color4 = new BABYLON.Color4(1, 0, 0, 1),
    edgeWidth = 5
  ): GlowResult {
    if (!this.scene) {
      return {
        success: false,
        error: 'Scene not initialized',
        details: 'VisualEffectsManager.initialize() must be called first'
      };
    }

    const meshName = typeof identifier === 'string' ? identifier : identifier.name;
    const mesh = this.getMeshFromIdentifier(identifier);
    if (!mesh) {
      return {
        success: false,
        error: 'Mesh not found',
        details: `Mesh with name "${meshName}" not found in scene`
      };
    }

    try {
      const meshKey = mesh.name;

      // Store original edge settings if they exist
      const originalSettings: { width?: number; color?: BABYLON.Color4; enabled?: boolean } = {};

      // Detect if edge rendering is already enabled BEFORE we enable it
      // Check if edgesWidth is set and > 0, which indicates edges are enabled
      let edgesWereEnabled = false;
      if ('edgesWidth' in mesh) {
        const edgesWidthValue = mesh.edgesWidth;
        if (typeof edgesWidthValue === 'number' && edgesWidthValue > 0) {
          edgesWereEnabled = true;
          originalSettings.width = edgesWidthValue;
        }
      }
      if ('edgesColor' in mesh) {
        const edgesColorValue = mesh.edgesColor;
        if (edgesColorValue instanceof BABYLON.Color4) {
          originalSettings.color = edgesColorValue.clone();
        }
      }
      originalSettings.enabled = edgesWereEnabled;

      // Store original settings for restoration
      this.originalEdgeSettings.set(meshKey, originalSettings);

      // Enable edge rendering on the mesh/instance directly
      mesh.enableEdgesRendering();

      // Set edge width
      mesh.edgesWidth = edgeWidth;

      // Set edge color
      mesh.edgesColor = edgeColor;

      return { success: true, material: null };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to apply glow',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Removes glow effect from a mesh
   * @param identifier The mesh or mesh name to remove glow from
   * @returns Result indicating success or failure
   */
  public static removeGlow(identifier: BABYLON.Mesh | string): GlowResult {
    if (!this.scene) {
      return {
        success: false,
        error: 'Scene not initialized',
        details: 'VisualEffectsManager.initialize() must be called first'
      };
    }

    const mesh = this.getMeshFromIdentifier(identifier);
    if (!mesh) {
      const meshName = typeof identifier === 'string' ? identifier : identifier.name;
      return {
        success: false,
        error: 'Mesh not found',
        details: `Mesh with name "${meshName}" not found in scene`
      };
    }

    try {
      const meshKey = mesh.name;
      const originalSettings = this.originalEdgeSettings.get(meshKey);

      if (originalSettings) {
        // Restore original edge settings
        if (originalSettings.enabled === false) {
          // Edges were not enabled before, disable them
          mesh.disableEdgesRendering();
        } else {
          // Edges were enabled, restore original width and color
          mesh.enableEdgesRendering();
          if (originalSettings.width !== undefined) {
            mesh.edgesWidth = originalSettings.width;
          }
          if (originalSettings.color) {
            mesh.edgesColor = originalSettings.color;
          }
        }

        // Remove from stored settings
        this.originalEdgeSettings.delete(meshKey);
      } else {
        // No original settings stored, just disable edges
        mesh.disableEdgesRendering();
      }

      return { success: true, material: null };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to remove glow',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Gets a mesh from an identifier (mesh or string)
   * @param identifier The mesh or mesh name
   * @returns The mesh or null if not found
   */
  private static getMeshFromIdentifier(identifier: BABYLON.Mesh | string): BABYLON.Mesh | null {
    if (typeof identifier === 'string') {
      return (this.scene?.getMeshByName(identifier) as BABYLON.Mesh) ?? null;
    }
    return identifier;
  }
}
