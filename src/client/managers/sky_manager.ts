// ============================================================================
// SKY MANAGER
// ============================================================================

import type { SkyConfig } from '../types/environment';

export class SkyManager {
  private static sky: BABYLON.Mesh | null = null;
  private static skyTexture: BABYLON.Texture | null = null;

  /**
   * Creates and applies a sky to the scene
   * @param scene The Babylon.js scene
   * @param skyConfig Sky configuration object
   * @returns The created sky mesh
   */
  public static createSky(scene: BABYLON.Scene, skyConfig: SkyConfig): BABYLON.Mesh {
    // Remove existing sky if present
    this.removeSky(scene);

    // Create sky texture
    this.skyTexture = new BABYLON.Texture(skyConfig.TEXTURE_URL, scene);

    // Apply blur if specified
    if (skyConfig.BLUR > 0) {
      this.skyTexture.level = skyConfig.BLUR;
    }

    // Create sky based on type
    if (skyConfig.TYPE.toUpperCase() === 'SPHERE') {
      this.createSkySphere(scene, skyConfig.ROTATION_Y);
    } else {
      this.createSkyBox(scene, skyConfig.ROTATION_Y);
    }

    if (!this.sky) throw new Error('Sky not initialized');
    return this.sky;
  }

  /**
   * Creates a sky sphere (360-degree sphere)
   * @param scene The Babylon.js scene
   * @param rotationY Y-axis rotation in radians
   */
  private static createSkySphere(scene: BABYLON.Scene, rotationY: number): void {
    // Create sphere mesh
    this.sky = BABYLON.MeshBuilder.CreateSphere(
      'skySphere',
      {
        diameter: 1000.0,
        segments: 32
      },
      scene
    );

    // Create sky material for sphere
    const skyMaterial = new BABYLON.StandardMaterial('skySphere', scene);
    skyMaterial.backFaceCulling = false;
    skyMaterial.diffuseTexture = this.skyTexture;
    skyMaterial.disableLighting = true;
    skyMaterial.emissiveTexture = this.skyTexture;
    skyMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);

    // Apply material to sky
    this.sky.material = skyMaterial;

    // Fix upside-down issue by rotating 180 degrees around X-axis
    this.sky.rotation.x = Math.PI;

    // Apply additional rotation
    if (rotationY !== 0) {
      this.sky.rotation.y = rotationY;
    }
  }

  /**
   * Creates a sky box (standard cube skybox)
   * @param scene The Babylon.js scene
   * @param rotationY Y-axis rotation in radians
   */
  private static createSkyBox(scene: BABYLON.Scene, rotationY: number): void {
    // Set texture coordinates mode for cube skybox
    if (!this.skyTexture) throw new Error('Sky texture not initialized');
    this.skyTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;

    // Create box mesh
    this.sky = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 1000.0 }, scene);

    // Create sky material for box
    const skyMaterial = new BABYLON.StandardMaterial('skyBox', scene);
    skyMaterial.backFaceCulling = false;
    skyMaterial.diffuseTexture = this.skyTexture;
    skyMaterial.disableLighting = true;
    skyMaterial.emissiveTexture = this.skyTexture;
    skyMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);

    // Apply material to sky
    this.sky.material = skyMaterial;

    // Apply rotation
    if (rotationY !== 0) {
      this.sky.rotation.y = rotationY;
    }
  }

  /**
   * Removes the sky from the scene
   * @param scene The Babylon.js scene
   */
  public static removeSky(scene: BABYLON.Scene): void {
    void scene;
    if (this.sky) {
      this.sky.dispose();
      this.sky = null;
    }

    if (this.skyTexture) {
      this.skyTexture.dispose();
      this.skyTexture = null;
    }
  }
}
