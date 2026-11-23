/**
 * Provenance markers (ADR-0017): an empty `<span data-provenance-ref="<uuid>"></span>` at the end of a
 * sentence in Lesson content. The marker reaches HTML, the RSC payload and full-export, so it carries
 * only a random key: no source, no News Item id, no extra attribute.
 */
export const PROVENANCE_REF_ATTRIBUTE = "data-provenance-ref";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKER_REF_PATTERN = /data-provenance-ref\s*=\s*["']([^"']*)["']/gi;

export function createClaimRefKey(): string {
  // Web Crypto: same API on the server and in the browser, so the editor node can import this file
  return globalThis.crypto.randomUUID();
}

export function isClaimRefKey(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function buildProvenanceMarker(claimRefKey: string): string {
  if (!isClaimRefKey(claimRefKey)) {
    throw new Error("claimRefKey must be a UUID");
  }
  return `<span ${PROVENANCE_REF_ATTRIBUTE}="${claimRefKey.toLowerCase()}"></span>`;
}

/** Keys of every valid marker in the HTML, without duplicates, in order of appearance. */
export function extractProvenanceKeys(html: string | null | undefined): string[] {
  if (!html) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(MARKER_REF_PATTERN)) {
    const key = match[1].trim().toLowerCase();
    if (!isClaimRefKey(key) || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MarkedStatement {
  text: string;
  claimRefKey: string;
}

/** One paragraph per statement: the escaped text followed by its marker. */
export function buildStatementsHtml(statements: readonly MarkedStatement[]): string {
  return statements
    .map((s) => `<p>${escapeHtml(s.text.trim())}${buildProvenanceMarker(s.claimRefKey)}</p>`)
    .join("");
}
