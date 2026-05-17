// ============================================================================
// INVENTORY UI
// ============================================================================

import { CONFIG } from '../config/game_config';
import { InventoryManager } from '../managers/inventory_manager';
import { Notification } from '../utils/notification';

import {
  applyOverlayButtonBaseStyles,
  bindOutsideClose,
  bindOverlayPressFeedback,
  bindOverlayToggle,
  bindPreventTextSelection
} from './overlay_button_utils';

import type { OutsideCloseBinding, OverlayToggleBinding } from './overlay_button_utils';
import type { SceneManager } from '../managers/scene_manager';

export class InventoryUI {
  private static inventoryButton: HTMLDivElement | null = null;
  private static inventoryPanel: HTMLDivElement | null = null;
  public static isPanelOpen = false;
  private static sceneManager: SceneManager | null = null;
  private static toggleBinding: OverlayToggleBinding | null = null;
  private static pressBinding: OverlayToggleBinding | null = null;
  private static selectionBinding: OverlayToggleBinding | null = null;
  private static outsideCloseBinding: OutsideCloseBinding | null = null;

  /**
   * Initializes the InventoryUI
   * @param canvas The canvas element
   * @param sceneManager The scene manager
   */
  public static initialize(canvas: HTMLCanvasElement, sceneManager?: SceneManager): void {
    // Clean up first
    this.cleanup();

    this.sceneManager = sceneManager ?? null;
    this.createInventoryButton(canvas);
    this.createInventoryPanel(canvas);
    this.setupEventListeners();
    this.updateInventoryButton(); // Initialize button state
  }

  /**
   * Creates the inventory button
   * @param canvas The canvas element
   */
  private static createInventoryButton(canvas: HTMLCanvasElement): void {
    void canvas;
    // Remove existing button if any
    if (this.inventoryButton) {
      this.inventoryButton.remove();
    }

    this.inventoryButton = document.createElement('div');
    this.inventoryButton.id = 'inventory-button';
    this.inventoryButton.textContent = '🎒';
    applyOverlayButtonBaseStyles(this.inventoryButton, {
      corner: 'bottom-right',
      zIndex: CONFIG.INVENTORY.BUTTON_Z_INDEX
    });
    this.inventoryButton.style.background = 'rgba(0, 0, 0, 0.7)';
    this.inventoryButton.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    this.inventoryButton.style.fontSize = '20px';
    this.inventoryButton.style.color = 'white';
    this.inventoryButton.style.backdropFilter = 'blur(10px)';

    document.body.appendChild(this.inventoryButton);

    // Set initial button state based on inventory
    this.updateInventoryButton();
  }

  /**
   * Creates the inventory panel
   * @param canvas The canvas element
   */
  private static createInventoryPanel(canvas: HTMLCanvasElement): void {
    void canvas;
    // Remove existing panel if any
    if (this.inventoryPanel) {
      this.inventoryPanel.remove();
    }

    this.inventoryPanel = document.createElement('div');
    this.inventoryPanel.id = 'inventory-panel';
    this.inventoryPanel.style.cssText = `
            position: fixed;
            top: 0;
            right: -100%;
            width: ${this.getPanelWidth()}px;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(20px);
            border-left: 2px solid rgba(255, 255, 255, 0.2);
            z-index: ${CONFIG.INVENTORY.Z_INDEX};
            transition: right 0.3s ease;
            color: white;
            font-family: Arial, sans-serif;
            overflow-y: auto;
        `;

    this.updateInventoryContent();
    document.body.appendChild(this.inventoryPanel);
  }

  /**
   * Gets the panel width based on screen size
   * @returns Panel width in pixels
   */
  private static getPanelWidth(): number {
    const screenWidth = window.innerWidth;
    if (screenWidth <= CONFIG.INVENTORY.FULL_SCREEN_THRESHOLD) {
      return screenWidth;
    }
    return screenWidth * CONFIG.INVENTORY.PANEL_WIDTH_RATIO;
  }

  /**
   * Applies panel styles to ensure they persist after content updates.
   * This method can be called multiple times safely to re-apply styles.
   */
  private static applyPanelStyles(): void {
    if (!this.inventoryPanel) return;

    // Store current panel state to preserve it
    const isOpen = this.isPanelOpen;
    const currentRight = this.inventoryPanel.style.right;

    // Re-apply panel styles to ensure they persist
    // Note: We set right separately to preserve panel state
    this.inventoryPanel.style.cssText = `
            position: fixed;
            top: 0;
            width: ${this.getPanelWidth()}px;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(20px);
            border-left: 2px solid rgba(255, 255, 255, 0.2);
            z-index: ${CONFIG.INVENTORY.Z_INDEX};
            transition: right 0.3s ease;
            color: white;
            font-family: Arial, sans-serif;
            overflow-y: auto;
        `;

    // Restore panel position state
    if (isOpen) {
      this.inventoryPanel.style.right = '0';
    } else if (currentRight && currentRight !== '0') {
      // Preserve the current right value if it was set and panel is closed
      this.inventoryPanel.style.right = currentRight;
    } else {
      // Default to closed position
      this.inventoryPanel.style.right = '-100%';
    }

    // Ensure header sticky positioning is maintained
    const header = this.inventoryPanel.querySelector('.inventory-header');
    if (header instanceof HTMLElement) {
      header.style.position = 'sticky';
      header.style.top = '0';
      header.style.zIndex = '1';
    }
  }

  /**
   * Updates the inventory content
   */
  public static updateInventoryContent(): void {
    if (!this.inventoryPanel) return;

    const inventoryItems = InventoryManager.getInventoryItems();
    const itemsHTML = Array.from(inventoryItems.entries())
      .map(([itemName, itemData]) => {
        const tileSize = Math.max(
          itemData.count > 0 ? 120 : 80,
          Math.min(200, window.innerWidth * 0.15)
        );
        return `
                <div class="inventory-item" data-item-name="${itemName}" style="
                    width: ${tileSize}px;
                    height: ${tileSize}px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    margin: 10px;
                    display: inline-block;
                    position: relative;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-align: center;
                    padding: 10px;
                    box-sizing: border-box;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <img src="${itemData.thumbnail}" alt="${itemName}" style="
                        width: 60%;
                        height: 60%;
                        object-fit: contain;
                        margin-bottom: 5px;
                    ">
                    <div style="
                        font-size: 12px;
                        color: white;
                        margin-bottom: 5px;
                    ">${itemName}</div>
                    <div style="
                        position: absolute;
                        top: -5px;
                        right: -5px;
                        background: rgba(255, 68, 68, 0.9);
                        color: white;
                        border-radius: 50%;
                        width: 25px;
                        height: 25px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        font-weight: bold;
                    ">${itemData.count}</div>
                </div>
            `;
      })
      .join('');

    this.inventoryPanel.innerHTML = `
            <div class="inventory-header" style="
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
            ">
                <h2 style="
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                    color: white;
                ">${CONFIG.INVENTORY.HEADING_TEXT}</h2>
            </div>
            <div class="inventory-content" style="
                padding: 20px;
                box-sizing: border-box;
                max-width: 100%;
                overflow-x: hidden;
            ">
                <div style="
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 10px;
                ">
                    ${itemsHTML}
                </div>
            </div>
        `;

    // Re-apply panel styles to ensure they persist after innerHTML update
    this.applyPanelStyles();

    // Add click event listeners to inventory items
    const itemElements = this.inventoryPanel.querySelectorAll('.inventory-item');
    itemElements.forEach((element) => {
      element.addEventListener('click', (e) => {
        const target = e.currentTarget;
        if (target instanceof HTMLElement) {
          const itemName = target.getAttribute('data-item-name');
          if (itemName != null) {
            this.useItem(itemName);
          }
        }
      });
    });
  }

  /**
   * Uses an inventory item
   * @param itemName The name of the item to use
   */
  private static useItem(itemName: string): void {
    const success = InventoryManager.useInventoryItem(itemName);
    if (success) {
      this.updateInventoryContent();
      this.updateInventoryButton();
      // Show a brief feedback
      this.showItemUsedFeedback(itemName);
    }
  }

  /**
   * Shows feedback when an item is used
   * @param itemName The name of the item used
   */
  private static showItemUsedFeedback(itemName: string): void {
    const scene = this.sceneManager?.getScene();
    if (!scene) {
      return;
    }

    Notification.create({
      message: `Used ${itemName}!`,
      delay: 0,
      duration: 2000,
      scene,
      background: 'rgba(0, 255, 136, 0.9)',
      color: 'black',
      padding: '20px',
      borderRadius: '10px',
      fontSize: '18px',
      fontWeight: 'bold',
      position: 'center',
      zIndex: 9999
    });
  }

  /**
   * Sets up event listeners
   */
  private static setupEventListeners(): void {
    this.removeOverlayBindings();

    if (!this.inventoryButton || !this.inventoryPanel) return;

    this.selectionBinding = bindPreventTextSelection(this.inventoryButton);
    this.pressBinding = bindOverlayPressFeedback(this.inventoryButton);
    this.toggleBinding = bindOverlayToggle(this.inventoryButton, () => {
      this.togglePanel();
    });
    this.outsideCloseBinding = bindOutsideClose({
      panel: this.inventoryPanel,
      trigger: this.inventoryButton,
      isOpen: () => this.isPanelOpen,
      onClose: () => {
        this.closePanel();
      }
    });

    window.addEventListener('resize', this.handleWindowResize);
  }

  private static handleWindowResize = (): void => {
    if (this.isPanelOpen) {
      this.updatePanelWidth();
    }
  };

  private static removeOverlayBindings(): void {
    this.toggleBinding?.remove();
    this.pressBinding?.remove();
    this.selectionBinding?.remove();
    this.outsideCloseBinding?.remove();
    this.toggleBinding = null;
    this.pressBinding = null;
    this.selectionBinding = null;
    this.outsideCloseBinding = null;
    window.removeEventListener('resize', this.handleWindowResize);
  }

  /**
   * Toggles the inventory panel
   */
  private static togglePanel(): void {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  /**
   * Opens the inventory panel
   */
  private static openPanel(): void {
    if (this.inventoryPanel) {
      this.inventoryPanel.style.right = '0';
      this.isPanelOpen = true;
      this.updateInventoryContent();
      this.updateInventoryButton();
      // Keep the button visible and on top - no transform animation
      if (this.inventoryButton) {
        this.inventoryButton.style.background = 'rgba(0, 0, 0, 0.9)';
        this.inventoryButton.style.zIndex = CONFIG.INVENTORY.BUTTON_Z_INDEX.toString();
      }
    }
  }

  /**
   * Closes the inventory panel
   */
  private static closePanel(): void {
    if (this.inventoryPanel) {
      this.inventoryPanel.style.right = '-100%';
      this.isPanelOpen = false;
      if (this.inventoryButton) {
        this.inventoryButton.style.background = 'rgba(0, 0, 0, 0.7)';
        this.inventoryButton.style.zIndex = CONFIG.INVENTORY.BUTTON_Z_INDEX.toString();
      }
    }
  }

  /**
   * Updates the panel width
   */
  private static updatePanelWidth(): void {
    if (this.inventoryPanel) {
      const viewWidth = window.innerWidth;

      // If screen width is less than threshold, use full viewport width (100vw)
      // Otherwise use the configured ratio
      if (viewWidth < CONFIG.INVENTORY.FULL_SCREEN_THRESHOLD) {
        this.inventoryPanel.style.width = '100vw';
        // Ensure no horizontal overflow on small screens
        this.inventoryPanel.style.boxSizing = 'border-box';
        this.inventoryPanel.style.padding = '0';
        this.inventoryPanel.style.margin = '0';
      } else {
        const panelWidth = Math.max(
          viewWidth * CONFIG.INVENTORY.PANEL_WIDTH_RATIO,
          CONFIG.INVENTORY.FULL_SCREEN_THRESHOLD
        );
        this.inventoryPanel.style.width = `${panelWidth}px`;
        // Reset to normal styling for larger screens
        this.inventoryPanel.style.boxSizing = '';
        this.inventoryPanel.style.padding = '';
        this.inventoryPanel.style.margin = '';
      }

      if (!this.isPanelOpen) {
        const currentWidth = this.inventoryPanel.style.width;
        this.inventoryPanel.style.right = `-${currentWidth}`;
      }
    }
  }

  /**
   * Updates the inventory button to show item count
   */
  public static updateInventoryButton(): void {
    if (this.inventoryButton) {
      const inventoryItems = InventoryManager.getInventoryItems();
      const totalItems = Array.from(inventoryItems.values()).reduce(
        (sum, item) => sum + item.count,
        0
      );

      this.inventoryButton.style.display = 'flex';
      this.inventoryButton.style.zIndex = CONFIG.INVENTORY.BUTTON_Z_INDEX.toString();

      if (totalItems > 0) {
        this.inventoryButton.style.opacity = '1';
        this.inventoryButton.style.borderColor = 'rgba(255, 255, 255, 0.6)';
        this.inventoryButton.style.color = 'white';
      } else {
        this.inventoryButton.style.opacity = '0.5';
        this.inventoryButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        this.inventoryButton.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    }
  }

  /**
   * Disposes the InventoryUI
   */
  public static dispose(): void {
    if (this.inventoryButton) {
      this.inventoryButton.remove();
      this.inventoryButton = null;
    }
    if (this.inventoryPanel) {
      this.inventoryPanel.remove();
      this.inventoryPanel = null;
    }
    this.isPanelOpen = false;
    this.sceneManager = null;
  }

  /**
   * Refreshes the inventory display
   */
  public static refreshInventory(): void {
    this.updateInventoryContent();
    this.updateInventoryButton();
  }

  /**
   * Global cleanup method to remove all InventoryUI elements from DOM
   */
  public static cleanup(): void {
    this.removeOverlayBindings();

    // Remove ALL inventory buttons and panels (more aggressive)
    const allButtons = document.querySelectorAll('#inventory-button');
    allButtons.forEach((button) => {
      button.remove();
    });

    const allPanels = document.querySelectorAll('#inventory-panel');
    allPanels.forEach((panel) => {
      panel.remove();
    });

    // Also remove by static reference if it exists
    if (this.inventoryButton) {
      this.inventoryButton.remove();
      this.inventoryButton = null;
    }

    if (this.inventoryPanel) {
      this.inventoryPanel.remove();
      this.inventoryPanel = null;
    }

    // Reset state
    this.isPanelOpen = false;
    this.sceneManager = null;
  }
}
