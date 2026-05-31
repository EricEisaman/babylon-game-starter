// ============================================================================
// CHAT UI
// ============================================================================

import { CONFIG } from '../config/game_config';
import { ChatManager } from '../managers/chat_manager';
import {
  getChatAllowedUsers,
  isChatRegistrationAllowed,
  isChatLoginRestrictedToAllowedUsers,
  isChatUiPreviewMode
} from '../utils/chat_config';

import {
  applyOverlayButtonBaseStyles,
  bindOutsideClose,
  bindOverlayPressFeedback,
  bindOverlayToggle,
  bindPreventTextSelection,
  isolatePanelPointerEvents,
  muteOutsideClose,
  notifyOverlayPanelOpening,
  onOtherOverlayPanelOpening,
  repositionOverlayButton,
  setChatPanelOpen
} from './overlay_button_utils';

import type { OutsideCloseBinding, OverlayToggleBinding } from './overlay_button_utils';
import type { SceneManager } from '../managers/scene_manager';
import type { ChatConnectionState } from '../types/chat';

export class ChatUI {
  private static chatButton: HTMLDivElement | null = null;
  private static chatPanel: HTMLDivElement | null = null;
  private static isPanelOpen = false;
  private static sceneManager: SceneManager | null = null;
  private static toggleBinding: OverlayToggleBinding | null = null;
  private static pressBinding: OverlayToggleBinding | null = null;
  private static selectionBinding: OverlayToggleBinding | null = null;
  private static panelIsolationBinding: OverlayToggleBinding | null = null;
  private static otherPanelBinding: OverlayToggleBinding | null = null;
  private static outsideCloseBinding: OutsideCloseBinding | null = null;
  private static stateUnsubscribe: (() => void) | null = null;
  private static inboxUnsubscribe: (() => void) | null = null;
  private static usernameField: HTMLInputElement | HTMLSelectElement | null = null;
  private static passwordInput: HTMLInputElement | null = null;
  private static messageInput: HTMLInputElement | null = null;

  public static initialize(canvas: HTMLCanvasElement, sceneManager?: SceneManager): void {
    this.cleanup();
    this.sceneManager = sceneManager ?? null;
    const manager = ChatManager.getInstance();
    manager.initialize();

    this.createChatButton(canvas);
    this.createChatPanel(canvas);
    this.setupEventListeners();
    this.scheduleOverlayReposition();
    this.renderPanelContent();

    this.stateUnsubscribe = manager.onStateChange((state, status) => {
      this.renderPanelContent(state, status);
    });
    this.inboxUnsubscribe = manager.onInboxChange(() => {
      this.renderMessages();
    });

    if (manager.getSession()?.accessToken && !isChatUiPreviewMode()) {
      void manager.reconnectFromSession().catch(() => {
        this.renderPanelContent();
      });
    }
  }

  private static scheduleOverlayReposition(): void {
    const reposition = (): void => {
      if (this.chatButton) {
        repositionOverlayButton(this.chatButton, 'bottom-left', 'chat');
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(reposition);
    });
  }

  private static getPanelWidthPx(): number {
    const viewWidth = window.innerWidth;
    if (viewWidth < CONFIG.CHAT.FULL_SCREEN_THRESHOLD) {
      return viewWidth;
    }
    return Math.max(viewWidth * CONFIG.CHAT.PANEL_WIDTH_RATIO, CONFIG.CHAT.FULL_SCREEN_THRESHOLD);
  }

  private static createChatButton(canvas: HTMLCanvasElement): void {
    void canvas;
    this.chatButton = document.createElement('div');
    this.chatButton.id = 'chat-button';
    this.chatButton.setAttribute('aria-label', 'Open chat');
    this.chatButton.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 11.5C21 16.75 16.75 21 11.5 21C10.1 21 8.78 20.68 7.6 20.12L3 21L3.88 16.4C3.32 15.22 3 13.9 3 12.5C3 7.25 7.25 3 12.5 3C17.75 3 21 7.25 21 11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    applyOverlayButtonBaseStyles(this.chatButton, {
      corner: 'bottom-left',
      bottomLeftSlot: 'chat',
      zIndex: CONFIG.CHAT.BUTTON_Z_INDEX
    });
    this.chatButton.style.background = 'rgba(0, 0, 0, 0.7)';
    this.chatButton.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    this.chatButton.style.color = 'white';
    this.chatButton.style.backdropFilter = 'blur(10px)';
    const svg = this.chatButton.querySelector('svg');
    if (svg instanceof SVGElement) {
      svg.style.pointerEvents = 'none';
      svg.style.userSelect = 'none';
    }

    document.body.appendChild(this.chatButton);
  }

  private static createChatPanel(canvas: HTMLCanvasElement): void {
    void canvas;
    this.chatPanel = document.createElement('div');
    this.chatPanel.id = 'chat-panel';

    const panelWidth = this.getPanelWidthPx();
    this.chatPanel.style.cssText = `
      position: fixed;
      top: 0;
      left: -${panelWidth}px;
      width: ${panelWidth}px;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(20px);
      border-right: 2px solid rgba(255, 255, 255, 0.2);
      z-index: ${CONFIG.CHAT.Z_INDEX};
      transition: left 0.3s ease;
      color: white;
      font-family: Arial, sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      touch-action: manipulation;
      box-sizing: border-box;
    `;

    document.body.appendChild(this.chatPanel);
  }

  private static setupEventListeners(): void {
    if (!this.chatButton || !this.chatPanel) {
      return;
    }

    this.selectionBinding = bindPreventTextSelection(this.chatButton);
    this.pressBinding = bindOverlayPressFeedback(this.chatButton);
    this.toggleBinding = bindOverlayToggle(this.chatButton, () => {
      this.togglePanel();
    });
    this.panelIsolationBinding = isolatePanelPointerEvents(this.chatPanel);
    this.otherPanelBinding = onOtherOverlayPanelOpening('chat', () => {
      this.closePanel();
    });
    this.outsideCloseBinding = bindOutsideClose({
      panel: this.chatPanel,
      trigger: this.chatButton,
      isOpen: () => this.isPanelOpen,
      onClose: () => {
        this.closePanel();
      }
    });

    window.addEventListener('resize', this.handleResize);
  }

  private static handleResize = (): void => {
    if (!this.chatPanel) {
      return;
    }
    const panelWidth = this.getPanelWidthPx();
    this.chatPanel.style.width = `${panelWidth}px`;
    if (!this.isPanelOpen) {
      this.chatPanel.style.left = `-${panelWidth}px`;
    }
    if (this.chatButton) {
      repositionOverlayButton(this.chatButton, 'bottom-left', 'chat');
    }
  };

  private static togglePanel(): void {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private static openPanel(): void {
    if (!this.chatPanel || !this.chatButton) {
      return;
    }
    notifyOverlayPanelOpening('chat');
    muteOutsideClose();
    const panelWidth = this.getPanelWidthPx();
    this.chatPanel.style.width = `${panelWidth}px`;
    this.chatPanel.style.left = '0';
    this.isPanelOpen = true;
    setChatPanelOpen(true);
    this.chatButton.dataset.panelOpen = 'true';
    this.chatButton.style.transform = 'scale(1.05)';
    this.chatButton.style.background = 'rgba(0, 0, 0, 0.9)';
    this.renderPanelContent();
  }

  private static closePanel(): void {
    if (!this.chatPanel || !this.chatButton) {
      return;
    }
    const panelWidth = this.getPanelWidthPx();
    this.chatPanel.style.left = `-${panelWidth}px`;
    this.isPanelOpen = false;
    setChatPanelOpen(false);
    this.chatButton.dataset.panelOpen = 'false';
    this.chatButton.style.transform = 'scale(1)';
    this.chatButton.style.background = 'rgba(0, 0, 0, 0.7)';
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private static renderPanelContent(state?: ChatConnectionState, status?: string): void {
    if (!this.chatPanel) {
      return;
    }

    const manager = ChatManager.getInstance();
    const connectionState = state ?? manager.getConnectionState();
    const statusText = status ?? manager.getStatusText();
    const session = manager.getSession();
    const envName = this.sceneManager?.getCurrentEnvironment() ?? '';
    const isPreview = isChatUiPreviewMode();
    const isLoggedIn = Boolean(session?.accessToken);
    const isWarming = connectionState === 'warming';
    const isReady = connectionState === 'ready';
    const isError = connectionState === 'error';
    const disableActions = isWarming;
    const showAuth = !isLoggedIn;
    const canCompose = isLoggedIn && isReady && !disableActions;
    const allowRegistration = isChatRegistrationAllowed();
    const allowedUsers = getChatAllowedUsers();
    const useUserPicker = isChatLoginRestrictedToAllowedUsers();
    const authHint = allowRegistration
      ? ''
      : useUserPicker
        ? 'Log in with a preconfigured account (registration disabled).'
        : 'Log in with an existing account (registration disabled).';
    const usernameControlStyle = `
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.08);
          color: white;
          font-size: 14px;
          box-sizing: border-box;
        `;
    const usernameFieldHtml = useUserPicker
      ? `<select id="chat-username" aria-label="Username" style="${usernameControlStyle}">
          ${allowedUsers
            .map(
              (name) => `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>`
            )
            .join('')}
        </select>`
      : `<input id="chat-username" type="text" placeholder="Username" autocomplete="username" style="${usernameControlStyle}" />`;

    this.chatPanel.innerHTML = `
      <div class="chat-header" style="
        flex: 0 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        box-sizing: border-box;
      ">
        <div style="flex: 1; min-width: 0;">
          <h2 style="margin: 0 0 4px; font-size: 22px;">${CONFIG.CHAT.HEADING_TEXT}</h2>
          <p style="margin: 0; font-size: 12px; opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${envName ? `Room: ${this.escapeHtml(envName)}` : ''}
          </p>
        </div>
        <button type="button" class="overlay-panel-close" aria-label="Close chat" style="
          flex: 0 0 auto;
          width: 44px;
          height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 22px;
          cursor: pointer;
        ">✕</button>
      </div>
      <div class="chat-status" style="
        flex: 0 0 auto;
        padding: 12px 20px;
        font-size: 13px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: ${isError ? '#ff8888' : 'rgba(255,255,255,0.85)'};
      ">${this.escapeHtml(statusText || (isLoggedIn ? 'Signed in' : 'Sign in to chat'))}</div>
      ${
        isPreview
          ? `<div class="chat-preview-banner" style="
        flex: 0 0 auto;
        padding: 10px 20px;
        font-size: 12px;
        background: rgba(255, 107, 53, 0.15);
        border-bottom: 1px solid rgba(255, 107, 53, 0.35);
        color: #ffb899;
      ">UI preview — no Chat Slayer service. Use Log in / Register below; messages are local mock data only.</div>`
          : ''
      }
      <form id="chat-auth-form" class="chat-auth" autocomplete="on" style="
        flex: 0 0 auto;
        padding: 12px 20px;
        display: ${showAuth ? 'flex' : 'none'};
        flex-direction: column;
        gap: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      ">
        ${
          authHint
            ? `<p style="margin: 0; font-size: 12px; opacity: 0.75; line-height: 1.4;">${this.escapeHtml(authHint)}</p>`
            : ''
        }
        ${usernameFieldHtml}
        <input id="chat-password" type="password" placeholder="Password" autocomplete="current-password" style="
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.08);
          color: white;
          font-size: 14px;
        " />
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="submit" id="chat-login-btn" ${disableActions ? 'disabled' : ''} style="
            flex: 1;
            padding: 10px;
            border-radius: 8px;
            border: none;
            background: #3d7eff;
            color: white;
            cursor: pointer;
            opacity: ${disableActions ? '0.5' : '1'};
          ">Log in</button>
          ${
            allowRegistration
              ? `<button type="button" id="chat-register-btn" ${disableActions ? 'disabled' : ''} style="
            flex: 1;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.35);
            background: transparent;
            color: white;
            cursor: pointer;
            opacity: ${disableActions ? '0.5' : '1'};
          ">Register</button>`
              : ''
          }
        </div>
        ${
          isWarming
            ? `<button type="button" id="chat-cancel-warmup" style="
          padding: 8px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          font-size: 12px;
        ">Cancel</button>`
            : ''
        }
        ${
          isError
            ? `<button type="button" id="chat-retry-btn" style="
          padding: 10px;
          border-radius: 8px;
          border: none;
          background: #ff6b35;
          color: white;
          cursor: pointer;
        ">Retry</button>`
            : ''
        }
      </form>
      <div id="chat-messages" class="chat-messages" style="
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 16px 20px;
        min-height: 0;
      "></div>
      <div class="chat-compose" style="
        flex: 0 0 auto;
        padding: 16px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        gap: 8px;
        background: rgba(255, 255, 255, 0.03);
      ">
        <input id="chat-message-input" type="text" placeholder="Message…" ${!canCompose ? 'disabled' : ''} style="
          flex: 1;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.08);
          color: white;
          font-size: 14px;
          opacity: ${!canCompose ? '0.5' : '1'};
        " />
        <button type="button" id="chat-send-btn" ${!canCompose ? 'disabled' : ''} style="
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          background: #00cc88;
          color: #111;
          font-weight: bold;
          cursor: pointer;
          opacity: ${!canCompose ? '0.5' : '1'};
        ">Send</button>
      </div>
    `;

    const usernameEl = this.chatPanel.querySelector('#chat-username');
    this.usernameField =
      usernameEl instanceof HTMLInputElement || usernameEl instanceof HTMLSelectElement
        ? usernameEl
        : null;
    this.passwordInput = this.chatPanel.querySelector('#chat-password');
    this.messageInput = this.chatPanel.querySelector('#chat-message-input');

    const closeBtn = this.chatPanel.querySelector('.overlay-panel-close');
    closeBtn?.addEventListener('click', () => {
      this.closePanel();
    });

    this.chatPanel.querySelector('#chat-login-btn')?.addEventListener('click', (event) => {
      event.preventDefault();
      void this.handleAuth(false);
    });
    this.chatPanel.querySelector('#chat-auth-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.handleAuth(false);
    });
    this.chatPanel.querySelector('#chat-register-btn')?.addEventListener('click', () => {
      void this.handleAuth(true);
    });
    this.chatPanel.querySelector('#chat-cancel-warmup')?.addEventListener('click', () => {
      ChatManager.getInstance().cancelWarmup();
    });
    this.chatPanel.querySelector('#chat-retry-btn')?.addEventListener('click', () => {
      void ChatManager.getInstance()
        .reconnectFromSession()
        .catch(() => undefined);
    });
    this.chatPanel.querySelector('#chat-send-btn')?.addEventListener('click', () => {
      void this.handleSend();
    });
    this.messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleSend();
      }
    });

    this.renderMessages();
  }

  private static renderMessages(): void {
    const container = this.chatPanel?.querySelector('#chat-messages');
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const manager = ChatManager.getInstance();
    const activeRoomId = manager.getActiveRoomId();
    const lines = manager
      .getInbox()
      .filter((line) => !activeRoomId || line.room_id === activeRoomId);
    if (lines.length === 0) {
      const placeholder =
        isChatUiPreviewMode() && !manager.getSession()?.accessToken
          ? 'Sign in or register above to load mock messages.'
          : 'No messages yet.';
      container.innerHTML = `<p style="opacity: 0.6; font-size: 13px; margin: 0;">${placeholder}</p>`;
      return;
    }
    container.innerHTML = lines
      .map((line) => {
        const sender = this.escapeHtml(line.sender);
        const body = this.escapeHtml(line.body);
        return `<div style="margin-bottom: 12px; font-size: 14px; line-height: 1.4;">
          <span style="color: #7ec8ff; font-weight: bold;">${sender}</span>
          <span style="opacity: 0.5;"> · </span>
          <span>${body}</span>
        </div>`;
      })
      .join('');
    container.scrollTop = container.scrollHeight;
  }

  private static async handleAuth(register: boolean): Promise<void> {
    if (register && !isChatRegistrationAllowed()) {
      return;
    }
    const username = this.usernameField?.value.trim() ?? '';
    const password = this.passwordInput?.value ?? '';
    if (!username || !password) {
      return;
    }
    try {
      await ChatManager.getInstance().connectWithCredentials(username, password, register);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.renderPanelContent('error', message);
    }
  }

  private static async handleSend(): Promise<void> {
    const text = this.messageInput?.value ?? '';
    if (!text.trim()) {
      return;
    }
    try {
      await ChatManager.getInstance().sendMessage(text);
      if (this.messageInput) {
        this.messageInput.value = '';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.renderPanelContent('error', message);
    }
  }

  public static cleanup(): void {
    window.removeEventListener('resize', this.handleResize);
    this.stateUnsubscribe?.();
    this.stateUnsubscribe = null;
    this.inboxUnsubscribe?.();
    this.inboxUnsubscribe = null;
    this.toggleBinding?.remove();
    this.toggleBinding = null;
    this.pressBinding?.remove();
    this.pressBinding = null;
    this.selectionBinding?.remove();
    this.selectionBinding = null;
    this.panelIsolationBinding?.remove();
    this.panelIsolationBinding = null;
    this.otherPanelBinding?.remove();
    this.otherPanelBinding = null;
    this.outsideCloseBinding?.remove();
    this.outsideCloseBinding = null;

    if (this.isPanelOpen) {
      setChatPanelOpen(false);
    }
    this.isPanelOpen = false;

    this.chatButton?.remove();
    this.chatButton = null;
    this.chatPanel?.remove();
    this.chatPanel = null;
    this.sceneManager = null;
    this.usernameField = null;
    this.passwordInput = null;
    this.messageInput = null;

    ChatManager.disposeInstance();
  }
}
