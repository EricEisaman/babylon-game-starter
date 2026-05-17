// ============================================================================
// MOBILE CONTROLS CONFIGURATION
// ============================================================================

const EDGE_INSET = 20;
const BUTTON_SIZE = 72;
const BUTTON_SPACING = 12;
const JOYSTICK_DIAMETER = 60 * 2;
const OVERLAY_GAP = 12;

export const MOBILE_CONTROLS = {
  EDGE_INSET,
  JOYSTICK_RADIUS: 60,
  JOYSTICK_DEADZONE: 10,
  BUTTON_SIZE,
  BUTTON_SPACING,
  /** Gameplay controls sit above overlay corner buttons. */
  GAME_CONTROL_Z_INDEX: 1500,
  OVERLAY_Z_INDEX: 1200,
  OPACITY: 0.7,
  COLORS: {
    JOYSTICK_BG: '#333333',
    JOYSTICK_STICK: '#ffffff',
    BUTTON_BG: '#444444',
    BUTTON_ACTIVE: '#00ff88',
    BUTTON_TEXT: '#ffffff'
  },
  POSITIONS: {
    JOYSTICK: {
      BOTTOM: EDGE_INSET,
      LEFT: EDGE_INSET
    },
    /** Jump above boost — hold boost with thumb, tap jump upward. */
    JUMP_BUTTON: {
      BOTTOM: EDGE_INSET + BUTTON_SIZE + BUTTON_SPACING,
      RIGHT: EDGE_INSET
    },
    BOOST_BUTTON: {
      BOTTOM: EDGE_INSET,
      RIGHT: EDGE_INSET
    }
  },
  /** Settings / inventory sit above gameplay controls (no overlap with joystick or actions). */
  OVERLAY: {
    SETTINGS: {
      BOTTOM: EDGE_INSET + JOYSTICK_DIAMETER + OVERLAY_GAP,
      LEFT: EDGE_INSET
    },
    INVENTORY: {
      BOTTOM: EDGE_INSET + BUTTON_SIZE * 2 + BUTTON_SPACING + OVERLAY_GAP,
      RIGHT: EDGE_INSET
    }
  },
  VISIBILITY: {
    SHOW_JOYSTICK: true,
    SHOW_JUMP_BUTTON: true,
    SHOW_BOOST_BUTTON: true
  }
} as const;
