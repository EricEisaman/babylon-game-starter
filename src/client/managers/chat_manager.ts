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
  ChatSignalPatch,
  ResolvedChatConfig
} from '../types/chat';

const SESSION_STORAGE_KEYS = {
  accessToken: 'bgs_chat_access_token',
  userId: 'bgs_chat_user_id',
  deviceId: 'bgs_chat_device_id',
  username: 'bgs_chat_username'
} as const;

const NORMAL_REQUEST_TIMEOUT_MS = 15_000;
const ROOM_INBOX_HISTORY_LIMIT = 20;
const RECONNECTING_STATUS_SUFFIX = ' — reconnecting…';
const CLIENT_HEADER = 'X-Chat-Slayer-Client-Id';
const PREVIEW_SESSION_TOKEN = 'ui-preview';
const PREVIEW_ERROR = 'UI preview — configure chat/config.json for live chat.';

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

function isHtmlErrorBody(body: string): boolean {
  const lower = body.trim().toLowerCase();
  return (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('<title>page not found</title>')
  );
}

function formatChatHttpError(status: number, body: string, config: ResolvedChatConfig): string {
  const trimmedBody = body.trim();
  let serverMessage = trimmedBody;
  try {
    const json = JSON.parse(body) as { error?: string };
    if (typeof json.error === 'string' && json.error.trim()) {
      serverMessage = json.error.trim();
    }
  } catch {
    // Body is plain text or non-JSON.
  }

  if (isHtmlErrorBody(trimmedBody)) {
    return 'Chat API unreachable at /chat-api. Configure a host proxy (Netlify redirect or Render nginx). See CHAT.md.';
  }

  if (status === 403 && serverMessage.toLowerCase().includes('unknown or missing client id')) {
    return (
      `Chat client id "${config.clientId}" is not registered on Chat Slayer. ` +
      'Set clientId in chat/config.json to a known ALLOWED_CLIENTS id (e.g. "web-demo"). See CHAT.md.'
    );
  }

  if (status === 400 && serverMessage.toLowerCase().includes('invalid datastar signals')) {
    return (
      'Chat stream auth failed. GET /demo/stream requires accessToken in the Datastar ' +
      '`datastar` query param (not Authorization Bearer). Update the game client or purge cached assets. See CHAT.md.'
    );
  }

  if (serverMessage) {
    return serverMessage;
  }
  return `HTTP ${status}`;
}

function mergeAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

function formatChatFetchError(
  err: unknown,
  config: ResolvedChatConfig,
  requestUrl: string
): string {
  if (err instanceof Error && err.message && err.message !== 'Failed to fetch') {
    return err.message;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : 'this origin';
  const usingProxy = config.serviceUrl.startsWith('/');
  if (usingProxy) {
    return `Chat request failed (${requestUrl}). Check that the /chat-api proxy is configured on your host and Chat Slayer is reachable. See CHAT.md.`;
  }
  if (origin.endsWith('.github.io')) {
    return (
      `Chat request to ${requestUrl} failed from ${origin}. ` +
      'If DevTools shows a CORS error, add this origin (host only — no repo path) to Chat Slayer ALLOWED_CLIENTS for your clientId. ' +
      'Otherwise the server may be waking up (Render free tier), rate-limited (429), or temporarily unreachable. See CHAT.md.'
    );
  }
  return (
    `Chat server blocked or unreachable from ${origin}. Add ${origin} to Chat Slayer ALLOWED_CLIENTS ` +
    `for clientId "${config.clientId}", or set serviceUrl to "/chat-api" for same-origin proxy. See CHAT.md.`
  );
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
  private warmupInFlight: Promise<void> | null = null;
  private streamAbort: AbortController | null = null;
  private streamParser = new ChatSseStreamParser();
  private streamOpenInFlight: Promise<void> | null = null;
  private streamReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private streamReadyWaiters: {
    resolve: () => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }[] = [];
  private readonly stateListeners = new Set<StateListener>();
  private readonly inboxListeners = new Set<InboxListener>();
  private environmentChangedHandler: ((e: Event) => void) | null = null;

  public static getInstance(): ChatManager {
    ChatManager.instance ??= new ChatManager();
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
      ASSETS.ENVIRONMENTS.find((e) => e.isDefault)?.name ??
      ASSETS.ENVIRONMENTS[0]?.name ??
      'Level Test';
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

  public async connectWithCredentials(
    username: string,
    password: string,
    register: boolean
  ): Promise<void> {
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
      throw err instanceof Error ? err : new Error(message);
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
      throw new Error('Chat still connecting — try again in a moment.');
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

    this.closeStream();
    this.setState('ready', this.statusText || 'Connected');
    await this.ensureDemoStreamReady(config);

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
          ? ((patch.cs.payload as { message?: string }).message ?? 'Auth failed')
          : (patch?.status ?? 'Auth failed');
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

  private applySignalPatch(
    patch: ChatSignalPatch | null,
    source: 'action' | 'stream' = 'action'
  ): void {
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

    if (Array.isArray(patch.inbox) && patch.inbox.length > 0) {
      this.mergeInboxSnapshot(patch.inbox, source);
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

    if (source === 'stream' && patch.streamReady === true) {
      this.resolveStreamReadyWaiters();
      this.clearReconnectingStatus();
    }

    this.notifyInbox();
  }

  private mergeInboxSnapshot(
    incoming: readonly ChatMessageLine[],
    source: 'action' | 'stream'
  ): void {
    const roomId = this.activeRoomId;
    const otherRooms = roomId ? this.inbox.filter((line) => line.room_id !== roomId) : [];
    const existingRoom = roomId ? this.inbox.filter((line) => line.room_id === roomId) : this.inbox;

    if (source === 'action' && incoming.length > 0) {
      this.inbox = roomId ? [...otherRooms, ...incoming] : [...incoming];
      return;
    }

    const byEventId = new Map<string, ChatMessageLine>();
    for (const line of existingRoom) {
      byEventId.set(line.event_id, line);
    }
    for (const line of incoming) {
      if (!roomId || line.room_id === roomId) {
        byEventId.set(line.event_id, line);
      }
    }

    const merged: ChatMessageLine[] = [];
    const seen = new Set<string>();
    for (const line of existingRoom) {
      if (!seen.has(line.event_id)) {
        merged.push(byEventId.get(line.event_id) ?? line);
        seen.add(line.event_id);
      }
    }
    for (const line of incoming) {
      if (roomId && line.room_id !== roomId) {
        continue;
      }
      if (!seen.has(line.event_id)) {
        merged.push(line);
        seen.add(line.event_id);
      }
    }

    const capped =
      merged.length > ROOM_INBOX_HISTORY_LIMIT ? merged.slice(-ROOM_INBOX_HISTORY_LIMIT) : merged;
    this.inbox = roomId ? [...otherRooms, ...capped] : capped;
  }

  private clearReconnectingStatus(): void {
    if (!this.statusText.endsWith(RECONNECTING_STATUS_SUFFIX)) {
      return;
    }
    this.statusText = this.statusText.slice(0, -RECONNECTING_STATUS_SUFFIX.length);
    for (const listener of this.stateListeners) {
      listener(this.connectionState, this.statusText);
    }
  }

  private waitForDemoStreamReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeStreamReadyWaiter(entry);
        reject(new Error('Chat stream did not become ready in time'));
      }, timeoutMs);
      const entry = {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        timeoutId
      };
      this.streamReadyWaiters.push(entry);
    });
  }

  private removeStreamReadyWaiter(entry: (typeof this.streamReadyWaiters)[number]): void {
    const index = this.streamReadyWaiters.indexOf(entry);
    if (index >= 0) {
      this.streamReadyWaiters.splice(index, 1);
    }
  }

  private resolveStreamReadyWaiters(): void {
    for (const waiter of this.streamReadyWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve();
    }
    this.streamReadyWaiters = [];
  }

  private rejectStreamReadyWaiters(err: Error): void {
    for (const waiter of this.streamReadyWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(err);
    }
    this.streamReadyWaiters = [];
  }

  private async ensureDemoStreamReady(config: ResolvedChatConfig): Promise<void> {
    const ready = this.waitForDemoStreamReady(config.warmupTimeoutMs);
    this.startDemoStream();
    await ready;
  }

  public async ensureServiceReady(): Promise<void> {
    this.assertNotPreviewMode();
    if (this.serviceWarmed) {
      return;
    }
    if (this.warmupInFlight) {
      return this.warmupInFlight;
    }

    this.warmupInFlight = this.runServiceWarmup();
    try {
      await this.warmupInFlight;
    } finally {
      this.warmupInFlight = null;
    }
  }

  private async runServiceWarmup(): Promise<void> {
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
        const probe = await this.probeHealth(config, Math.min(remaining, config.warmupTimeoutMs));
        if (probe.ready) {
          this.serviceWarmed = true;
          return;
        }
        await sleep(probe.retryAfterMs ?? config.warmupRetryIntervalMs);
        continue;
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

  private async probeHealth(
    config: ResolvedChatConfig,
    timeoutMs: number
  ): Promise<{ ready: boolean; retryAfterMs?: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(`${config.serviceUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10)
          : Number.NaN;
        const retryAfterMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : config.warmupRetryIntervalMs * 3;
        return { ready: false, retryAfterMs };
      }
      return { ready: response.ok };
    } catch {
      return { ready: false };
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
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

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
        throw new Error(formatChatHttpError(response.status, body, config));
      }
      return response;
    } catch (err) {
      throw new Error(formatChatFetchError(err, config, url));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async chatStreamFetch(
    path: string,
    init: RequestInit & { headerTimeoutMs?: number }
  ): Promise<Response> {
    const config = this.requireConfig();
    const base = config.streamServiceUrl || config.serviceUrl;
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const headerTimeoutMs = init.headerTimeoutMs ?? config.warmupTimeoutMs;
    const headerTimeout = new AbortController();
    const timeout = setTimeout(() => {
      headerTimeout.abort();
    }, headerTimeoutMs);
    const signals = init.signal ? [init.signal, headerTimeout.signal] : [headerTimeout.signal];

    try {
      const { signal: _signal, headerTimeoutMs: _headerTimeoutMs, ...fetchInit } = init;
      const response = await fetch(url, {
        ...fetchInit,
        signal: mergeAbortSignals(signals),
        headers: {
          [CLIENT_HEADER]: config.clientId,
          ...(init.headers as Record<string, string>)
        }
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(formatChatHttpError(response.status, body, config));
      }
      return response;
    } catch (err) {
      throw new Error(formatChatFetchError(err, config, url));
    } finally {
      clearTimeout(timeout);
    }
  }

  private abortStreamConnection(): void {
    if (this.streamReconnectTimer) {
      clearTimeout(this.streamReconnectTimer);
      this.streamReconnectTimer = null;
    }
    this.streamAbort?.abort();
    this.streamAbort = null;
    this.streamParser = new ChatSseStreamParser();
  }

  private closeStream(): void {
    this.abortStreamConnection();
    this.rejectStreamReadyWaiters(new Error('Chat stream closed'));
  }

  private startDemoStream(): void {
    if (this.streamOpenInFlight) {
      return;
    }
    this.streamOpenInFlight = this.openDemoStream()
      .catch((err: unknown) => {
        if (this.streamAbort?.signal.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.rejectStreamReadyWaiters(err instanceof Error ? err : new Error(message));
        this.setState(
          'ready',
          `${this.statusText || 'Connected'} — live updates unavailable (${message}). You can still send messages.`
        );
      })
      .finally(() => {
        this.streamOpenInFlight = null;
      });
  }

  private scheduleStreamReconnect(): void {
    if (this.streamReconnectTimer || !this.session?.accessToken) {
      return;
    }
    const baseStatus = this.statusText.endsWith(RECONNECTING_STATUS_SUFFIX)
      ? this.statusText.slice(0, -RECONNECTING_STATUS_SUFFIX.length)
      : this.statusText;
    this.setState('ready', `${baseStatus || 'Connected'}${RECONNECTING_STATUS_SUFFIX}`);
    this.streamReconnectTimer = setTimeout(() => {
      this.streamReconnectTimer = null;
      if (this.session?.accessToken) {
        this.startDemoStream();
      }
    }, 2_000);
  }

  private async openDemoStream(): Promise<void> {
    const config = this.requireConfig();
    if (!this.session?.accessToken) {
      return;
    }

    this.abortStreamConnection();
    this.streamAbort = new AbortController();
    const signal = this.streamAbort.signal;

    const datastar = JSON.stringify({ accessToken: this.session.accessToken });
    const path = `/demo/stream?${new URLSearchParams({ datastar }).toString()}`;

    const response = await this.chatStreamFetch(path, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream'
      },
      signal,
      headerTimeoutMs: config.warmupTimeoutMs
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
            this.applySignalPatch(patch, 'stream');
          }
        }
        if (!signal.aborted) {
          this.scheduleStreamReconnect();
        }
      } catch {
        if (!signal.aborted) {
          this.scheduleStreamReconnect();
        }
      }
    })();
  }
}

export function getChatManager(): ChatManager {
  return ChatManager.getInstance();
}
