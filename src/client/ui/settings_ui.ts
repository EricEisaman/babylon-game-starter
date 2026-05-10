// ============================================================================
// SETTINGS UI
// ============================================================================

import { ASSETS } from '../config/assets';
import { CONFIG } from '../config/game_config';
import { MobileInputManager } from '../input/mobile_input_manager';
import { AudioManager } from '../managers/audio_manager';
import { CutSceneManager } from '../managers/cut_scene_manager';
import { HUDManager } from '../managers/hud_manager';
import { getMultiplayerManager } from '../managers/multiplayer_manager';
import { hideAllRemotePeers } from '../managers/remote_peer_proxy';
import { CharacterLock } from '../utils/character_lock';
import { EnvironmentLock } from '../utils/environment_lock';

import type { SceneManager } from '../managers/scene_manager';
import type { CutScene } from '../types/environment';
import type { SettingsSection, VisibilityType } from '../types/ui';

export class SettingsUI {
  private static settingsButton: HTMLDivElement | null = null;
  private static settingsPanel: HTMLDivElement | null = null;
  private static isPanelOpen = false;
  private static sceneManager: SceneManager | null = null;
  private static lastSelectedCharacterName: string | null = null;
  private static lastSelectedEnvironmentName: string | null = null;
  public static isInitializing = false; // Flag to prevent onChange during initialization
  // Cache for Babylon Playground UI element display styles
  private static playgroundUICache = new Map<HTMLElement, string>();
  // Cache for pg-split element
  private static pgSplitElement: HTMLElement | null = null;
  // Cache for HUD container original display style
  private static hudDisplayCache: string | null = null;
  // Cache for Inspector button element
  private static inspectorButton: HTMLElement | null = null;

  // Device detection methods
  private static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  private static isIPad(): boolean {
    // Modern iPad detection (including iPad Pro)
    const userAgent = navigator.userAgent;
    const isIPadUA = /iPad/i.test(userAgent);
    const isMacWithTouch = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isIPadPro = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;

    return isIPadUA || isMacWithTouch || isIPadPro;
  }

  private static isIPadWithKeyboard(): boolean {
    // Check if it's an iPad first
    if (!this.isIPad()) {
      return false;
    }

    // Multiple detection methods for iPad with keyboard
    const isLandscape = window.innerHeight < window.innerWidth;
    const hasExternalKeyboard = this.detectExternalKeyboard();
    const hasKeyboardEvents = this.detectKeyboardEvents();

    // Show if any of these conditions are met
    return isLandscape || hasExternalKeyboard || hasKeyboardEvents;
  }

  private static detectExternalKeyboard(): boolean {
    // Check for external keyboard indicators
    // This is a simplified check - in real scenarios you might need more sophisticated detection
    return (
      navigator.maxTouchPoints === 0 || (navigator.maxTouchPoints === 1 && window.innerWidth > 1024)
    );
  }

  private static detectKeyboardEvents(): boolean {
    // Check if keyboard events have been detected recently
    // This would require tracking keyboard events over time
    // For now, we'll use a simpler approach
    return false; // Placeholder for future keyboard event tracking
  }

  private static shouldShowSection(visibility: VisibilityType): boolean {
    switch (visibility) {
      case 'all':
        return true;
      case 'mobile':
        return this.isMobileDevice();
      case 'iPadWithKeyboard':
        return this.isIPadWithKeyboard();
      default:
        return false;
    }
  }

  private static async runSectionAction(
    actionId: SettingsSection['actionId'],
    value: boolean | string
  ): Promise<void> {
    if (!actionId) {
      return;
    }

    switch (actionId) {
      case 'screen-controls':
        if (typeof value === 'boolean') {
          MobileInputManager.setVisibility(value);
        }
        break;
      case 'character':
        if (typeof value === 'string' && !this.isInitializing) {
          this.changeCharacter(value);
        }
        break;
      case 'environment':
        if (typeof value === 'string') {
          await this.changeEnvironment(value);
        }
        break;
      case 'playground-ui':
        if (typeof value === 'boolean') {
          this.togglePlaygroundUI(value);
        }
        break;
      case 'split-rendering':
        if (typeof value === 'boolean') {
          this.toggleSplitRendering(value);
        }
        break;
      case 'game-hud':
        if (typeof value === 'boolean') {
          this.toggleGameHUD(value);
        }
        break;
      case 'inspector':
        if (typeof value === 'boolean') {
          this.toggleInspector(value);
        }
        break;
    }
  }

  public static initialize(canvas: HTMLCanvasElement, sceneManager?: SceneManager): void {
    // Clean up first
    this.cleanup();

    this.isInitializing = true; // Prevent onChange during initialization
    this.sceneManager = sceneManager ?? null;
    CharacterLock.setUiHooks({
      getCurrentCharacterName: () => this.getCurrentCharacterName(),
      getLastSelectedCharacterName: () => this.getLastSelectedCharacterName(),
      changeCharacter: (name) => {
        this.changeCharacter(name);
      },
      regenerateSections: () => {
        this.regenerateSections();
      }
    });
    EnvironmentLock.setUiHooks({
      getCurrentEnvironmentName: () => this.getCurrentEnvironmentName(),
      getLastSelectedEnvironmentName: () => this.getLastSelectedEnvironmentName(),
      changeEnvironment: (name) => this.changeEnvironment(name),
      regenerateSections: () => {
        this.regenerateSections();
      }
    });
    this.createSettingsButton(canvas);
    this.createSettingsPanel(canvas);
    this.setupEventListeners();
    this.isInitializing = false; // Allow onChange after initialization
  }

  private static createSettingsButton(canvas: HTMLCanvasElement): void {
    void canvas;
    // Create settings button
    this.settingsButton = document.createElement('div');
    this.settingsButton.id = 'settings-button';
    this.settingsButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.2579 9.77251 19.9887C9.5799 19.7195 9.31074 19.5149 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.74206 9.96512 4.01128 9.77251C4.2805 9.5799 4.48514 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

    // Style the button
    this.settingsButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 50px;
            height: 50px;
            background: rgba(0, 0, 0, 0.7);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: white;
            z-index: 2000;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        `;

    // Add hover effects
    this.settingsButton.addEventListener('mouseenter', () => {
      if (this.settingsButton) {
        this.settingsButton.style.background = 'rgba(0, 0, 0, 0.9)';
        this.settingsButton.style.borderColor = 'rgba(255, 255, 255, 0.6)';
        this.settingsButton.style.transform = 'scale(1.1)';
      }
    });

    this.settingsButton.addEventListener('mouseleave', () => {
      if (this.settingsButton) {
        this.settingsButton.style.background = 'rgba(0, 0, 0, 0.7)';
        this.settingsButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        this.settingsButton.style.transform = 'scale(1)';
      }
    });

    document.body.appendChild(this.settingsButton);
  }

  private static createSettingsPanel(canvas: HTMLCanvasElement): void {
    void canvas;
    // Create settings panel
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.id = 'settings-panel';

    // Calculate panel width (1/3 of view width with minimum 500px)
    const viewWidth = window.innerWidth;
    const panelWidth = Math.max(viewWidth / 3, 500);

    // Generate sections HTML
    const sectionsHTML = this.generateSectionsHTML();

    this.settingsPanel.innerHTML = `
            <div class="settings-header">
                <h2>${CONFIG.SETTINGS.HEADING_TEXT}</h2>
            </div>
            <div class="settings-content">
                ${sectionsHTML}
            </div>
        `;

    // Style the panel
    this.settingsPanel.style.cssText = `
            position: fixed;
            top: 0;
            left: -${panelWidth}px;
            width: ${panelWidth}px;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(20px);
            border-right: 2px solid rgba(255, 255, 255, 0.2);
            z-index: ${CONFIG.SETTINGS.Z_INDEX};
            transition: left 0.3s ease;
            color: white;
            font-family: Arial, sans-serif;
            overflow-y: auto;
        `;

    // Style the header
    const header = this.settingsPanel.querySelector('.settings-header');
    if (header instanceof HTMLElement) {
      header.style.cssText = `
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            box-sizing: border-box;
            max-width: 100%;
        `;

      // Style the header title
      const headerTitle = header.querySelector('h2');
      if (headerTitle instanceof HTMLElement) {
        headerTitle.style.cssText = `
            margin: 0;
            font-size: 24px;
            font-weight: bold;
            color: white;
        `;
      }
    }

    // Apply styles to content and sections
    this.applySectionStyles();

    document.body.appendChild(this.settingsPanel);

    // Setup section event listeners
    this.setupSectionEventListeners();

    // Listen for orientation changes to re-evaluate section visibility
    window.addEventListener('orientationchange', () => {
      requestAnimationFrame(() => {
        this.regenerateSections();
      });
    });

    // Also listen for resize events
    window.addEventListener('resize', () => {
      this.regenerateSections();
    });
  }

  /**
   * Applies styles to all section elements, content area, and form controls.
   * This method can be called multiple times safely to re-apply styles after content updates.
   */
  private static applySectionStyles(): void {
    if (!this.settingsPanel) return;

    // Ensure header sticky positioning is maintained
    const header = this.settingsPanel.querySelector('.settings-header');
    if (header instanceof HTMLElement) {
      header.style.position = 'sticky';
      header.style.top = '0';
      header.style.zIndex = '1';
    }

    // Style the content area
    const content = this.settingsPanel.querySelector('.settings-content');
    if (content instanceof HTMLElement) {
      content.style.cssText = `
            padding: 20px;
            box-sizing: border-box;
            max-width: 100%;
            overflow-x: hidden;
        `;
    }

    // Style sections
    const sections = this.settingsPanel.querySelectorAll('.settings-section');
    sections.forEach((section) => {
      if (section instanceof HTMLElement) {
        section.style.cssText = `
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
      }
    });

    // Style section headers
    const sectionHeaders = this.settingsPanel.querySelectorAll('.section-header');
    sectionHeaders.forEach((header) => {
      if (header instanceof HTMLElement) {
        header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            `;
      }
    });

    // Style section titles
    const sectionTitles = this.settingsPanel.querySelectorAll('.section-header h3');
    sectionTitles.forEach((title) => {
      if (title instanceof HTMLElement) {
        title.style.cssText = `
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: white;
            `;
      }
    });

    // Style toggle switches
    const toggleSwitches = this.settingsPanel.querySelectorAll('.toggle-switch');
    toggleSwitches.forEach((toggleSwitch) => {
      if (toggleSwitch instanceof HTMLElement) {
        toggleSwitch.style.cssText = `
                position: relative;
                display: inline-block;
                width: 50px;
                height: 24px;
            `;
      }
    });

    const toggleInputs = this.settingsPanel.querySelectorAll('.toggle-switch input');
    toggleInputs.forEach((input) => {
      if (input instanceof HTMLElement) {
        input.style.cssText = `
                opacity: 0;
                width: 0;
                height: 0;
            `;
      }
    });

    const toggleSliders = this.settingsPanel.querySelectorAll('.toggle-slider');
    toggleSliders.forEach((slider) => {
      if (slider instanceof HTMLElement) {
        slider.style.cssText = `
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.3);
                transition: 0.3s;
                border-radius: 24px;
            `;

        // Add pseudo-element for the toggle circle if it doesn't exist
        if (!slider.querySelector('span')) {
          slider.innerHTML =
            '<span style="position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%;"></span>';
        }
      }
    });

    // Style dropdowns
    const selects = this.settingsPanel.querySelectorAll('select');
    selects.forEach((select) => {
      if (select instanceof HTMLElement) {
        select.style.cssText = `
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                color: white;
                font-size: 14px;
                cursor: pointer;
            `;
      }
    });
  }

  public static regenerateSections(): void {
    if (!this.settingsPanel) return;

    // Regenerate sections HTML
    const sectionsHTML = this.generateSectionsHTML();
    const content = this.settingsPanel.querySelector('.settings-content');
    if (content) {
      content.innerHTML = sectionsHTML;
    }

    // Re-apply styles to preserve styling after innerHTML update
    this.applySectionStyles();

    // Re-setup event listeners and toggle state handlers
    this.setupSectionEventListeners();
    this.setupToggleStateHandlers();
  }

  private static generateSectionsHTML(): string {
    let sectionsHTML = '';

    CONFIG.SETTINGS.SECTIONS.forEach((section: SettingsSection, index) => {
      // Check if section should be visible
      if (!this.shouldShowSection(section.visibility)) {
        return;
      }

      const sectionId = `section-${index}`;

      if (section.uiElement === 'toggle') {
        // Get current state for mobile controls
        let defaultValue = false;
        if (typeof section.defaultValue === 'boolean') {
          defaultValue = section.defaultValue;
        }
        if (section.title === 'Screen Controls') {
          // For Screen Controls, always default to true (visible) since controls are shown by default
          defaultValue = true;
        }

        sectionsHTML += `
                    <div class="settings-section" id="${sectionId}">
                        <div class="section-header">
                            <h3>${section.title}</h3>
                            <label class="toggle-switch">
                                <input type="checkbox" ${defaultValue ? 'checked' : ''} data-section-index="${index}">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                `;
      } else {
        let defaultValue = section.options?.[0] ?? '';
        if (typeof section.defaultValue === 'string') {
          defaultValue = section.defaultValue;
        }

        // Special handling for Character and Environment dropdowns to show names
        let optionsHTML = '';
        if (section.title === 'Character') {
          optionsHTML = ASSETS.CHARACTERS.map((character) => {
            const isLocked = CharacterLock.isCharacterLocked(character.name);
            const isSelected = character.name === defaultValue;
            const disabledAttr = isLocked ? 'disabled' : '';
            const selectedAttr = isSelected ? 'selected' : '';
            const lockIcon = isLocked ? '🔒 ' : '';
            const styleAttr = isLocked ? 'style="color: rgba(255, 255, 255, 0.4);"' : '';
            return `<option value="${character.name}" ${selectedAttr} ${disabledAttr} ${styleAttr}>${lockIcon}${character.name}</option>`;
          }).join('');
        } else if (section.title === 'Environment') {
          optionsHTML = ASSETS.ENVIRONMENTS.map((environment) => {
            const isLocked = EnvironmentLock.isEnvironmentLocked(environment.name);
            const isSelected = environment.name === defaultValue;
            const disabledAttr = isLocked ? 'disabled' : '';
            const selectedAttr = isSelected ? 'selected' : '';
            const lockIcon = isLocked ? '🔒 ' : '';
            const styleAttr = isLocked ? 'style="color: rgba(255, 255, 255, 0.4);"' : '';
            return `<option value="${environment.name}" ${selectedAttr} ${disabledAttr} ${styleAttr}>${lockIcon}${environment.name}</option>`;
          }).join('');
        } else {
          optionsHTML =
            section.options
              ?.map(
                (option) =>
                  `<option value="${option}" ${option === defaultValue ? 'selected' : ''}>${option}</option>`
              )
              .join('') ?? '';
        }

        sectionsHTML += `
                    <div class="settings-section" id="${sectionId}">
                        <div class="section-header">
                            <h3>${section.title}</h3>
                            <select data-section-index="${index}">
                                ${optionsHTML}
                            </select>
                        </div>
                    </div>
                `;
      }
    });

    return sectionsHTML;
  }

  private static setupSectionEventListeners(): void {
    // Setup toggle switches
    if (!this.settingsPanel) return;
    const toggles = this.settingsPanel.querySelectorAll('input[type="checkbox"]');
    toggles.forEach((toggle) => {
      toggle.addEventListener('change', (e) => {
        void (async () => {
          const target = e.target;
          if (!(target instanceof HTMLInputElement)) return;
          const sectionIndexStr = target.dataset.sectionIndex;
          if (sectionIndexStr == null) return;
          const sectionIndex = parseInt(sectionIndexStr);
          const section = CONFIG.SETTINGS.SECTIONS[sectionIndex];
          if (!section) {
            return;
          }

          await this.runSectionAction(section.actionId, target.checked);
        })();
      });
    });

    // Setup dropdown selects
    const selects = this.settingsPanel.querySelectorAll('select');
    selects.forEach((select) => {
      // Initialize previous value for character and environment dropdowns
      if (select instanceof HTMLSelectElement) {
        const sectionIndexStr = select.dataset.sectionIndex;
        if (sectionIndexStr != null) {
          const sectionIndex = parseInt(sectionIndexStr);
          const section = CONFIG.SETTINGS.SECTIONS[sectionIndex];
          if (
            section &&
            (section.title === 'Character' || section.title === 'Environment') &&
            select.value
          ) {
            select.setAttribute('data-previous-value', select.value);
          }
        }
      }

      select.addEventListener('change', (e) => {
        void (async () => {
          const target = e.target;
          if (!(target instanceof HTMLSelectElement)) return;
          const sectionIndexStr = target.dataset.sectionIndex;
          if (sectionIndexStr == null) return;
          const sectionIndex = parseInt(sectionIndexStr);
          const section = CONFIG.SETTINGS.SECTIONS[sectionIndex];
          if (!section) {
            return;
          }

          // Prevent selection of locked characters
          if (section.title === 'Character') {
            const selectedCharacter = target.value;
            if (CharacterLock.isCharacterLocked(selectedCharacter)) {
              // Reset to previous valid selection
              const previousValue = target.getAttribute('data-previous-value');
              if (previousValue && !CharacterLock.isCharacterLocked(previousValue)) {
                target.value = previousValue;
              } else {
                // Find first unlocked character
                const unlockedCharacter = ASSETS.CHARACTERS.find(
                  (c) => !CharacterLock.isCharacterLocked(c.name)
                );
                if (unlockedCharacter) {
                  target.value = unlockedCharacter.name;
                }
              }
              return; // Prevent onChange for locked character
            }
            // Store current value as previous for next change
            target.setAttribute('data-previous-value', target.value);
          }

          // Prevent selection of locked environments
          if (section.title === 'Environment') {
            const selectedEnvironment = target.value;
            if (EnvironmentLock.isEnvironmentLocked(selectedEnvironment)) {
              // Reset to previous valid selection
              const previousValue = target.getAttribute('data-previous-value');
              if (previousValue && !EnvironmentLock.isEnvironmentLocked(previousValue)) {
                target.value = previousValue;
              } else {
                // Find first unlocked environment
                const unlockedEnvironment = ASSETS.ENVIRONMENTS.find(
                  (env) => !EnvironmentLock.isEnvironmentLocked(env.name)
                );
                if (unlockedEnvironment) {
                  target.value = unlockedEnvironment.name;
                }
              }
              return; // Prevent onChange for locked environment
            }
            // Store current value as previous for next change
            target.setAttribute('data-previous-value', target.value);
          }

          if (!this.isInitializing) {
            await this.runSectionAction(section.actionId, target.value);
          }
        })();
      });
    });

    // Add toggle state change handlers
    this.setupToggleStateHandlers();

    // Try to initialize pg-split element cache
    // Use requestAnimationFrame to handle delayed element availability
    requestAnimationFrame(() => {
      if (!this.pgSplitElement) {
        const element = this.findPgSplitElement();
        if (element) {
          this.pgSplitElement = element;
          // Sync the toggle state with actual element state
          this.syncSplitRenderingToggleState();
        }
      }
    });
  }

  private static setupToggleStateHandlers(): void {
    if (!this.settingsPanel) return;
    const toggleInputs = this.settingsPanel.querySelectorAll('.toggle-switch input');
    toggleInputs.forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        const slider = target.nextElementSibling;
        if (!(slider instanceof HTMLElement)) return;
        const toggleCircle = slider.querySelector('span');
        if (!(toggleCircle instanceof HTMLElement)) return;

        if (target.checked) {
          slider.style.backgroundColor = 'rgba(0, 255, 136, 0.8)';
          toggleCircle.style.transform = 'translateX(26px)';
        } else {
          slider.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
          toggleCircle.style.transform = 'translateX(0)';
        }
      });
    });
  }

  private static setupEventListeners(): void {
    // Settings button click
    if (!this.settingsButton) return;
    this.settingsButton.addEventListener('click', () => {
      this.togglePanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && this.settingsPanel && this.settingsButton) {
        const target = e.target;
        if (
          target instanceof Node &&
          !this.settingsPanel.contains(target) &&
          !this.settingsButton.contains(target)
        ) {
          this.closePanel();
        }
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.isPanelOpen) {
        this.updatePanelWidth();
      }
    });
  }

  private static togglePanel(): void {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private static openPanel(): void {
    if (!this.settingsPanel || !this.settingsButton) return;
    this.settingsPanel.style.left = '0px';
    this.isPanelOpen = true;
    // Keep the button visible and on top
    this.settingsButton.style.transform = 'scale(1.1)';
    this.settingsButton.style.background = 'rgba(0, 0, 0, 0.9)';
    this.settingsButton.style.zIndex = CONFIG.SETTINGS.BUTTON_Z_INDEX.toString(); // Ensure button stays on top

    // Sync split rendering state when panel opens
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      this.syncSplitRenderingToggleState();
      this.syncGameHUDToggleState();
      this.syncInspectorToggleState();
    });
  }

  private static closePanel(): void {
    if (!this.settingsPanel || !this.settingsButton) return;
    const panelWidth = this.settingsPanel.offsetWidth;
    this.settingsPanel.style.left = `-${panelWidth}px`;
    this.isPanelOpen = false;
    this.settingsButton.style.transform = 'scale(1)';
    this.settingsButton.style.background = 'rgba(0, 0, 0, 0.7)';
    this.settingsButton.style.zIndex = CONFIG.SETTINGS.BUTTON_Z_INDEX.toString(); // Reset z-index
  }

  private static updatePanelWidth(): void {
    if (!this.settingsPanel) return;
    const viewWidth = window.innerWidth;

    // If screen width is less than threshold, use full viewport width (100vw)
    // Otherwise use the configured ratio
    if (viewWidth < CONFIG.SETTINGS.FULL_SCREEN_THRESHOLD) {
      this.settingsPanel.style.width = '100vw';
      // Ensure no horizontal overflow on small screens
      this.settingsPanel.style.boxSizing = 'border-box';
      this.settingsPanel.style.padding = '0';
      this.settingsPanel.style.margin = '0';
    } else {
      const panelWidth = Math.max(
        viewWidth * CONFIG.SETTINGS.PANEL_WIDTH_RATIO,
        CONFIG.SETTINGS.FULL_SCREEN_THRESHOLD
      );
      this.settingsPanel.style.width = `${panelWidth}px`;
      // Reset to normal styling for larger screens
      this.settingsPanel.style.boxSizing = '';
      this.settingsPanel.style.padding = '';
      this.settingsPanel.style.margin = '';
    }

    if (!this.isPanelOpen) {
      const currentWidth = this.settingsPanel.style.width;
      this.settingsPanel.style.left = `-${currentWidth}`;
    }
  }

  public static dispose(): void {
    if (this.settingsButton) {
      this.settingsButton.remove();
      this.settingsButton = null;
    }
    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }
  }

  public static changeCharacter(characterIndexOrName: number | string): void {
    if (this.sceneManager && !this.isInitializing) {
      // Get current character name before switching
      const currentCharacterName = this.getCurrentCharacterName();

      // Determine the character name being switched to
      let characterName: string | null = null;
      if (typeof characterIndexOrName === 'string') {
        characterName = characterIndexOrName;
      } else if (typeof characterIndexOrName === 'number') {
        const character = ASSETS.CHARACTERS[characterIndexOrName];
        if (character) {
          characterName = character.name;
        }
      }

      // Only update lastSelectedCharacterName if switching to a different character
      // Save the current character as the last selected before switching
      // This preserves the previous selection for use when current character gets locked
      if (
        characterName !== null &&
        currentCharacterName !== null &&
        characterName !== currentCharacterName
      ) {
        this.lastSelectedCharacterName = currentCharacterName;
      } else if (characterName !== null && currentCharacterName === null) {
        // Initial selection - no previous character to save
        this.lastSelectedCharacterName = characterName;
      }

      this.sceneManager.changeCharacter(characterIndexOrName);
    }
  }

  public static getCurrentCharacterName(): string | null {
    if (this.sceneManager) {
      return this.sceneManager.getCurrentCharacterName();
    }
    return null;
  }

  public static getLastSelectedCharacterName(): string | null {
    return this.lastSelectedCharacterName;
  }

  public static getCurrentEnvironmentName(): string | null {
    if (this.sceneManager) {
      return this.sceneManager.getCurrentEnvironment();
    }
    return null;
  }

  /**
   * Gets the scene from the scene manager if available
   * @returns The scene or null if scene manager is not initialized
   */
  public static getScene(): BABYLON.Scene | null {
    if (this.sceneManager) {
      return this.sceneManager.getScene();
    }
    return null;
  }

  /**
   * Gets the last selected environment name
   * @returns Last selected environment name or null if none
   */
  public static getLastSelectedEnvironmentName(): string | null {
    return this.lastSelectedEnvironmentName;
  }

  /**
   * Performs pause/clear/load/reposition/camera unlock after optional cutscene handling.
   */
  private static async runEnvironmentSwitchAfterCutscene(
    environmentName: string,
    previousEnvironmentName: string
  ): Promise<void> {
    if (!this.sceneManager) {
      return;
    }

    hideAllRemotePeers();

    if (environmentName !== previousEnvironmentName) {
      this.lastSelectedEnvironmentName = previousEnvironmentName;
    }

    this.sceneManager.pausePhysics();

    this.sceneManager.clearEnvironment();
    this.sceneManager.clearItems();
    this.sceneManager.clearParticles();

    await this.sceneManager.loadEnvironment(environmentName);

    await this.sceneManager.setupEnvironmentItems();

    this.sceneManager.repositionCharacter();

    this.sceneManager.forceActivateSmoothFollow();

    if (this.sceneManager.getCurrentCharacterName() !== null) {
      this.sceneManager.showPlayerMeshResumePhysicsAndRevealEnvironment();
    }
  }

  public static async changeEnvironment(
    environmentName: string,
    skipCutscene = false
  ): Promise<void> {
    if (!this.sceneManager) {
      return;
    }

    const currentEnvironment = this.sceneManager.getCurrentEnvironment();
    const environmentLoaded = this.sceneManager.isEnvironmentLoaded();
    if (currentEnvironment === environmentName && environmentLoaded) {
      return;
    }

    // MULTIPLAYER_SYNCH.md §4.8 env-authority lifecycle: this is the single chokepoint for
    // ALL env-change paths (portal via `switchToEnvironment`, the in-game settings
    // dropdown in `game_config.ts`, and the `environment_lock` fallback). Propagate the
    // change to the server BEFORE the cutscene / loadEnvironment kicks off so the PATCH
    // resolves concurrently with the visual transition and `envAuthority[newEnv]` is set
    // by the time the first sample tick fires for the new env. Without this, settings-
    // dropdown-based switches never reached the server (confirmed by the RV Life bug:
    // character-state updates reported `environmentName:"RV Life"` while the server still
    // recorded `client.EnvironmentName == "Mansion"`, no [EnvSwitch] or [EnvAuthority]
    // logs, no item-state-update broadcasts, presents/cake stuck ANIMATED in-air).
    //
    // Invariant P (pre-scene ownership) chokepoint: `mp.switchEnvironment` awaits the
    // server PATCH response, applies `envAuthority[newEnv]` to `ItemAuthorityTracker`,
    // and emits the synthetic `env-item-authority-changed` — all BEFORE `loadEnvironment`
    // runs below. By the time `CollectiblesManager.setupEnvironmentItems` spawns items,
    // the tracker lookup registered by `multiplayer_bootstrap.ts` can resolve ownership
    // synchronously, so each massful item is born DYNAMIC (owner) or ANIMATED (peer)
    // without an ANIMATED-then-promote flicker. Do not move the `await` below the
    // `loadEnvironment` call or the invariant is lost.
    try {
      const mp = getMultiplayerManager();
      if (mp.isMultiplayerActive()) {
        await mp.switchEnvironment(environmentName);
      }
    } catch (error) {
      console.warn('[SettingsUI] multiplayer env-switch propagation failed:', error);
    }

    this.closePanel();

    hideAllRemotePeers();

    if (!skipCutscene) {
      const foundEnv = ASSETS.ENVIRONMENTS.find((env) => env.name === environmentName);
      if (foundEnv) {
        const cutSceneProperty = foundEnv.cutScene;
        if (cutSceneProperty) {
          const cutSceneData = cutSceneProperty;
          if (
            typeof cutSceneData === 'object' &&
            cutSceneData !== null &&
            'type' in cutSceneData &&
            'visualUrl' in cutSceneData
          ) {
            const csType = cutSceneData.type;
            const csVisualUrl = cutSceneData.visualUrl;
            if ((csType === 'image' || csType === 'video') && typeof csVisualUrl === 'string') {
              const scene = this.sceneManager.getScene();
              if (scene) {
                try {
                  await AudioManager.stopAndDisposeBackgroundMusic(500);
                } catch {
                  // Ignore errors stopping background music
                }

                const concurrent = cutSceneData.concurrent ?? false;
                const fadeInEnabled =
                  'fadeInEnabled' in cutSceneData ? cutSceneData.fadeInEnabled : false;
                const fadeOutEnabled = cutSceneData.fadeOutEnabled ?? false;
                const fadeDurationCandidate =
                  'fadeDurationMs' in cutSceneData ? cutSceneData.fadeDurationMs : undefined;
                const fadeDurationMs =
                  typeof fadeDurationCandidate === 'number' &&
                  Number.isFinite(fadeDurationCandidate) &&
                  fadeDurationCandidate > 0
                    ? fadeDurationCandidate
                    : undefined;

                const cutScene: CutScene = {
                  type: csType,
                  visualUrl: csVisualUrl,
                  audioUrl:
                    'audioUrl' in cutSceneData && typeof cutSceneData.audioUrl === 'string'
                      ? cutSceneData.audioUrl
                      : undefined,
                  ...(concurrent ? { concurrent: true } : {}),
                  ...(fadeInEnabled ? { fadeInEnabled: true } : {}),
                  ...(fadeOutEnabled ? { fadeOutEnabled: true } : {}),
                  ...(fadeDurationMs !== undefined ? { fadeDurationMs } : {})
                };

                const loadEnv = (): Promise<void> =>
                  SettingsUI.runEnvironmentSwitchAfterCutscene(environmentName, currentEnvironment);

                if (concurrent) {
                  await Promise.all([
                    CutSceneManager.playCutScene(scene, cutScene).catch(() => {
                      // Cutscene failed; environment load continues
                    }),
                    loadEnv()
                  ]);
                } else {
                  try {
                    await CutSceneManager.playCutScene(scene, cutScene);
                  } catch {
                    // Cutscene failed, continue with environment switch
                  }
                  await loadEnv();
                }
                return;
              }
            }
          }
        }
      }
    }

    await SettingsUI.runEnvironmentSwitchAfterCutscene(environmentName, currentEnvironment);
  }

  /**
   * Toggles visibility of Babylon Playground UI elements
   * These elements are created by the Babylon Playground infrastructure, not our codebase
   * @param visible - true to show elements, false to hide them
   */
  public static togglePlaygroundUI(visible: boolean): void {
    // CSS classes for Babylon Playground UI elements (external to our codebase)
    const playgroundUIClasses = [
      'command-bar',
      'logo-area',
      'version-number',
      'hamburger-button',
      'fps',
      'links'
    ];

    // Find all elements with target classes
    const elements: HTMLElement[] = [];
    playgroundUIClasses.forEach((className) => {
      const foundElements = document.querySelectorAll(`.${className}`);
      foundElements.forEach((element) => {
        if (element instanceof HTMLElement) {
          elements.push(element);
        }
      });
    });

    // Cache initial display styles on first toggle OFF
    if (!visible && this.playgroundUICache.size === 0) {
      elements.forEach((element) => {
        if (!this.playgroundUICache.has(element)) {
          const computedStyle = window.getComputedStyle(element);
          const displayValue = computedStyle.display;
          this.playgroundUICache.set(element, displayValue);
        }
      });
    }

    // Apply visibility changes
    if (visible) {
      // Restore from cache
      this.playgroundUICache.forEach((displayValue, element) => {
        if (element.isConnected) {
          element.style.display = displayValue;
        }
      });
    } else {
      // Hide elements
      elements.forEach((element) => {
        // Cache if not already cached
        if (!this.playgroundUICache.has(element)) {
          const computedStyle = window.getComputedStyle(element);
          const displayValue = computedStyle.display;
          this.playgroundUICache.set(element, displayValue);
        }
        element.style.display = 'none';
      });
    }

    // If no elements found, try again with delayed initialization
    if (elements.length === 0) {
      this.attemptDelayedPlaygroundUIToggle(visible, 0);
    }
  }

  /**
   * Attempts to find and toggle playground UI elements with retries
   * Handles cases where elements may not exist yet
   */
  private static attemptDelayedPlaygroundUIToggle(visible: boolean, attempt: number): void {
    const retryDelays = [100, 500, 1000]; // milliseconds
    const maxAttempts = retryDelays.length;

    if (attempt >= maxAttempts) {
      return; // Give up after max attempts
    }

    setTimeout(() => {
      // Try to find elements again
      const playgroundUIClasses = [
        'command-bar',
        'logo-area',
        'version-number',
        'hamburger-button',
        'fps',
        'links'
      ];

      const elements: HTMLElement[] = [];
      playgroundUIClasses.forEach((className) => {
        const foundElements = document.querySelectorAll(`.${className}`);
        foundElements.forEach((element) => {
          if (element instanceof HTMLElement) {
            elements.push(element);
          }
        });
      });

      if (elements.length > 0) {
        // Found elements, now toggle them
        if (!visible && this.playgroundUICache.size === 0) {
          elements.forEach((element) => {
            if (!this.playgroundUICache.has(element)) {
              const computedStyle = window.getComputedStyle(element);
              const displayValue = computedStyle.display;
              this.playgroundUICache.set(element, displayValue);
            }
          });
        }

        if (visible) {
          this.playgroundUICache.forEach((displayValue, element) => {
            if (element.isConnected) {
              element.style.display = displayValue;
            }
          });
        } else {
          elements.forEach((element) => {
            if (!this.playgroundUICache.has(element)) {
              const computedStyle = window.getComputedStyle(element);
              const displayValue = computedStyle.display;
              this.playgroundUICache.set(element, displayValue);
            }
            element.style.display = 'none';
          });
        }
      } else {
        // Still no elements, try again
        this.attemptDelayedPlaygroundUIToggle(visible, attempt + 1);
      }
    }, retryDelays[attempt]);
  }

  /**
   * Finds and caches the pg-split element
   * @returns The element if found, null otherwise
   */
  private static findPgSplitElement(): HTMLElement | null {
    const element = document.getElementById('pg-split');
    if (element instanceof HTMLElement) {
      return element;
    }
    return null;
  }

  /**
   * Toggles the hidden class on all children of the pg-split element
   * @param hidden - true to add hidden class, false to remove hidden class
   */
  private static togglePgSplitChildrenHidden(hidden: boolean): void {
    // Get pg-split element (use cache or find it)
    let pgSplit: HTMLElement | null = null;

    if (this.pgSplitElement && this.pgSplitElement.isConnected) {
      pgSplit = this.pgSplitElement;
    } else {
      pgSplit = this.findPgSplitElement();
      if (pgSplit) {
        this.pgSplitElement = pgSplit;
      }
    }

    if (!pgSplit) {
      return; // Element not found, cannot toggle children
    }

    // Get all children elements
    const children = pgSplit.children;

    // Iterate through all children and toggle hidden class
    // Skip the child with id='canvasZone'
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof HTMLElement) {
        // Skip canvasZone element
        if (child.id === 'canvasZone') {
          continue;
        }
        if (hidden) {
          child.classList.add('hidden');
        } else {
          child.classList.remove('hidden');
        }
      }
    }
  }

  /**
   * Gets the current state of split rendering (whether disabled)
   * @returns true if disable-split-rendering class exists, false otherwise
   */
  public static getSplitRenderingState(): boolean {
    // Check if cached element exists and is still connected
    if (this.pgSplitElement && this.pgSplitElement.isConnected) {
      return this.pgSplitElement.classList.contains('disable-split-rendering');
    }

    // Try to find the element
    const element = this.findPgSplitElement();
    if (element) {
      this.pgSplitElement = element;
      return element.classList.contains('disable-split-rendering');
    }

    return false;
  }

  /**
   * Toggles the split rendering by adding/removing the disable-split-rendering class
   * Also toggles the hidden class on all children of pg-split
   * @param disabled - true to disable (add class), false to enable (remove class)
   */
  public static toggleSplitRendering(disabled: boolean): void {
    // Check if cached element exists and is still connected
    if (this.pgSplitElement && this.pgSplitElement.isConnected) {
      if (disabled) {
        this.pgSplitElement.classList.add('disable-split-rendering');
      } else {
        this.pgSplitElement.classList.remove('disable-split-rendering');
      }
      // Toggle hidden class on all children
      this.togglePgSplitChildrenHidden(disabled);
      return;
    }

    // Try to find the element
    const element = this.findPgSplitElement();
    if (element) {
      this.pgSplitElement = element;
      if (disabled) {
        element.classList.add('disable-split-rendering');
      } else {
        element.classList.remove('disable-split-rendering');
      }
      // Toggle hidden class on all children
      this.togglePgSplitChildrenHidden(disabled);
    } else {
      // Element not found, try delayed initialization
      this.attemptDelayedSplitRenderingToggle(disabled, 0);
    }
  }

  /**
   * Attempts to find and toggle the split rendering with retries
   * Handles cases where element may not exist yet
   * Uses requestAnimationFrame with frame counting for retries
   */
  private static attemptDelayedSplitRenderingToggle(disabled: boolean, attempt: number): void {
    const retryFrameCounts = [6, 30, 60]; // frames at 60fps: ~100ms, ~500ms, ~1000ms
    const maxAttempts = retryFrameCounts.length;

    if (attempt >= maxAttempts) {
      return; // Give up after max attempts
    }

    let frameCount = 0;
    const maxFrames = retryFrameCounts[attempt]!;

    const tryFindElement = () => {
      frameCount++;
      if (frameCount >= maxFrames) {
        const element = this.findPgSplitElement();
        if (element) {
          this.pgSplitElement = element;
          if (disabled) {
            element.classList.add('disable-split-rendering');
          } else {
            element.classList.remove('disable-split-rendering');
          }
          // Toggle hidden class on all children
          this.togglePgSplitChildrenHidden(disabled);
        } else {
          // Still not found, try again
          this.attemptDelayedSplitRenderingToggle(disabled, attempt + 1);
        }
      } else {
        requestAnimationFrame(tryFindElement);
      }
    };

    requestAnimationFrame(tryFindElement);
  }

  /**
   * Syncs the toggle UI state with the actual element class state
   * Should be called when settings panel opens
   */
  private static syncSplitRenderingToggleState(): void {
    if (!this.settingsPanel) return;

    // Find the Full Screen section index
    const sectionIndex = CONFIG.SETTINGS.SECTIONS.findIndex(
      (section) => section.title === 'Full Screen'
    );

    if (sectionIndex === -1) return;

    // Find the toggle input for this section
    const toggleInputElement = this.settingsPanel.querySelector(
      `input[data-section-index="${sectionIndex}"]`
    );

    if (!(toggleInputElement instanceof HTMLInputElement)) return;
    const toggleInput = toggleInputElement;

    // Get actual element state (true if disabled, false if enabled)
    const actualState = this.getSplitRenderingState();

    // Update toggle UI to match actual state
    if (toggleInput.checked !== actualState) {
      toggleInput.checked = actualState;
      // Trigger visual update
      const slider = toggleInput.nextElementSibling;
      if (slider instanceof HTMLElement) {
        const toggleCircle = slider.querySelector('span');
        if (toggleCircle instanceof HTMLElement) {
          if (actualState) {
            slider.style.backgroundColor = 'rgba(0, 255, 136, 0.8)';
            toggleCircle.style.transform = 'translateX(26px)';
          } else {
            slider.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            toggleCircle.style.transform = 'translateX(0)';
          }
        }
      }
    }
  }

  /**
   * Gets the current visibility state of the Game HUD
   * @returns true if HUD is visible, false if hidden or not found
   */
  public static getGameHUDState(): boolean {
    const hudElement = document.getElementById('game-hud');
    if (hudElement instanceof HTMLElement) {
      const computedStyle = window.getComputedStyle(hudElement);
      const display = computedStyle.display;
      return display !== 'none';
    }
    // If element doesn't exist, assume visible (default state)
    return true;
  }

  /**
   * Toggles the visibility of the Game HUD container
   * @param visible - true to show HUD, false to hide HUD
   */
  public static toggleGameHUD(visible: boolean): void {
    const hudElement = document.getElementById('game-hud');
    if (hudElement instanceof HTMLElement) {
      if (visible) {
        // Restore cached display style, or default to 'flex' if cache is null
        const displayValue = this.hudDisplayCache ?? 'flex';
        hudElement.style.display = displayValue;
        // Trigger fade-in animation for all HUD elements when HUD is toggled back on
        HUDManager.triggerFadeIn();
      } else {
        // Cache the current display style if not already cached
        if (this.hudDisplayCache === null) {
          const computedStyle = window.getComputedStyle(hudElement);
          this.hudDisplayCache = computedStyle.display;
        }
        hudElement.style.display = 'none';
      }
    }
    // If element doesn't exist yet, it will be handled when HUD is created
    // The toggle state will be synced when settings panel opens
  }

  /**
   * Finds the Inspector button element
   * @returns The button element if found, null otherwise
   */
  private static findInspectorButton(): HTMLElement | null {
    // Find all command buttons
    const buttons = document.querySelectorAll('.command-button');

    // Iterate through buttons to find the one with title 'Inspector'
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (button instanceof HTMLElement) {
        const title = button.getAttribute('title');
        if (title === 'Inspector') {
          return button;
        }
      }
    }

    return null;
  }

  private static isPlaygroundHost(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        window.location.hostname.includes('playground.babylonjs.com')
      );
    } catch {
      return false;
    }
  }

  private static getLocalInspectorState(): boolean {
    const scene = this.getScene();
    if (!scene) {
      return false;
    }

    try {
      return scene.debugLayer.isVisible();
    } catch {
      return false;
    }
  }

  private static toggleLocalInspector(visible: boolean): void {
    const scene = this.getScene();
    if (!scene) {
      return;
    }

    const forceResize = () => {
      try {
        scene.getEngine().resize();
      } catch {
        // Ignore resize errors.
      }
    };

    const scheduleResizePasses = () => {
      forceResize();
      requestAnimationFrame(() => {
        forceResize();
        requestAnimationFrame(() => {
          forceResize();
        });
      });

      setTimeout(() => {
        forceResize();
      }, 120);

      setTimeout(() => {
        forceResize();
      }, 260);
    };

    try {
      if (visible) {
        void scene.debugLayer.show().then(() => {
          scheduleResizePasses();
        });
      } else {
        scene.debugLayer.hide();
        scheduleResizePasses();
      }
    } catch {
      // Ignore local inspector errors.
    }
  }

  /**
   * Finds the Inspector container element (embed-host or embed)
   * @returns The element if found, null otherwise
   */
  private static findInspectorElement(): HTMLElement | null {
    // Try embed-host first (parent container)
    let element = document.getElementById('embed-host');
    if (element instanceof HTMLElement) {
      return element;
    }

    // Try embedHost (alternative naming)
    element = document.getElementById('embedHost');
    if (element instanceof HTMLElement) {
      return element;
    }

    // Fall back to embed (for backwards compatibility)
    element = document.getElementById('embed');
    if (element instanceof HTMLElement) {
      return element;
    }

    return null;
  }

  /**
   * Gets the current state of the Inspector by checking the button state
   * @returns true if Inspector is active, false if inactive or not found
   */
  public static getInspectorState(): boolean {
    // Check if cached button exists and is still connected
    if (this.inspectorButton && this.inspectorButton.isConnected) {
      // Check button state indicators
      const ariaPressed = this.inspectorButton.getAttribute('aria-pressed');
      const dataChecked = this.inspectorButton.getAttribute('data-checked');
      const hasActiveClass = this.inspectorButton.classList.contains('active');
      const hasCheckedClass = this.inspectorButton.classList.contains('checked');

      // Return true if any indicator shows button is active
      if (ariaPressed === 'true' || dataChecked === 'true' || hasActiveClass || hasCheckedClass) {
        return true;
      }

      // Fallback: check if embed element is visible
      const embedElement = this.findInspectorElement();
      if (embedElement) {
        const computedStyle = window.getComputedStyle(embedElement);
        const visibility = computedStyle.visibility;
        const display = computedStyle.display;
        return visibility !== 'hidden' && display !== 'none';
      }

      return false;
    }

    // Try to find the button
    const button = this.findInspectorButton();
    if (button) {
      this.inspectorButton = button;
      // Check button state indicators
      const ariaPressed = button.getAttribute('aria-pressed');
      const dataChecked = button.getAttribute('data-checked');
      const hasActiveClass = button.classList.contains('active');
      const hasCheckedClass = button.classList.contains('checked');

      // Return true if any indicator shows button is active
      if (ariaPressed === 'true' || dataChecked === 'true' || hasActiveClass || hasCheckedClass) {
        return true;
      }

      // Fallback: check if embed element is visible
      const embedElement = this.findInspectorElement();
      if (embedElement) {
        const computedStyle = window.getComputedStyle(embedElement);
        const visibility = computedStyle.visibility;
        const display = computedStyle.display;
        return visibility !== 'hidden' && display !== 'none';
      }

      return false;
    }

    // If button doesn't exist, check embed element as fallback
    const embedElement = this.findInspectorElement();
    if (embedElement) {
      const computedStyle = window.getComputedStyle(embedElement);
      const visibility = computedStyle.visibility;
      const display = computedStyle.display;
      return visibility !== 'hidden' && display !== 'none';
    }

    // Local dev fallback: read Babylon DebugLayer state directly from the scene.
    if (!this.isPlaygroundHost()) {
      return this.getLocalInspectorState();
    }

    // If nothing found, assume inactive (default state)
    return false;
  }

  /**
   * Toggles the Inspector by clicking the Inspector button
   * @param visible - true to show Inspector, false to hide Inspector
   */
  public static toggleInspector(visible: boolean): void {
    // Check if cached button exists and is still connected
    if (this.inspectorButton && this.inspectorButton.isConnected) {
      // Check current button state
      const currentState = this.getInspectorState();

      // Only click if state doesn't match desired state
      if (currentState !== visible) {
        this.inspectorButton.click();
      }
      return;
    }

    // Try to find the button
    const button = this.findInspectorButton();
    if (button) {
      this.inspectorButton = button;
      // Check current button state
      const currentState = this.getInspectorState();

      // Only click if state doesn't match desired state
      if (currentState !== visible) {
        button.click();
      }
    } else {
      // In local runtime, use Babylon's DebugLayer API directly.
      if (!this.isPlaygroundHost()) {
        this.toggleLocalInspector(visible);
        return;
      }

      // Button not found, try delayed initialization
      this.attemptDelayedInspectorToggle(visible, 0);
    }
  }

  /**
   * Attempts to find and toggle the Inspector button with retries
   * Handles cases where button may not exist yet
   * Uses requestAnimationFrame with frame counting for retries
   */
  private static attemptDelayedInspectorToggle(visible: boolean, attempt: number): void {
    const retryFrameCounts = [6, 30, 60]; // frames at 60fps: ~100ms, ~500ms, ~1000ms
    const maxAttempts = retryFrameCounts.length;

    if (attempt >= maxAttempts) {
      return; // Give up after max attempts
    }

    let frameCount = 0;
    const maxFrames = retryFrameCounts[attempt]!;

    const tryFindButton = () => {
      frameCount++;
      if (frameCount >= maxFrames) {
        const button = this.findInspectorButton();
        if (button) {
          this.inspectorButton = button;
          // Check current button state
          const currentState = this.getInspectorState();

          // Only click if state doesn't match desired state
          if (currentState !== visible) {
            button.click();
          }
        } else {
          // Still not found, try again
          this.attemptDelayedInspectorToggle(visible, attempt + 1);
        }
      } else {
        requestAnimationFrame(tryFindButton);
      }
    };

    requestAnimationFrame(tryFindButton);
  }

  /**
   * Syncs the toggle UI state with the actual Inspector visibility state
   * Should be called when settings panel opens
   */
  private static syncInspectorToggleState(): void {
    if (!this.settingsPanel) return;

    // Find the Inspector section index
    const sectionIndex = CONFIG.SETTINGS.SECTIONS.findIndex(
      (section) => section.title === 'Inspector'
    );

    if (sectionIndex === -1) return;

    // Find the toggle input for this section
    const toggleInputElement = this.settingsPanel.querySelector(
      `input[data-section-index="${sectionIndex}"]`
    );

    if (!(toggleInputElement instanceof HTMLInputElement)) return;
    const toggleInput = toggleInputElement;

    // Get actual Inspector visibility state
    const actualState = this.getInspectorState();

    // Update toggle UI to match actual state
    if (toggleInput.checked !== actualState) {
      toggleInput.checked = actualState;
      // Trigger visual update
      const slider = toggleInput.nextElementSibling;
      if (slider instanceof HTMLElement) {
        const toggleCircle = slider.querySelector('span');
        if (toggleCircle instanceof HTMLElement) {
          if (actualState) {
            slider.style.backgroundColor = 'rgba(0, 255, 136, 0.8)';
            toggleCircle.style.transform = 'translateX(26px)';
          } else {
            slider.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            toggleCircle.style.transform = 'translateX(0)';
          }
        }
      }
    }
  }

  /**
   * Syncs the toggle UI state with the actual HUD visibility state
   * Should be called when settings panel opens
   */
  private static syncGameHUDToggleState(): void {
    if (!this.settingsPanel) return;

    // Find the Game HUD section index
    const sectionIndex = CONFIG.SETTINGS.SECTIONS.findIndex(
      (section) => section.title === 'Game HUD'
    );

    if (sectionIndex === -1) return;

    // Find the toggle input for this section
    const toggleInputElement = this.settingsPanel.querySelector(
      `input[data-section-index="${sectionIndex}"]`
    );

    if (!(toggleInputElement instanceof HTMLInputElement)) return;
    const toggleInput = toggleInputElement;

    // Get actual HUD visibility state
    const actualState = this.getGameHUDState();

    // Update toggle UI to match actual state
    if (toggleInput.checked !== actualState) {
      toggleInput.checked = actualState;
      // Trigger visual update
      const slider = toggleInput.nextElementSibling;
      if (slider instanceof HTMLElement) {
        const toggleCircle = slider.querySelector('span');
        if (toggleCircle instanceof HTMLElement) {
          if (actualState) {
            slider.style.backgroundColor = 'rgba(0, 255, 136, 0.8)';
            toggleCircle.style.transform = 'translateX(26px)';
          } else {
            slider.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            toggleCircle.style.transform = 'translateX(0)';
          }
        }
      }
    }
  }

  /**
   * Global cleanup method to remove all SettingsUI elements from DOM
   */
  public static cleanup(): void {
    // Remove ALL settings buttons and panels (more aggressive)
    const allButtons = document.querySelectorAll('#settings-button');
    allButtons.forEach((button) => {
      button.remove();
    });

    const allPanels = document.querySelectorAll('#settings-panel');
    allPanels.forEach((panel) => {
      panel.remove();
    });

    // Nuclear option - remove ANY div with settings gear icon
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach((div) => {
      if (
        div.innerHTML.includes(
          'M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z'
        ) &&
        div.style.position === 'fixed' &&
        div.style.bottom === '20px' &&
        div.style.left === '20px'
      ) {
        div.remove();
      }
    });

    // Also remove by static reference if it exists
    if (this.settingsButton) {
      this.settingsButton.remove();
      this.settingsButton = null;
    }

    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }

    // Reset state
    this.isPanelOpen = false;
    this.sceneManager = null;
    // Clear playground UI cache
    this.playgroundUICache.clear();
    // Clear pg-split element cache
    this.pgSplitElement = null;
    // Clear HUD display cache
    this.hudDisplayCache = null;
    // Clear Inspector button cache
    this.inspectorButton = null;
  }
}
