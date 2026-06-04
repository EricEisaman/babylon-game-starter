// ============================================================================
// CHAT SLAYER CLIENT TYPE DEFINITIONS
// ============================================================================

export type ChatRoomMode = 'per-environment' | 'game-wide';

export type ChatConnectionState = 'idle' | 'warming' | 'ready' | 'error';

export interface ChatConfig {
  readonly enabled?: boolean;
  readonly serviceUrl?: string;
  readonly clientId?: string;
  readonly roomMode?: ChatRoomMode;
  readonly gameRoomName?: string;
  readonly roomNamePrefix?: string;
  readonly e2eeEnabled?: boolean;
  readonly tlsPinEnforced?: boolean;
  readonly expectedTlsFingerprintSha256?: string;
  readonly expectedTlsFingerprintBackupSha256?: string;
  readonly warmupTimeoutMs?: number;
  readonly warmupRetryIntervalMs?: number;
  /** When `false`, hide Register and only allow login (default `true`). */
  readonly allowRegistration?: boolean;
  /** Usernames permitted to log in when `allowRegistration` is `false` (case-insensitive). */
  readonly allowedUsers?: readonly string[];
}

export interface ResolvedChatConfig {
  readonly enabled: boolean;
  /** Base URL for REST (health, login, register, send). Often same-origin `/chat-api`. */
  readonly serviceUrl: string;
  /** Base URL for `GET /demo/stream` SSE. Direct upstream when host proxy breaks chunked SSE. */
  readonly streamServiceUrl: string;
  readonly clientId: string;
  readonly roomMode: ChatRoomMode;
  readonly gameRoomName: string;
  readonly roomNamePrefix: string;
  readonly e2eeEnabled: boolean;
  readonly tlsPinEnforced: boolean;
  readonly expectedTlsFingerprintSha256: string;
  readonly expectedTlsFingerprintBackupSha256: string;
  readonly warmupTimeoutMs: number;
  readonly warmupRetryIntervalMs: number;
  readonly allowRegistration: boolean;
  readonly allowedUsers: readonly string[];
}

/** Demo room list entry (Chat Slayer demoHtml.RoomListEntry). */
export interface ChatRoomListEntry {
  readonly name: string;
  readonly room_id: string;
  readonly preconfigured?: boolean;
  readonly preconfiguredPublic?: boolean;
}

/** Demo inbox line (Chat Slayer demoHtml.MessageLine). */
export interface ChatMessageLine {
  readonly room_id: string;
  readonly sender: string;
  readonly body: string;
  readonly event_id: string;
  readonly event_payload?: string;
}

export interface ChatSession {
  readonly accessToken: string;
  readonly userId: string;
  readonly deviceId: string;
}

export interface ChatCsEnvelope {
  readonly cs?: {
    readonly name?: string;
    readonly payload?: unknown;
  };
}

export interface ChatSignalPatch extends ChatCsEnvelope {
  readonly accessToken?: string;
  readonly user_id?: string;
  readonly device_id?: string;
  readonly roomId?: string;
  readonly rooms?: readonly ChatRoomListEntry[];
  readonly inbox?: readonly ChatMessageLine[];
  readonly status?: string;
  readonly streamReady?: boolean;
}
