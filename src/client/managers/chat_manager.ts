// ============================================================================
// CHAT MANAGER (Chat Slayer demo API client)
// ============================================================================

import { ASSETS } from '../config/assets';
import {
  getChatConfig,
  isChatRegistrationAllowed,
  isChatUiPreviewMode,
  isChatUiVisible,
  isChatUsernameAllowed
} from '../utils/chat_config';
import { ChatSseStreamParser, parseDemoActionSseBody } from '../utils/chat_sse_parser';

import type {
  ChatConnectionState,
  ChatMessageLine,
  ChatRoomListEntry,
  ChatSession,
  ChatSignalPatch
} from '../types/chat';
import type { ResolvedChatConfig } from '../types/chat';

const SESSION_STORAGE_KEYS = {
  accessToken: 'bgs_chat_access_token',
  userId: 'bgs_chat_user_id',
  deviceId: 'bgs_chat_device_id',
  username: 'bgs_chat_username'
} as const;

const NORMAL_REQUEST_TIMEOUT_MS = 15_000;
const CLIENT_HEADER = 'X-Chat-Slayer-Client-Id';
const PREVIEW_SESSION_TOKEN = 'ui-preview';
const PREVIEW_ERROR =
  'UI preview — configure chat/config.json for live chat.';

function previewRoomId(environmentName: string): string {
  return `!preview-${environmentName.replace(/\s+/g, '-').toLowerCase()}:local`;
}

function buildPreviewInbox(environmentName: string, roomId: string): ChatMessageLine[] {
  return [
    {
      room_id: roomId,
      sender: '@preview:local',
      body: `Welcome to the ${environmentName} room (UI preview).`,
      event_id: `preview-welcome-${roomId}`
    },
    {
      room_id: roomId,
      sender: '@alice:local',
      body: 'Sample message for layout testing.',
      event_id: `preview-sample-${roomId}`
    }
  ];
}

type StateListener = (state: ChatConnectionState, statusText: string) => void;
type InboxListener = (
  inbox: readonly ChatMessageLine[],
  roomId: string,
  rooms: readonly ChatRoomListEntry[]
) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function normalizeFingerprint(hex: string): string {
  return hex.trim().toLowerCase();
}

export class ChatManager {
  private static instance: ChatManager | null = null;

  private connectionState: ChatConnectionState = 'idle';
  private statusText = '';
  private session: ChatSession | null = null;
  private rooms: ChatRoomListEntry[] = [];
  private inbox: ChatMessageLine[] = [];
  private activeRoomId = '';
  private roomIdByDisplayName = new Map<string, string>();
  private serviceWarmed = false;
  private warmupAbort: AbortController | null = null;
  private streamAbort: AbortController | null = null;
  private streamParser = new ChatSseStreamParser();
  private readonly stateListeners = new Set<StateListener>();
  private readonly inboxListeners = new Set<InboxListener>();
  private environmentChangedHandler: ((e: Event) => void) | null = null;

  public static getInstance(): ChatManager {
    if (!ChatManager.instance) {
      ChatManager.instance = new ChatManager();
    }
    return ChatManager.instance;
  }

  public static disposeInstance(): void {
    ChatManager.instance?.dispose();
    ChatManager.instance = null;
  }

  public getConnectionState(): ChatConnectionState {
    return this.connectionState;
  }

  public getStatusText(): string {
    return this.statusText;
  }

  public getSession(): ChatSession | null {
    return this.session;
  }

  public getInbox(): readonly ChatMessageLine[] {
    return this.inbox;
  }

  public getActiveRoomId(): string {
    return this.activeRoomId;
  }

  public getRooms(): readonly ChatRoomListEntry[] {
    return this.rooms;
  }

  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.connectionState, this.statusText);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onInboxChange(listener: InboxListener): () => void {
    this.inboxListeners.add(listener);
    listener(this.inbox, this.activeRoomId, this.rooms);
    return () => {
      this.inboxListeners.delete(listener);
    };
  }

  public initialize(): void {
    if (!isChatUiVisible()) {
      return;
    }
    if (isChatUiPreviewMode()) {
      this.initializePreview();
      return;
    }
    this.restoreSessionFromStorage();
    this.bindEnvironmentChanges();
  }

  private initializePreview(): void {
    this.session = null;
    this.inbox = [];
    this.activeRoomId = '';
    this.rooms = ASSETS.ENVIRONMENTS.map((env) => ({
      name: this.displayNameForEnvironment(env.name),
      room_id: previewRoomId(env.name)
    }));
    this.rebuildRoomMap(this.rooms);
    this.bindEnvironmentChanges();
    this.setState(
      'idle',
      'UI preview — sign in or register to try the chat layout (mock data only).'
    );
    this.notifyInbox();
  }

  private completePreviewLogin(username: string, register: boolean): void {
    const initialEnv =
      ASSETS.ENVIRONMENTS.find((e) => e.isDefault)?.name ?? ASSETS.ENVIRONMENTS[0]?.name ?? 'Level Test';
    const roomId = previewRoomId(initialEnv);
    const matrixUser = username.includes(':') ? username : `@${username}:local`;

    this.session = {
      accessToken: PREVIEW_SESSION_TOKEN,
      userId: matrixUser,
      deviceId: 'preview-device'
    };
    this.activeRoomId = roomId;
    this.inbox = buildPreviewInbox(initialEnv, roomId);
    const action = register ? 'Registered' : 'Signed in';
    this.setState('ready', `UI preview — ${action} as ${username} (mock, no server).`);
    this.notifyInbox();
  }

  private assertNotPreviewMode(): void {
    if (isChatUiPreviewMode()) {
      throw new Error(PREVIEW_ERROR);
    }
  }

  public dispose(): void {
    this.cancelWarmup();
    this.closeStream();
    if (this.environmentChangedHandler) {
      window.removeEventListener('environment-changed', this.environmentChangedHandler);
      this.environmentChangedHandler = null;
    }
    this.setState('idle', '');
  }

  public cancelWarmup(): void {
    this.warmupAbort?.abort();
    this.warmupAbort = null;
    if (this.connectionState === 'warming') {
      this.setState('idle', 'Cancelled');
    }
  }

  public async connectWithCredentials(username: string, password: string, register: boolean): Promise<void> {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      throw new Error('Username and password are required');
    }
    if (register && !isChatRegistrationAllowed()) {
      throw new Error('Registration is disabled. Log in with an existing account.');
    }
    if (!isChatUsernameAllowed(trimmedUsername)) {
      throw new Error('That username is not allowed for this game.');
    }
    if (isChatUiPreviewMode()) {
      this.completePreviewLogin(trimmedUsername, register);
      return;
    }
    const config = this.requireConfig();
    try {
      await this.ensureServiceReady();
      const action = register ? 'register' : 'login';
      const patch = await this.postDemoAction(`/demo/actions/${action}`, {
        username: trimmedUsername,
        password
      });
      this.applyAuthPatch(patch, trimmedUsername);
      await this.afterAuthenticated(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.connectionState !== 'warming') {
        this.setState('error', message);
      }
      throw err;
    }
  }

  public async reconnectFromSession(): Promise<void> {
    if (!this.session?.accessToken) {
      return;
    }
    if (isChatUiPreviewMode()) {
      return;
    }
    const config = this.requireConfig();
    try {
      await this.ensureServiceReady();
      await this.afterAuthenticated(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.connectionState !== 'warming') {
        this.setState('error', message);
      }
      throw err;
    }
  }

  public async sendMessage(text: string): Promise<void> {
    const message = text.trim();
    if (!message || !this.session?.accessToken || !this.activeRoomId) {
      return;
    }
    if (this.connectionState !== 'ready') {
      return;
    }
    if (isChatUiPreviewMode()) {
      const line: ChatMessageLine = {
        room_id: this.activeRoomId,
        sender: 'You',
        body: message,
        event_id: `preview-send-${Date.now()}`
      };
      this.inbox = [...this.inbox, line];
      this.notifyInbox();
      return;
    }
    const patch = await this.postDemoAction(
      '/demo/actions/send',
      { accessToken: this.session.accessToken },
      {
        'X-Demo-Room-Id': this.activeRoomId,
        'X-Demo-Message': message
      }
    );
    this.applySignalPatch(patch);
  }

  public async joinRoomForEnvironment(environmentName: string): Promise<void> {
    if (!this.session?.accessToken) {
      return;
    }
    if (isChatUiPreviewMode()) {
      const roomId = previewRoomId(environmentName);
      this.activeRoomId = roomId;
      this.inbox = buildPreviewInbox(environmentName, roomId);
      this.statusText = `UI preview — ${environmentName}`;
      this.notifyInbox();
      for (const listener of this.stateListeners) {
        listener(this.connectionState, this.statusText);
      }
      return;
    }
    const config = getChatConfig();
    if (!config?.enabled) {
      return;
    }
    if (config.roomMode !== 'per-environment') {
      return;
    }
    const displayName = this.displayNameForEnvironment(environmentName);
    const roomId = this.roomIdByDisplayName.get(displayName);
    if (!roomId) {
      return;
    }
    await this.joinRoom(roomId);
  }

  private bindEnvironmentChanges(): void {
    this.environmentChangedHandler = (e: Event): void => {
      if (!(e instanceof CustomEvent)) {
        return;
      }
      const detail = e.detail as { name?: string };
      if (typeof detail.name === 'string') {
        void this.joinRoomForEnvironment(detail.name);
      }
    };
    window.addEventListener('environment-changed', this.environmentChangedHandler);
  }

  private requireConfig(): ResolvedChatConfig {
    const config = getChatConfig();
    if (!config?.enabled || !config.serviceUrl) {
      throw new Error('Chat is not enabled');
    }
    return config;
  }

  private setState(state: ChatConnectionState, status: string): void {
    this.connectionState = state;
    this.statusText = status;
    for (const listener of this.stateListeners) {
      listener(state, status);
    }
  }

  private notifyInbox(): void {
    for (const listener of this.inboxListeners) {
      listener(this.inbox, this.activeRoomId, this.rooms);
    }
  }

  private restoreSessionFromStorage(): void {
    try {
      const accessToken = sessionStorage.getItem(SESSION_STORAGE_KEYS.accessToken) ?? '';
      const userId = sessionStorage.getItem(SESSION_STORAGE_KEYS.userId) ?? '';
      const deviceId = sessionStorage.getItem(SESSION_STORAGE_KEYS.deviceId) ?? '';
      if (accessToken && userId) {
        this.session = { accessToken, userId, deviceId };
      }
    } catch {
      this.session = null;
    }
  }

  private persistSession(username: string): void {
    if (!this.session) {
      return;
    }
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEYS.accessToken, this.session.accessToken);
      sessionStorage.setItem(SESSION_STORAGE_KEYS.userId, this.session.userId);
      sessionStorage.setItem(SESSION_STORAGE_KEYS.deviceId, this.session.deviceId);
      sessionStorage.setItem(SESSION_STORAGE_KEYS.username, username);
    } catch {
      // Ignore private mode / quota errors.
    }
  }

  private displayNameForEnvironment(environmentName: string): string {
    const config = getChatConfig();
    const prefix = config?.roomNamePrefix ?? '';
    return `${prefix}${environmentName}`;
  }

  private targetRoomDisplayNames(config: ResolvedChatConfig): string[] {
    if (config.roomMode === 'game-wide') {
      return [config.gameRoomName];
    }
    return ASSETS.ENVIRONMENTS.map((env) => this.displayNameForEnvironment(env.name));
  }

  private rebuildRoomMap(rooms: readonly ChatRoomListEntry[]): void {
    this.roomIdByDisplayName.clear();
    for (const room of rooms) {
      this.roomIdByDisplayName.set(room.name, room.room_id);
    }
  }

  private async afterAuthenticated(config: ResolvedChatConfig): Promise<void> {
    if (!this.session?.accessToken) {
      return;
    }
    const names = this.targetRoomDisplayNames(config);
    const registerPatch = await this.postDemoAction(
      '/demo/actions/register-rooms',
      { accessToken: this.session.accessToken },
      { 'X-Demo-Room-Names': names.join(',') }
    );
    this.applySignalPatch(registerPatch);

    const initialEnv =
      ASSETS.ENVIRONMENTS.find((e) => e.isDefault)?.name ?? ASSETS.ENVIRONMENTS[0]?.name;
    if (config.roomMode === 'per-environment' && initialEnv) {
      await this.joinRoomForEnvironment(initialEnv);
    } else if (config.roomMode === 'game-wide') {
      const roomId = this.roomIdByDisplayName.get(config.gameRoomName);
      if (roomId) {
        await this.joinRoom(roomId);
      }
    }

    this.closeStream();
    await this.openDemoStream();
    this.setState('ready', this.statusText || 'Connected');
  }

  private async joinRoom(roomId: string): Promise<void> {
    if (!this.session?.accessToken || !roomId) {
      return;
    }
    const patch = await this.postDemoAction(
      '/demo/actions/join-room',
      { accessToken: this.session.accessToken },
      { 'X-Demo-Room-Id': roomId }
    );
    this.applySignalPatch(patch);
  }

  private applyAuthPatch(patch: ChatSignalPatch | null, username: string): void {
    if (!patch?.accessToken) {
      const message =
        patch?.cs?.name === 'error' && typeof patch.cs.payload === 'object' && patch.cs.payload
          ? String((patch.cs.payload as { message?: string }).message ?? 'Auth failed')
          : patch?.status ?? 'Auth failed';
      throw new Error(message);
    }
    this.session = {
      accessToken: patch.accessToken,
      userId: patch.user_id ?? '',
      deviceId: patch.device_id ?? ''
    };
    this.persistSession(username);
    this.applySignalPatch(patch);
  }

  private applySignalPatch(patch: ChatSignalPatch | null): void {
    if (!patch) {
      return;
    }

    if (Array.isArray(patch.rooms)) {
      this.rooms = [...patch.rooms];
      this.rebuildRoomMap(this.rooms);
    }

    if (typeof patch.roomId === 'string' && patch.roomId.length > 0) {
      this.activeRoomId = patch.roomId;
    }

    if (Array.isArray(patch.inbox)) {
      this.inbox = [...patch.inbox];
    } else if (patch.cs?.name === 'room-message' && patch.cs.payload) {
      const line = patch.cs.payload as ChatMessageLine;
      if (line.room_id === this.activeRoomId || !this.activeRoomId) {
        const exists = this.inbox.some((m) => m.event_id === line.event_id);
        if (!exists) {
          this.inbox = [...this.inbox, line];
        }
      }
    }

    if (typeof patch.status === 'string' && patch.status.length > 0) {
      this.statusText = patch.status;
    }

    if (patch.cs?.name === 'error') {
      const payload = patch.cs.payload;
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : 'Chat error';
      this.setState('error', message);
    }

    this.notifyInbox();
  }

  public async ensureServiceReady(): Promise<void> {
    this.assertNotPreviewMode();
    if (this.serviceWarmed) {
      return;
    }

    const config = this.requireConfig();
    if (config.tlsPinEnforced && config.expectedTlsFingerprintSha256) {
      await this.verifyTlsPin(config);
    }

    this.cancelWarmup();
    this.warmupAbort = new AbortController();
    const outerSignal = this.warmupAbort.signal;
    const deadline = Date.now() + config.warmupTimeoutMs;
    this.setState('warming', 'Waking chat server… this can take up to a minute on first connect.');

    while (Date.now() < deadline) {
      if (outerSignal.aborted) {
        throw new Error('Warmup cancelled');
      }
      const remaining = deadline - Date.now();
      try {
        const ok = await this.probeHealth(config, Math.min(remaining, config.warmupTimeoutMs));
        if (ok) {
          this.serviceWarmed = true;
          return;
        }
      } catch (err) {
        if (outerSignal.aborted) {
          throw err;
        }
      }
      await sleep(config.warmupRetryIntervalMs);
    }

    this.setState('error', 'Chat server did not respond in time. Try again.');
    throw new Error('Chat warmup timed out');
  }

  private async probeHealth(config: ResolvedChatConfig, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.serviceUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async verifyTlsPin(config: ResolvedChatConfig): Promise<void> {
    const expected = normalizeFingerprint(config.expectedTlsFingerprintSha256);
    const backup = config.expectedTlsFingerprintBackupSha256
      ? normalizeFingerprint(config.expectedTlsFingerprintBackupSha256)
      : '';
    const response = await fetch(`${config.serviceUrl}/.well-known/chat-slayer.json`);
    if (!response.ok) {
      throw new Error('Could not verify chat server TLS fingerprint');
    }
    const doc = (await response.json()) as { tlsFingerprintSha256?: string };
    const observed = normalizeFingerprint(doc.tlsFingerprintSha256 ?? '');
    if (observed !== expected && (!backup || observed !== backup)) {
      throw new Error('TLS fingerprint mismatch — possible MITM');
    }
  }

  private async postDemoAction(
    path: string,
    signals: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ): Promise<ChatSignalPatch | null> {
    const config = this.requireConfig();
    const timeoutMs = this.serviceWarmed ? NORMAL_REQUEST_TIMEOUT_MS : config.warmupTimeoutMs;
    const response = await this.chatFetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...extraHeaders
      },
      body: JSON.stringify(signals),
      timeoutMs
    });
    const text = await response.text();
    return parseDemoActionSseBody(text);
  }

  private async chatFetch(
    path: string,
    init: RequestInit & { timeoutMs?: number }
  ): Promise<Response> {
    const config = this.requireConfig();
    const url = `${config.serviceUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const timeoutMs = init.timeoutMs ?? NORMAL_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          [CLIENT_HEADER]: config.clientId,
          ...(init.headers as Record<string, string>)
        }
      });
      if (!response.ok && isRetryableStatus(response.status) && !this.serviceWarmed) {
        throw new TypeError(`Retryable status ${response.status}`);
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `HTTP ${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private closeStream(): void {
    this.streamAbort?.abort();
    this.streamAbort = null;
    this.streamParser = new ChatSseStreamParser();
  }

  private async openDemoStream(): Promise<void> {
    const config = this.requireConfig();
    if (!this.session?.accessToken) {
      return;
    }

    this.streamAbort = new AbortController();
    const signal = this.streamAbort.signal;

    const response = await this.chatFetch('/demo/stream', {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.session.accessToken}`
      },
      signal,
      timeoutMs: config.warmupTimeoutMs
    });

    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    void (async () => {
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          const patches = this.streamParser.push(chunk);
          for (const patch of patches) {
            this.applySignalPatch(patch);
          }
        }
      } catch {
        if (!signal.aborted) {
          this.serviceWarmed = false;
          this.setState('error', 'Chat stream disconnected. Open chat to reconnect.');
        }
      }
    })();
  }
}

export function getChatManager(): ChatManager {
  return ChatManager.getInstance();
}
