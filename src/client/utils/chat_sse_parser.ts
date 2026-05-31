// ============================================================================
// DATASTAR SSE PARSER (Chat Slayer demo API)
// ============================================================================

import type { ChatSignalPatch } from '../types/chat';

const SIGNALS_PREFIX = 'signals ';

function parseDatastarSignalsPayload(raw: string): ChatSignalPatch | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as ChatSignalPatch;
    }
  } catch {
    // Ignore malformed chunks.
  }
  return null;
}

function extractSignalsFromEventBlock(block: string): ChatSignalPatch | null {
  const lines = block.split('\n');
  let eventType = '';
  const dataParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trimStart();
      if (payload.startsWith(SIGNALS_PREFIX)) {
        dataParts.push(payload.slice(SIGNALS_PREFIX.length));
      } else if (eventType === 'datastar-patch-signals' || dataParts.length > 0) {
        dataParts.push(payload);
      }
    }
  }

  if (dataParts.length === 0) {
    return null;
  }
  return parseDatastarSignalsPayload(dataParts.join('\n'));
}

/** Parse a complete SSE response body (short demo action responses). */
export function parseDemoActionSseBody(body: string): ChatSignalPatch | null {
  const blocks = body.split(/\n\n+/);
  let merged: ChatSignalPatch | null = null;

  for (const block of blocks) {
    const patch = extractSignalsFromEventBlock(block);
    if (patch) {
      merged = merged
        ? (Object.assign({}, merged, patch) as ChatSignalPatch)
        : patch;
    }
  }

  return merged;
}

/** Incremental parser for long-lived `/demo/stream` fetch bodies. */
export class ChatSseStreamParser {
  private buffer = '';

  push(chunk: string): ChatSignalPatch[] {
    this.buffer += chunk;
    const patches: ChatSignalPatch[] = [];

    let splitAt = this.buffer.indexOf('\n\n');
    while (splitAt >= 0) {
      const block = this.buffer.slice(0, splitAt);
      this.buffer = this.buffer.slice(splitAt + 2);
      const patch = extractSignalsFromEventBlock(block);
      if (patch) {
        patches.push(patch);
      }
      splitAt = this.buffer.indexOf('\n\n');
    }

    return patches;
  }
}
