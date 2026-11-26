import type { PageContext } from '../types';
import type { ChatbotViewMode, ChatMessage } from './types';

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

function sanitizeStoredPageContext(raw: unknown): PageContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const out: PageContext = {};
  if (typeof obj.roadmapSlug === 'string' && obj.roadmapSlug.trim()) out.roadmapSlug = obj.roadmapSlug.trim();
  if (typeof obj.roadmapTitle === 'string' && obj.roadmapTitle.trim()) out.roadmapTitle = obj.roadmapTitle.trim();
  if (typeof obj.itemId === 'string' && obj.itemId.trim()) out.itemId = obj.itemId.trim();
  if (typeof obj.itemTitle === 'string' && obj.itemTitle.trim()) out.itemTitle = obj.itemTitle.trim();
  if (typeof obj.section === 'string' && obj.section.trim()) out.section = obj.section.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

export function loadConversation(key: string): StoredConversation | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as { conversationId?: unknown; messages?: unknown };
    if (typeof data.conversationId !== 'string' || !Array.isArray(data.messages)) return null;
    const messages = data.messages
      .filter(isStoredMessage)
      .map((m) => {
        const pageContext = sanitizeStoredPageContext((m as unknown as Record<string, unknown>).pageContext);
        return {
          ...m,
          ...(pageContext ? { pageContext } : { pageContext: undefined }),
          timestamp: new Date(m.timestamp),
        };
      });
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

/** Votes the service has accepted, by message id: kept apart so a reload shows them again. */
export function feedbackKey(baseUrl: string): string {
  return `abot:feedback:${baseUrl}`;
}

export function loadFeedback(key: string): Record<string, 0 | 1> {
  try {
    const data = JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(data).filter((entry): entry is [string, 0 | 1] => entry[1] === 0 || entry[1] === 1)
    );
  } catch {
    return {};
  }
}

export function saveFeedback(key: string, votes: Record<string, 0 | 1>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(votes));
  } catch {
    // Storage blocked: votes stay in memory only
  }
}

export function clearConversation(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was stored
  }
}

export function viewModeKey(baseUrl: string): string {
  return `abot:view-mode:${baseUrl}`;
}

export function loadViewMode(key: string): ChatbotViewMode | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === 'floating' || raw === 'sidebar' ? raw : null;
  } catch {
    return null;
  }
}

export function saveViewMode(key: string, mode: ChatbotViewMode): void {
  try {
    window.sessionStorage.setItem(key, mode);
  } catch {
    // Storage blocked: mode stays in memory only
  }
}

export function openStateKey(baseUrl: string): string {
  return `abot:open:${baseUrl}`;
}

export function loadOpenState(key: string): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function saveOpenState(key: string, open: boolean): void {
  try {
    window.sessionStorage.setItem(key, open ? 'true' : 'false');
  } catch {
    // Storage blocked: open state stays in memory only
  }
}

export function sidebarWidthKey(baseUrl: string): string {
  return `abot:sidebar-width:${baseUrl}`;
}

export function loadSidebarWidth(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSidebarWidth(key: string, width: number): void {
  try {
    window.sessionStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Storage blocked: width stays in memory only
  }
}
