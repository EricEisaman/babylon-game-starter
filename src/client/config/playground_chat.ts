import type { ChatConfig } from '../types/chat';

/** Mirrors src/client/public/chat/config.json — keep in sync (export smoke check enforces). */
export const PLAYGROUND_CHAT_CONFIG: ChatConfig = {
  enabled: true,
  serviceUrl: '/chat-api',
  clientId: 'web-demo',
  roomMode: 'per-environment',
  gameRoomName: 'Lobby'
};
