import type { ChatCitation } from '../../types';

/**
 * Claim marks put into the answer text before it is parsed as markdown, so every claim survives
 * the block/inline split and can be found again on its line: START, the claim, END, then one
 * character naming the claim (CLAIM_BASE + its index). All are private-use characters, which
 * markdown leaves alone and no answer contains.
 */
export const CLAIM_START = '';
export const CLAIM_END = '';
const CLAIM_BASE = 0xe100;

/** A marked claim on a line: group 1 is the claim text, group 2 names it. */
export const CLAIM_RE = /([^]*)([\s\S])/g;
/** Marks left where a claim could not be matched whole (e.g. split by a table cell). */
export const STRAY_MARK_RE = /|[\s\S]?/g;

export function claimIndex(name: string): number {
  return name.charCodeAt(0) - CLAIM_BASE;
}

/** Where `text` occurs in `content`, nearest to `near`; -1 when it does not occur. */
function nearestIndex(content: string, text: string, near: number): number {
  let best = -1;
  for (let i = content.indexOf(text); i !== -1; i = content.indexOf(text, i + 1)) {
    if (best === -1 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  }
  return best;
}

/**
 * Marks each citation's claim in `content` and returns the marked text with the source ids of
 * claim i at `claims[i]`. A claim is placed at its range when that range still holds its text,
 * else at the nearest occurrence of the text; claims that cannot be placed, or overlap one
 * already placed, are left out.
 */
export function markClaims(
  content: string,
  citations: ChatCitation[] | undefined
): { content: string; claims: string[][] } {
  if (!citations?.length) return { content, claims: [] };

  const placed: { start: number; end: number; ids: string[] }[] = [];
  for (const c of citations) {
    if (!c.text || !c.source_ids?.length) continue;
    const start =
      content.slice(c.start, c.end) === c.text ? c.start : nearestIndex(content, c.text, c.start);
    if (start === -1) continue;
    const end = start + c.text.length;
    if (placed.some((p) => start < p.end && p.start < end)) continue;
    placed.push({ start, end, ids: c.source_ids });
  }

  // Insert from the end so earlier indexes stay valid
  let marked = content;
  const claims: string[][] = placed.map((p) => p.ids);
  placed
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => b.start - a.start)
    .forEach(({ start, end, i }) => {
      marked =
        marked.slice(0, start) +
        CLAIM_START +
        marked.slice(start, end) +
        CLAIM_END +
        String.fromCharCode(CLAIM_BASE + i) +
        marked.slice(end);
    });
  return { content: marked, claims };
}
