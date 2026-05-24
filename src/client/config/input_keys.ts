// ============================================================================
// INPUT KEYS CONFIGURATION
// ============================================================================

export const INPUT_KEYS = {
  FORWARD: ['w', 'arrowup'],
  BACKWARD: ['s', 'arrowdown'],
  LEFT: ['a', 'arrowleft'],
  RIGHT: ['d', 'arrowright'],
  STRAFE_LEFT: ['q'],
  STRAFE_RIGHT: ['e'],
  JUMP: [' '],
  BOOST: ['shift'],
  /** Hold for interact / label-urge when simulation module is enabled. */
  INTERACT: ['f'],
  DEBUG: ['0'],
  HUD_TOGGLE: ['h'],
  HUD_POSITION: ['p'],
  RESET_CAMERA: ['1']
} as const;
