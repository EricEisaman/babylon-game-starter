// ============================================================================
// UI TYPE DEFINITIONS
// ============================================================================

export type HUDPosition = 'top' | 'bottom' | 'left' | 'right';

export interface HUDConfig {
  readonly POSITION: HUDPosition;
  readonly FONT_FAMILY: string;
  readonly PRIMARY_COLOR: string;
  readonly SECONDARY_COLOR: string;
  readonly HIGHLIGHT_COLOR: string;
  readonly BACKGROUND_COLOR: string;
  readonly BACKGROUND_OPACITY: number;
  readonly PADDING: number;
  readonly BORDER_RADIUS: number;
  readonly SHOW_COORDINATES: boolean;
  readonly SHOW_TIME: boolean;
  readonly SHOW_FPS: boolean;
  readonly SHOW_STATE: boolean;
  readonly SHOW_BOOST_STATUS: boolean;
  readonly SHOW_CREDITS: boolean;
  readonly UPDATE_INTERVAL: number;
  readonly MOBILE: {
    readonly SHOW_COORDINATES: boolean;
    readonly SHOW_TIME: boolean;
    readonly SHOW_FPS: boolean;
    readonly SHOW_STATE: boolean;
    readonly SHOW_BOOST_STATUS: boolean;
    readonly SHOW_CREDITS: boolean;
  };
  readonly IPadWithKeyboard: {
    readonly SHOW_COORDINATES: boolean;
    readonly SHOW_TIME: boolean;
    readonly SHOW_FPS: boolean;
    readonly SHOW_STATE: boolean;
    readonly SHOW_BOOST_STATUS: boolean;
    readonly SHOW_CREDITS: boolean;
  };
}

export type UIElementType = 'toggle' | 'dropdown';
export type VisibilityType = 'all' | 'mobile' | 'iPadWithKeyboard' | 'playground';
export type SettingsActionId =
  | 'screen-controls'
  | 'character'
  | 'environment'
  | 'playground-ui'
  | 'split-rendering'
  | 'game-hud'
  | 'inspector';

export interface SettingsSection {
  readonly title: string;
  readonly uiElement: UIElementType;
  readonly visibility: VisibilityType;
  readonly defaultValue?: boolean | string;
  readonly options?: string[]; // For dropdown elements
  readonly actionId?: SettingsActionId;
}

export interface SettingsConfig {
  readonly HEADING_TEXT: string;
  readonly PANEL_WIDTH_RATIO: number;
  readonly FULL_SCREEN_THRESHOLD: number;
  readonly Z_INDEX: number;
  readonly BUTTON_Z_INDEX: number;
  readonly SECTIONS: readonly SettingsSection[];
}

export interface Tile {
  readonly title: string;
  readonly thumbnail: string;
  readonly minSize: number;
  readonly maxSize: number;
  readonly count: number;
  readonly itemEffectKind: ItemEffectKind;
}

export interface InventoryConfig {
  readonly HEADING_TEXT: string;
  readonly PANEL_WIDTH_RATIO: number;
  readonly FULL_SCREEN_THRESHOLD: number;
  readonly Z_INDEX: number;
  readonly BUTTON_Z_INDEX: number;
  readonly TILES: readonly Tile[];
}

// Import ItemEffectKind from config to avoid circular dependency
import type { ItemEffectKind } from './config';
