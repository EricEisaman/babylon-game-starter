// ============================================================================
// ASSETS CONFIGURATION
// ============================================================================

import { OBJECT_ROLE } from '../types/environment';

import type { BehaviorConfig } from '../types/behaviors';
import type { Character } from '../types/character';
import type { EffectType } from '../types/effects';
import type {
  Environment,
  LightType,
  LightmappedMesh,
  PhysicsObject,
  SkyType
} from '../types/environment';

const EMPTY_LIGHTMAPPED_MESHES: readonly LightmappedMesh[] = [];
const EMPTY_PHYSICS_OBJECTS: readonly PhysicsObject[] = [];

/**
 * Circuit-hijack SynapticLab layout (monochrome.glb + cue zones + collectibles).
 * Loaded when `?sim=1` or `CONFIG.SIMULATION.ENABLED`.
 */
export const SIMULATION_LAB_ENVIRONMENT_NAME = 'SynapticLab';

const LEVEL_TEST_LIGHTMAPPED_MESHES = [
  { name: 'level_primitive0', level: 1.6 },
  { name: 'level_primitive1', level: 1.6 },
  { name: 'level_primitive2', level: 1.6 }
] as const satisfies readonly LightmappedMesh[];

/** Level Test interactive props (includes seesaw Cube.006 PIVOT_BEAM + Cube.007 anchor). */
const LEVEL_TEST_PHYSICS_OBJECTS = [
  {
    name: 'Cube',
    mass: 0.1,
    scale: 1,
    role: OBJECT_ROLE.DYNAMIC_BOX,
    effect: 'GLOW' satisfies EffectType
  },
  { name: 'Cube.001', mass: 0.1, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX },
  { name: 'Cube.002', mass: 0.1, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX },
  { name: 'Cube.003', mass: 0.1, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX },
  { name: 'Cube.004', mass: 0.1, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX },
  { name: 'Cube.005', mass: 0.1, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX },
  { name: 'Cube.006', mass: 0.01, scale: 1, role: OBJECT_ROLE.PIVOT_BEAM },
  { name: 'Cube.007', mass: 0, scale: 1, role: OBJECT_ROLE.DYNAMIC_BOX }
] as const satisfies readonly PhysicsObject[];

export const ASSETS = {
  CHARACTERS: [
    {
      name: 'Red',
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/characters/amongUs/red.glb',
      locked: false,
      animations: {
        idle: 'idle',
        walk: 'walk',
        jump: 'jump'
      },
      scale: 1,
      mass: 1.0, // Standard weight
      height: 1.8,
      radius: 0.6,
      speed: {
        inAir: 25.0,
        onGround: 25.0,
        boostMultiplier: 8.0
      },
      jumpHeight: 2.0,
      rotationSpeed: 0.05, // radians
      rotationSmoothing: 0.2,
      animationBlend: 200,
      jumpDelay: 200
    },
    {
      name: 'Tech Girl',
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/characters/techGirl/tech_girl_2.glb',
      locked: false,
      animations: {
        idle: 'idle',
        walk: 'run',
        jump: 'jump'
      },
      scale: 1.3,
      mass: 0.8, // Lighter weight for agile character
      height: 1.8,
      radius: 0.55,
      speed: {
        inAir: 30.0, // Faster in air
        onGround: 30.0, // Faster on ground
        boostMultiplier: 8.0
      },
      jumpHeight: 2.5, // Higher jumps
      rotationSpeed: 0.06, // Faster rotation
      rotationSmoothing: 0.15, // Less smoothing for more responsive feel
      animationBlend: 200,
      jumpDelay: 200
    },
    {
      name: 'Lafoofoo',
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/characters/Krysalia.glb',
      locked: false,
      animations: {
        idle: 'idle',
        walk: 'run',
        jump: 'jump'
      },
      scale: 1.35,
      mass: 1.0, // Standard weight
      height: 1.8,
      radius: 0.6,
      speed: {
        inAir: 25.0,
        onGround: 25.0,
        boostMultiplier: 8.0
      },
      jumpHeight: 2.0,
      rotationSpeed: 0.05, // radians
      rotationSmoothing: 0.2,
      animationBlend: 200,
      jumpDelay: 200
    },
    {
      name: 'Zombie',
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/characters/zombie/zombie_2.glb',
      locked: false,
      animations: {
        idle: 'Idle',
        walk: 'Run_InPlace',
        jump: 'Jump'
      },
      scale: 1.35,
      mass: 1.5, // Heavier weight for zombie character
      height: 2.0,
      radius: 0.6,
      speed: {
        inAir: 20.0, // Slower in air
        onGround: 20.0, // Slower on ground
        boostMultiplier: 8.0
      },
      jumpHeight: 2.5, // Lower jumps
      rotationSpeed: 0.04, // Slower rotation
      rotationSmoothing: 0.25, // More smoothing for sluggish feel
      animationBlend: 200,
      jumpDelay: 200
    },
    {
      name: 'Hulk',
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/characters/hulk/hulk.glb',
      locked: true,
      animations: {
        idle: 'idle',
        walk: 'run',
        jump: 'jump'
      },
      scale: 2.0,
      mass: 10.0, // High mass for Hulk character
      height: 2.55,
      radius: 0.95,
      speed: {
        inAir: 30.0,
        onGround: 25.0,
        boostMultiplier: 8.0
      },
      jumpHeight: 11, // Lower jumps
      rotationSpeed: 0.04, // Slower rotation
      rotationSmoothing: 0.25, // More smoothing for sluggish feel
      animationBlend: 200,
      jumpDelay: 200,
      friction: 0.55
    }
  ] satisfies readonly Character[],
  ENVIRONMENTS: [
    {
      name: 'Level Test',
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/environments/levelTest/levelTest.glb',
      lightmap:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/environments/levelTest/lightmap.jpg',
      scale: 1,
      lightmappedMeshes: LEVEL_TEST_LIGHTMAPPED_MESHES,
      physicsObjects: LEVEL_TEST_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/cartoon-river-with-orange-sky.jpg',
        ROTATION_Y: 0,
        BLUR: 0.3,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(3, 0.5, -8),
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      ambientSounds: [
        {
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/audio/ambience/space-ambience.mp3',
          volume: 0.2,
          position: new BABYLON.Vector3(-2, 1, -6),
          rollOff: 2,
          maxDistance: 40
        }
      ],
      particles: [
        {
          name: 'Magic Sparkles',
          position: new BABYLON.Vector3(-2, 0, -8), // Left of player start
          updateSpeed: 0.007,
          instanceName: 'magic-sparkles-particle',
          behavior: {
            triggerKind: 'proximity',
            radius: 3,
            checkPeriod: { type: 'interval', milliseconds: 5000 },
            action: {
              actionType: 'adjustCredits',
              amount: -5
            }
          } satisfies BehaviorConfig
        }
      ],
      items: [
        {
          name: 'Crate',
          url: 'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/items/stylized_crate_asset.glb',
          collectible: true,
          creditValue: 100,
          minImpulseForCollection: 0.5,
          instances: [
            {
              position: new BABYLON.Vector3(1, 0.5, -8),
              scale: 0.5,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5,
              instanceName: 'test-crate',
              behavior: {
                triggerKind: 'proximity',
                triggerOutOfRange: true,
                radius: 4,
                edgeColor: new BABYLON.Color4(0, 1, 0, 1),
                edgeWidth: 10
              } satisfies BehaviorConfig
            },
            {
              position: new BABYLON.Vector3(5, 0.5, -8),
              scale: 0.5,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            },
            {
              position: new BABYLON.Vector3(0, 0.5, -5),
              scale: 0.5,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            },
            {
              position: new BABYLON.Vector3(1, 0.5, -11),
              scale: 0.5,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            },
            {
              position: new BABYLON.Vector3(5, 3.5, -11),
              scale: 0.5,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            }
          ]
        },
        {
          name: 'Super Jump',
          url: 'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/items/jump_collectible.glb',
          collectible: true,
          creditValue: 50,
          minImpulseForCollection: 0.5,
          inventory: true,
          thumbnail:
            'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/thumbnails/jump_collectible_thumb.webp',
          itemEffectKind: 'superJump',
          instances: [
            {
              position: new BABYLON.Vector3(-4, 0.5, -8),
              scale: 0.01,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            }
          ]
        },
        {
          name: 'Invisibility',
          url: 'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/items/invisibility_collectible.glb',
          collectible: true,
          creditValue: 50,
          minImpulseForCollection: 0.5,
          inventory: true,
          thumbnail:
            'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/thumbnails/invisibility_collectible_thumb.webp',
          itemEffectKind: 'invisibility',
          instances: [
            {
              position: new BABYLON.Vector3(6, 0.5, -5),
              scale: 0.01,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.5
            }
          ]
        }
      ]
    },
    {
      // Ported from circuit-hijack SynapticLab @ bfd7160 (neutral BGS action type names).
      name: SIMULATION_LAB_ENVIRONMENT_NAME,
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/monochrome.glb',
      lightmap: '',
      scale: 1,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/cartoon-river-with-orange-sky.jpg',
        ROTATION_Y: 0,
        BLUR: 0.4,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(0, 2.5, 0),
      spawnRotation: new BABYLON.Vector3(0, Math.PI, 0),
      cameraOffset: new BABYLON.Vector3(0, 1.2, -2.5),
      cutScene: {
        type: 'image',
        visualUrl:
          'https://raw.githubusercontent.com/EricEisaman/circuit-hijack/main/resources/Circuit-Hijack-Banner.png',
        fadeInEnabled: true,
        fadeOutEnabled: true,
        fadeDurationMs: 800,
        concurrent: true
      },
      backgroundMusic: {
        url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/audio/ambience/space-ambience.mp3',
        volume: 0.15
      },
      ambientSounds: [
        {
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/audio/ambience/space-ambience.mp3',
          volume: 0.08,
          position: new BABYLON.Vector3(0, 1, 0),
          rollOff: 2,
          maxDistance: 50
        }
      ],
      lights: [
        {
          lightType: 'HEMISPHERIC' satisfies LightType,
          name: 'SynapticLabAmbient',
          direction: new BABYLON.Vector3(0, 1, 0),
          diffuseColor: new BABYLON.Color3(0.55, 0.45, 0.75),
          intensity: 0.85
        },
        {
          lightType: 'POINT' satisfies LightType,
          name: 'AccAnchorLight',
          position: new BABYLON.Vector3(-6, 3, 4),
          diffuseColor: new BABYLON.Color3(0.4, 0.7, 1),
          intensity: 1.2,
          range: 12
        }
      ],
      particles: [
        {
          name: 'Magic Sparkles',
          position: new BABYLON.Vector3(5, 1.5, 3),
          updateSpeed: 0.01,
          instanceName: 'cue-sparkles-1',
          behavior: {
            triggerKind: 'proximity',
            radius: 4,
            checkPeriod: { type: 'interval', milliseconds: 2500 },
            edgeColor: new BABYLON.Color4(1, 0.35, 0.2, 1),
            edgeWidth: 8,
            action: {
              actionType: 'simulationPulse',
              pulseKind: 'craving',
              magnitude: 0.55
            }
          } satisfies BehaviorConfig
        },
        {
          name: 'Hyper',
          position: new BABYLON.Vector3(-4, 1.5, -5),
          updateSpeed: 0.012,
          instanceName: 'cue-hyper-2',
          behavior: {
            triggerKind: 'proximity',
            radius: 3.5,
            checkPeriod: { type: 'interval', milliseconds: 3000 },
            edgeColor: new BABYLON.Color4(1, 0.5, 0.1, 1),
            edgeWidth: 7,
            action: {
              actionType: 'simulationPulse',
              pulseKind: 'craving',
              magnitude: 0.5
            }
          } satisfies BehaviorConfig
        },
        {
          name: 'Sparkles',
          position: new BABYLON.Vector3(0, 1, 7),
          updateSpeed: 0.008,
          instanceName: 'cue-sparkles-3',
          behavior: {
            triggerKind: 'proximity',
            radius: 3,
            checkPeriod: { type: 'interval', milliseconds: 3500 },
            action: {
              actionType: 'simulationPulse',
              pulseKind: 'craving',
              magnitude: 0.45
            }
          } satisfies BehaviorConfig
        },
        {
          name: 'Magic Sparkles',
          position: new BABYLON.Vector3(-6, 1, 4),
          updateSpeed: 0.006,
          instanceName: 'acc-anchor-zone',
          behavior: {
            triggerKind: 'proximity',
            radius: 3.5,
            volumeZone: 'accAnchor',
            edgeColor: new BABYLON.Color4(0.3, 0.6, 1, 1),
            edgeWidth: 6,
            checkPeriod: { type: 'interval', milliseconds: 500 },
            action: {
              actionType: 'setCoupling',
              amount: 0.65
            }
          } satisfies BehaviorConfig
        },
        {
          name: 'Nebula Cloud',
          position: new BABYLON.Vector3(6, 1, -3),
          updateSpeed: 0.005,
          instanceName: 'safe-zone-nebula',
          behavior: {
            triggerKind: 'proximity',
            radius: 4,
            volumeZone: 'safe',
            edgeColor: new BABYLON.Color4(0.2, 0.9, 0.5, 1),
            edgeWidth: 5,
            checkPeriod: { type: 'interval', milliseconds: 1000 },
            action: {
              actionType: 'adjustSimulation',
              target: 'd2',
              amount: 0.02
            }
          } satisfies BehaviorConfig
        },
        {
          name: 'Smoke Trail',
          position: new BABYLON.Vector3(0, 1, -4),
          updateSpeed: 0.01,
          instanceName: 'withdrawal-zone',
          behavior: {
            triggerKind: 'proximity',
            radius: 3.5,
            edgeColor: new BABYLON.Color4(0.9, 0.15, 0.1, 1),
            edgeWidth: 7,
            checkPeriod: { type: 'interval', milliseconds: 4000 },
            action: {
              actionType: 'adjustSimulation',
              target: 'drugHunger',
              amount: 0.12
            }
          } satisfies BehaviorConfig
        }
      ],
      overlays: [
        {
          catalogName: 'Drug Hunger Vignette',
          driver: {
            type: 'simulation',
            input: 'drugHunger',
            threshold: 0.7,
            alsoRequiresLowAcc: true
          }
        }
      ],
      items: [
        {
          name: 'Dopamine Proxy',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/gamma_crystal.glb',
          collectible: true,
          creditValue: 0,
          minImpulseForCollection: 0.2,
          collectRole: 'drug',
          instances: [
            {
              position: new BABYLON.Vector3(3, 1.2, -2),
              scale: 0.45,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.3,
              instanceName: 'drug-proxy-1',
              effect: 'GLOW' satisfies EffectType
            },
            {
              position: new BABYLON.Vector3(-2, 1.2, 6),
              scale: 0.4,
              rotation: new BABYLON.Vector3(0, 0.5, 0),
              mass: 0.3,
              instanceName: 'drug-proxy-2',
              effect: 'GLOW' satisfies EffectType
            }
          ]
        },
        {
          name: 'PFC Exercise',
          url: 'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/items/stylized_crate_asset.glb',
          collectible: true,
          creditValue: 0,
          minImpulseForCollection: 0.3,
          collectRole: 'pfcExercise',
          instances: [
            {
              position: new BABYLON.Vector3(7, 1, 0),
              scale: 0.35,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 0.4,
              instanceName: 'pfc-crate'
            }
          ]
        }
      ]
    },
    {
      name: 'Mushroom Village',
      cutScene: {
        type: 'image',
        visualUrl:
          'https://raw.githubusercontent.com/EricEisaman/assets/main/images/MushroomVillage.jpg',
        audioUrl:
          'https://raw.githubusercontent.com/EricEisaman/assets/main/audio/bgm/HappyCinematic.mp3',
        concurrent: true,
        fadeOutEnabled: true
      },
      model:
        'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/mushroom_village.glb',
      lightmap: '',
      scale: 3.0,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/happy_fluffy_sky.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      transitionPosition: new BABYLON.Vector3(0, 35, 0),
      transitionRotation: new BABYLON.Vector3(0, 0, 0),
      spawnPoint: new BABYLON.Vector3(0, 35, 0),
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      lights: [
        {
          lightType: 'POINT' satisfies LightType,
          name: 'MushroomVillagePointLight',
          position: new BABYLON.Vector3(3, 2.5, 16.5),
          diffuseColor: new BABYLON.Color3(0.83, 0.63, 0.63),
          intensity: 1.0,
          range: 100
        },
        {
          lightType: 'HEMISPHERIC' satisfies LightType,
          name: 'MushroomVillageHemisphericLight',
          direction: new BABYLON.Vector3(0, 1, 0),
          diffuseColor: new BABYLON.Color3(0.95, 0.95, 0.98),
          intensity: 0.1
        }
      ],
      particles: [
        {
          name: 'Magic Sparkles',
          position: new BABYLON.Vector3(50, 33, -45), // Fire on top of building
          updateSpeed: 0.007
        }
      ],
      items: [
        {
          name: 'Gamma Crystal',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/gamma_crystal.glb',
          collectible: true,
          creditValue: 500,
          minImpulseForCollection: 0.3,
          inventory: true,
          thumbnail:
            'https://raw.githubusercontent.com/EricEisaman/assets/main/items/gamma-crystal.png',
          itemEffectKind: 'gamma',
          instances: [
            {
              position: new BABYLON.Vector3(-15, 0.9, 5),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 500,
              friction: 0.9,
              instanceName: 'crystal-1'
            },
            {
              position: new BABYLON.Vector3(-28, 0.9, 5),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 500,
              friction: 0.9
            }
          ]
        },
        {
          name: 'Cave Portal',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/portal.glb',
          collectible: false,
          creditValue: 0,
          minImpulseForCollection: 0.3,
          inventory: false,
          instances: [
            {
              position: new BABYLON.Vector3(55.5, 9.6, 65.6),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 500,
              friction: 0.9,
              behavior: {
                triggerKind: 'proximity',
                radius: 3,
                action: {
                  actionType: 'portal',
                  target: 'The Cave'
                }
              } satisfies BehaviorConfig
            }
          ]
        },
        {
          name: 'Boulder',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/boulder.glb',
          collectible: false,
          creditValue: 500,
          minImpulseForCollection: 0.3,
          inventory: false,
          instances: [
            {
              position: new BABYLON.Vector3(47, 29, -28),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 500,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(48, 31, -20),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 500,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            }
          ]
        }
      ]
    },
    {
      name: 'Flat City',
      isDefault: false,
      cutScene: {
        type: 'video',
        visualUrl: 'https://raw.githubusercontent.com/EricEisaman/assets/main/videos/FlatCity.mp4',
        concurrent: false,
        fadeOutEnabled: true
      },
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/city-flat.glb',
      lightmap: '',
      scale: 1.0,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/happy_fluffy_sky.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(89, 15, -161.5),
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      particles: [
        {
          name: 'Hyper',
          position: new BABYLON.Vector3(83, 19.4, -156.5),
          updateSpeed: 0.007
        }
      ]
    },
    {
      name: 'Dystopia',
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/dystopia.glb',
      lightmap: '',
      scale: 2,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/happy_fluffy_sky.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(3, 0, 31),
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      fallRespawn: {
        onRespawnedHandlerId: 'dystopiaStripCreditsOnFallRespawn'
      },
      particles: [
        {
          name: 'Magic Sparkles',
          position: new BABYLON.Vector3(83, 11.4, -156.5), // Fire on top of building
          updateSpeed: 0.007
        }
      ]
    },
    {
      name: 'RV Life',
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/rv_life.glb',
      lightmap: '',
      scale: 2.3,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      backgroundMusic: {
        url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/audio/bgm/HappyBirthdayJosh.mp3',
        volume: 0.1
      },
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/orange-desert-night.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(0, 5, 0), // Higher spawn point for Firefox Reality
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      items: [
        {
          name: 'Present',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/b_day_present.glb',
          collectible: true,
          creditValue: 500,
          minImpulseForCollection: 0.3,
          inventory: false,
          instances: [
            {
              position: new BABYLON.Vector3(5, 2, 3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(-5, 2, 3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(5, 2, -3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(-5, 2, -3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(7, 2, 3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(-7, 2, 3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(7, 2, -3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            },
            {
              position: new BABYLON.Vector3(-7, 2, -3),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 10,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            }
          ]
        },
        {
          name: 'Cake',
          url: 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/birthday_cake.glb',
          collectible: false,
          creditValue: 500,
          minImpulseForCollection: 0.3,
          inventory: false,
          instances: [
            {
              position: new BABYLON.Vector3(5, 2, 1),
              scale: 1.0,
              rotation: new BABYLON.Vector3(0, 0, 0),
              mass: 5,
              colliderType: 'CONVEX_HULL',
              friction: 0.9
            }
          ]
        }
      ]
    },
    {
      name: 'Monochrome',
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/monochrome.glb',
      lightmap: '',
      scale: 1,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/happy_fluffy_sky.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(1.5, 2, 0),
      spawnRotation: new BABYLON.Vector3(0, Math.PI, 0),
      cameraOffset: new BABYLON.Vector3(0, 1.1, -2.2)
    },
    {
      name: 'Mansion',
      isDefault: true,
      model:
        'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/models/environments/mansion/mansion.glb',
      lightmap: '',
      scale: 10,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/light-blue-sky-over-grassy-plain.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(0, 15, -20),
      spawnRotation: new BABYLON.Vector3(0, 0, 0)
    },
    {
      name: 'The Cave',
      locked: true,
      model: 'https://raw.githubusercontent.com/EricEisaman/assets/main/environment/the_cave.glb',
      lightmap: '',
      scale: 6,
      lightmappedMeshes: EMPTY_LIGHTMAPPED_MESHES,
      physicsObjects: EMPTY_PHYSICS_OBJECTS,
      sky: {
        TEXTURE_URL:
          'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/images/skies/light-blue-sky-over-grassy-plain.png',
        ROTATION_Y: 0,
        BLUR: 0.2,
        TYPE: 'SPHERE' satisfies SkyType
      },
      spawnPoint: new BABYLON.Vector3(0, 2, 0),
      spawnRotation: new BABYLON.Vector3(0, 0, 0),
      lights: [
        {
          lightType: 'HEMISPHERIC' satisfies LightType,
          name: 'TheCaveHemisphericLight',
          direction: new BABYLON.Vector3(0, 1, 0),
          diffuseColor: new BABYLON.Color3(0.95, 0.95, 0.98),
          intensity: 0.0
        }
      ]
    }
  ] satisfies readonly Environment[]
} as const;
