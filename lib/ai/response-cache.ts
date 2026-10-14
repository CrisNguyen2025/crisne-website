import { normalizeText } from "./rag-engine";
import { maskPII } from "./pii-mask";

const TTL_MS = 6 * 60 * 60_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
  answer: string;
  model: string;
  expiresAt: number;
}

// In-memory per server instance. A deploy (the only way the knowledge base or prompt
// changes) restarts the server, so stale answers never outlive the content they came from.
const entries = new Map<string, CacheEntry>();

const toKey = (query: string) => normalizeText(query).replace(/\s+/g, " ").trim();

/**
 * Only standalone questions are cacheable: no conversation history (the answer would
 * depend on it) and no personal data (it would be kept in memory and echoed to others).
 */
export function isCacheableQuery(query: string, historyLength: number): boolean {
  return historyLength === 0 && maskPII(query) === query;
}

export function getCachedAnswer(query: string): CacheEntry | null {
  const key = toKey(query);
  const entry = entries.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    entries.delete(key);
    return null;
  }
  return entry;
}

export function setCachedAnswer(query: string, answer: string, model: string): void {
  // Map keeps insertion order: drop the oldest entry when full
  if (entries.size >= MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }
  entries.set(toKey(query), { answer, model, expiresAt: Date.now() + TTL_MS });
}

/** Test hook. */
export function clearResponseCache(): void {
  entries.clear();
}
