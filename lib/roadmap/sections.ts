import { normalizeTitle } from './duplicates';

/**
 * The spelling a section already has in its topic, so "rag" and "RAG " are one section (ADR-0009).
 * Blank input means no section. A new name is trimmed and its inner spaces collapsed.
 */
export function sectionSpelling(existing: (string | null | undefined)[], input: string | null | undefined): string | null {
  const cleaned = (input ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  const wanted = normalizeTitle(cleaned);
  const found = existing.find((s): s is string => Boolean(s) && normalizeTitle(s as string) === wanted);
  return found ?? cleaned;
}

/** Section names of a topic in page order, first appearance wins; null appears once if any lesson has none. */
export function sectionsInOrder(items: { section: string | null }[]): (string | null)[] {
  const seen = new Map<string, string | null>();
  for (const item of items) {
    const key = item.section ? normalizeTitle(item.section) : '';
    if (!seen.has(key)) seen.set(key, item.section);
  }
  return [...seen.values()];
}
