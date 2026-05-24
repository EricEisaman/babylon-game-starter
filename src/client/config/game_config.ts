// ============================================================================
// GAME CONFIGURATION
// ============================================================================

import { ASSETS } from './assets';

import type { GameConfig } from '../types/config';
import type { HUDPosition } from '../types/ui';

export const CONFIG: GameConfig = {
  // Character Settings
  CHARACTER: {
    SPEED: {
      WALK: 2.0,
      RUN: 4.0,
      JUMP: 8.0
    },
    CAPSULE_HEIGHT: 1.8,
    CAPSULE_RADIUS: 0.4,
    MASS: 1.0,
    FRICTION: 0.2,
    RESTITUTION: 0.0,
    ROTATION_SMOOTHING: 0.1,
    ANIMATION_BLEND: 400,
    JUMP_DELAY: 100
  },

  // Camera Settings
  CAMERA: {
    START_POSITION: new BABYLON.Vector3(0, 5, -10),
    OFFSET: new BABYLON.Vector3(0, 1.2, -3),
    DRAG_SENSITIVITY: 0.02,
    ZOOM_MIN: -15,
    ZOOM_MAX: -2,
    FOLLOW_SMOOTHING: 0.1
  },

  // Physics Settings
  PHYSICS: {
    GRAVITY: new BABYLON.Vector3(0, -9.8, 0),
    CHARACTER_GRAVITY: new BABYLON.Vector3(0, -18, 0)
  },

  // Animation Settings
  ANIMATION: {
    PLAYER_SCALE: 0.7,
    PLAYER_Y_OFFSET: -0.9
  },

  // Debug Settings
  DEBUG: {
    CAPSULE_VISIBLE: false
  },

  PERFORMANCE: {
    CAMERA_MAX_Z: 8000,
    SCENE_OPTIMIZER_ENABLED: true,
    SCENE_OPTIMIZER_TARGET_FPS: 55,
    SCENE_OPTIMIZER_TRACK_MS: 2500,
    HARDWARE_SCALING_MAX: 2,
    HARDWARE_SCALING_STEP: 0.25,
    // WebGL is the default: WebGPU + PBR/light UBOs still hit edge cases in some scenes (bind group / Light0).
    WEBGPU_WHEN_AVAILABLE: false
  },

  // Effects Settings
  EFFECTS: {
    PARTICLE_SNIPPETS: [
      {
        type: 'legacy',
        name: 'Fire Trail',
        description: 'Realistic fire particle system with heat distortion',
        category: 'fire',
        snippetId: 'HYB2FR'
      },
      {
        type: 'legacy',
        name: 'Magic Sparkles',
        description: 'Enchanting sparkle effect with rainbow colors',
        category: 'magic',
        snippetId: 'T54JV7'
      },
      {
        type: 'legacy',
        name: 'Dust Storm',
        description: 'Atmospheric dust particles with wind effect',
        category: 'nature',
        snippetId: 'HYB2FR'
      },
      {
        type: 'legacy',
        name: 'Energy Field',
        description: 'Sci-fi energy field with electric arcs',
        category: 'tech',
        snippetId: 'T54JV7'
      },
      {
        type: 'legacy',
        name: 'Stardust',
        description: 'Cosmic stardust with twinkling effect',
        category: 'cosmic',
        snippetId: 'T54JV7'
      },
      {
        type: 'legacy',
        name: 'Smoke Trail',
        description: 'Realistic smoke with fade effect',
        category: 'nature',
        snippetId: 'HYB2FR'
      },
      {
        type: 'legacy',
        name: 'Portal Effect',
        description: 'Mystical portal with swirling particles',
        category: 'magic',
        snippetId: 'T54JV7'
      },
      {
        type: 'legacy',
        name: 'Laser Beam',
        description: 'Sci-fi laser beam with energy core',
        category: 'tech',
        snippetId: 'HYB2FR'
      },
      {
        type: 'legacy',
        name: 'Nebula Cloud',
        description: 'Cosmic nebula with colorful gas clouds',
        category: 'cosmic',
        snippetId: 'T54JV7'
      },
      {
        type: 'legacy',
        name: 'Explosion',
        description: 'Dramatic explosion with debris',
        category: 'fire',
        snippetId: 'HYB2FR'
      },
      {
        type: 'nodes',
        name: 'Sparkles',
        description: 'Sparkles',
        category: 'magic',
        snippetId: '#T54JV7#67'
      },
      {
        type: 'nodes',
        name: 'Hyper',
        description: 'Hyper',
        category: 'magic',
        snippetId: '#UED7L7#1'
      }
    ] as const,
    OVERLAY_SNIPPETS: [
      {
        name: 'Drug Hunger Vignette',
        description: 'Red vignette when drug hunger is high and ACC awareness is low',
        editor: 'dom',
        kind: 'dom',
        snippetId: ''
      }
    ] as const,
    DEFAULT_PARTICLE: 'Magic Sparkles',
    AUTO_SPAWN: true,
    SOUND_EFFECTS: [
      {
        name: 'Thruster',
        url: 'https://raw.githubusercontent.com/EricEisaman/game-dev-1a/main/assets/sounds/effects/thruster.m4a',
        volume: 0.5,
        loop: true
      }
    ] as const
  },

  // HUD Settings
  HUD: {
    POSITION: 'top' satisfies HUDPosition,
    FONT_FAMILY: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
    PRIMARY_COLOR: '#ffffff',
    SECONDARY_COLOR: '#cccccc',
    HIGHLIGHT_COLOR: '#00ff88',
    BACKGROUND_COLOR: '#000000',
    BACKGROUND_OPACITY: 0.7,
    PADDING: 15,
    BORDER_RADIUS: 8,
    SHOW_COORDINATES: false,
    SHOW_TIME: true,
    SHOW_FPS: true,
    SHOW_STATE: true,
    SHOW_BOOST_STATUS: true,
    SHOW_CREDITS: true,
    UPDATE_INTERVAL: 100, // milliseconds
    MOBILE: {
      SHOW_COORDINATES: false,
      SHOW_TIME: false,
      SHOW_FPS: false,
      SHOW_STATE: true,
      SHOW_BOOST_STATUS: true,
      SHOW_CREDITS: true
    },
    IPadWithKeyboard: {
      SHOW_COORDINATES: false,
      SHOW_TIME: false,
      SHOW_FPS: false,
      SHOW_STATE: true,
      SHOW_BOOST_STATUS: true,
      SHOW_CREDITS: true
    }
  },

  // Settings Panel Configuration
  SETTINGS: {
    HEADING_TEXT: 'Settings',
    PANEL_WIDTH_RATIO: 1 / 3,
    FULL_SCREEN_THRESHOLD: 500,
    Z_INDEX: 1800,
    BUTTON_Z_INDEX: 2000,
    SECTIONS: [
      {
        title: 'Screen Controls',
        uiElement: 'toggle',
        visibility: 'iPadWithKeyboard',
        defaultValue: true, // Default to showing controls
        actionId: 'screen-controls'
      },
      {
        title: 'Character',
        uiElement: 'dropdown',
        visibility: 'all',
        defaultValue: 'Red', // Default to first character (Red)
        options: ASSETS.CHARACTERS.map((character) => character.name),
        actionId: 'character'
      },
      {
        title: 'Environment',
        uiElement: 'dropdown',
        visibility: 'all',
        defaultValue:
          ASSETS.ENVIRONMENTS.find((e) => e.isDefault)?.name ?? ASSETS.ENVIRONMENTS[0]?.name ?? '', // Default to isDefault env or first
        options: ASSETS.ENVIRONMENTS.map((environment) => environment.name),
        actionId: 'environment'
      },
      {
        title: 'Babylon Playground UI',
        uiElement: 'toggle',
        visibility: 'playground',
        defaultValue: true, // Default to showing playground UI elements
        actionId: 'playground-ui'
      },
      {
        title: 'Full Screen',
        uiElement: 'toggle',
        visibility: 'playground',
        defaultValue: false, // Default state, will be synced with actual element state
        actionId: 'split-rendering'
      },
      {
        title: 'Game HUD',
        uiElement: 'toggle',
        visibility: 'all',
        defaultValue: true, // Default to showing HUD elements
        actionId: 'game-hud'
      },
      {
        title: 'Inspector',
        uiElement: 'toggle',
        visibility: 'all',
        defaultValue: false, // Default state, will be synced with actual element state
        actionId: 'inspector'
      }
    ]
  },

  INVENTORY: {
    HEADING_TEXT: 'Inventory',
    PANEL_WIDTH_RATIO: 1 / 3,
    FULL_SCREEN_THRESHOLD: 500,
    Z_INDEX: 1800,
    BUTTON_Z_INDEX: 2000,
    TILES: [] // Tiles will be added dynamically by InventoryManager
  },

  // Multiplayer: forks can point the client at their own Go server without editing this block
  // by setting VITE_MULTIPLAYER_HOST in .env / .env.local (see repo .env.example).
  // Students running the exported playground snippet can override at runtime via
  // `?mp=host` or `#mp=host` on the playground URL (see MULTIPLAYER.md).
  SIMULATION: {
    ENABLED: false,
    METERS: [
      { id: 'd1', label: 'D1 Accelerator', color: '#ff6b35' },
      { id: 'd2', label: 'D2 Brake', color: '#4ecdc4' },
      { id: 'rpe', label: 'Dopamine Pulse', color: '#ffe66d' },
      { id: 'hunger', label: 'Drug Hunger', color: '#e63946' },
      { id: 'coupling', label: 'Insula–ACC', color: '#a78bfa' },
      { id: 'habit', label: 'Habit Encoding', color: '#f72585' }
    ]
  },

  MULTIPLAYER: {
    ENABLED: true,
    PRODUCTION_SERVER: 'bgs-mp.onrender.com',
    LOCAL_SERVER: 'localhost:5000',
    // Render free-tier services sleep after ~15 min idle and take 10-30 s to
    // wake. The first probe after a cold start can easily exceed 15 s on
    // slow home connections. 30 s covers all observed cases so far, while
    // `multiplayer-warming-up` fires on `window` at 5 s so the UI can explain
    // the delay. See datastar_client.ts for the event contract.
    CONNECTION_TIMEOUT_MS: 30000,
    PRODUCTION_FIRST: true,
    /**
     * Per-item authority tunables (MULTIPLAYER_SYNCH.md §4.7).
     * - CLAIM_RADIUS_METERS: radius around a dynamic item that triggers a proximity claim.
     * - CLAIM_GRACE_MS: after leaving the bubble, keep ownership for this long so a quick
     *   re-entry doesn't thrash claim/release.
     * - CLAIM_IDLE_TIMEOUT_MS: if an owner stops publishing rows for this long, another
     *   client's claim is accepted server-side.
     */
    CLAIM_RADIUS_METERS: 2.5,
    CLAIM_GRACE_MS: 1200,
    CLAIM_IDLE_TIMEOUT_MS: 1500
  }
} as const;
