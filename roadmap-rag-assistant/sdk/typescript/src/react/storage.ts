import type { ChatMessage } from './types';

// The conversation lives in sessionStorage: it survives a reload or a page change in the same
// tab, and is gone when the tab closes. Storage can be blocked (private mode), so every access
// is guarded and the widget works without it.

/** Keep the stored history short: older turns are not needed to answer the next question. */
export const MAX_STORED_MESSAGES = 50;

export interface StoredConversation {
  conversationId: string;
  messages: ChatMessage[];
}

export function conversationKey(baseUrl: string): string {
  return `abot:conversation:${baseUrl}`;
}

function isStoredMessage(value: unknown): value is ChatMessage & { timestamp: string } {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    typeof m.timestamp === 'string'
  );
}

export function loadConversation(key: string): StoredConversation | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as { conversationId?: unknown; messages?: unknown };
    if (typeof data.conversationId !== 'string' || !Array.isArray(data.messages)) return null;
    const messages = data.messages
      .filter(isStoredMessage)
      .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
    return messages.length > 0 ? { conversationId: data.conversationId, messages } : null;
  } catch {
    return null;
  }
}

export function saveConversation(key: string, conversation: StoredConversation): void {
  try {
    const messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ conversationId: conversation.conversationId, messages })
    );
  } catch {
    // Quota exceeded or storage blocked: the conversation stays in memory only
  }
}

export function clearConversation(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was stored
  }
}
