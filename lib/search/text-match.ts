const SHORT_WORD_TOKEN_MAX = 3;

export interface SearchSnippet {
  text: string;
  highlightStart: number;
  highlightEnd: number;
}

export function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isWordBoundaryChar(ch: string | undefined): boolean {
  if (!ch) return true;
  return !/[a-z0-9]/.test(ch);
}

export function indexOfWordToken(haystack: string, token: string): number {
  if (!token) return -1;
  if (token.length > SHORT_WORD_TOKEN_MAX) {
    return haystack.indexOf(token);
  }
  let pos = 0;
  while (pos <= haystack.length - token.length) {
    const found = haystack.indexOf(token, pos);
    if (found < 0) return -1;
    const before = found > 0 ? haystack[found - 1] : undefined;
    const after = haystack[found + token.length];
    if (isWordBoundaryChar(before) && isWordBoundaryChar(after)) {
      return found;
    }
    pos = found + 1;
  }
  return -1;
}

export function matchesSearchText(haystack: string, query: string): boolean {
  const foldedHaystack = foldSearchText(haystack);
  const foldedQuery = foldSearchText(query);
  if (!foldedHaystack || !foldedQuery) return false;

  const tokens = foldedQuery.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    return indexOfWordToken(foldedHaystack, tokens[0]) >= 0;
  }
  if (foldedHaystack.includes(foldedQuery)) {
    return true;
  }
  return tokens.every((token) => indexOfWordToken(foldedHaystack, token) >= 0);
}

export function scoreTextMatch(haystack: string | null | undefined, query: string): number {
  if (!haystack) return 0;
  const foldedHaystack = foldSearchText(haystack);
  const foldedQuery = foldSearchText(query);
  if (!foldedHaystack || !foldedQuery) return 0;

  if (foldedHaystack === foldedQuery) return 100;
  if (foldedHaystack.startsWith(foldedQuery)) return 80;

  const tokens = foldedQuery.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    const idx = indexOfWordToken(foldedHaystack, tokens[0]);
    if (idx < 0) return 0;
    return idx === 0 ? 80 : 60;
  }
  if (foldedHaystack.includes(foldedQuery)) return 65;
  if (tokens.every((token) => indexOfWordToken(foldedHaystack, token) >= 0)) return 40;
  return 0;
}

function foldWithOffsets(text: string): { folded: string; starts: number[] } {
  let folded = "";
  const starts: number[] = [];
  let offset = 0;

  for (const ch of text) {
    const piece = ch
      .toLowerCase()
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    for (let i = 0; i < piece.length; i++) {
      folded += piece[i];
      starts.push(offset);
    }
    offset += ch.length;
  }

  return { folded, starts };
}

export function findMatchedSlice(nfc: string, query: string): { start: number; end: number } | null {
  const foldedQuery = foldSearchText(query);
  if (!foldedQuery) return null;

  const { folded, starts } = foldWithOffsets(nfc);
  const tokens = foldedQuery.split(" ").filter(Boolean);
  let idx =
    tokens.length === 1
      ? indexOfWordToken(folded, tokens[0])
      : folded.indexOf(foldedQuery);
  let matchLen = foldedQuery.length;

  if (idx < 0 && tokens.length > 0) {
    idx = indexOfWordToken(folded, tokens[0]);
    matchLen = tokens[0].length;
  }

  if (idx < 0 || idx >= starts.length) return null;
  const start = starts[idx];
  const lastIdx = Math.min(idx + Math.max(matchLen - 1, 0), starts.length - 1);
  const end = starts[lastIdx] + 1;
  return { start, end };
}

export function extractHighlightedSnippet(
  content: string,
  query: string,
  maxChars = 120
): SearchSnippet | null {
  const compacted = content.replace(/\s+/g, " ").trim().normalize("NFC");
  if (!compacted) return null;

  const matched = findMatchedSlice(compacted, query);
  if (!matched) return null;

  const halfWindow = Math.floor((maxChars - (matched.end - matched.start)) / 2);
  const windowStart = Math.max(0, matched.start - Math.max(halfWindow, 24));
  const windowEnd = Math.min(compacted.length, windowStart + maxChars);
  const rawSlice = compacted.slice(windowStart, windowEnd);
  const leadingTrim = rawSlice.length - rawSlice.trimStart().length;
  const slice = rawSlice.trim();
  if (!slice) return null;

  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < compacted.length ? "…" : "";
  const text = `${prefix}${slice}${suffix}`;
  const relStart = Math.max(0, matched.start - windowStart - leadingTrim);
  const relEnd = Math.min(slice.length, Math.max(relStart, matched.end - windowStart - leadingTrim));

  return {
    text,
    highlightStart: prefix.length + relStart,
    highlightEnd: prefix.length + relEnd,
  };
}
