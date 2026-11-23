import { describe, expect, it } from "vitest";
import { plainTextExcerpt, contentStats } from "@/lib/roadmap/content-utils";
import {
  buildProvenanceMarker,
  buildStatementsHtml,
  createClaimRefKey,
  escapeHtml,
  extractProvenanceKeys,
  isClaimRefKey,
} from "@/lib/provenance/markers";

describe("provenance markers (ADR-0017)", () => {
  it("creates random UUID keys", () => {
    const a = createClaimRefKey();
    const b = createClaimRefKey();
    expect(isClaimRefKey(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("builds an empty span with only the ref attribute", () => {
    const key = createClaimRefKey();
    expect(buildProvenanceMarker(key)).toBe(`<span data-provenance-ref="${key}"></span>`);
    expect(() => buildProvenanceMarker("news-123")).toThrow();
  });

  it("extracts valid keys once, in order, and ignores anything that is not a UUID", () => {
    const k1 = createClaimRefKey();
    const k2 = createClaimRefKey();
    const html = `<p>A${buildProvenanceMarker(k2)}</p><p>B<span data-provenance-ref='${k1}'></span></p>
      <p>C${buildProvenanceMarker(k2)}</p><span data-provenance-ref="https://example.com"></span>
      <span data-provenance-ref=""></span>`;
    expect(extractProvenanceKeys(html)).toEqual([k2, k1]);
    expect(extractProvenanceKeys(null)).toEqual([]);
  });

  it("escapes statement text and puts one marker at the end of each paragraph", () => {
    const k1 = createClaimRefKey();
    const k2 = createClaimRefKey();
    const html = buildStatementsHtml([
      { text: '  <script>alert("x")</script> & co  ', claimRefKey: k1 },
      { text: "Turbopack ổn định", claimRefKey: k2 },
    ]);
    expect(html).toBe(
      `<p>${escapeHtml('<script>alert("x")</script> & co')}${buildProvenanceMarker(k1)}</p>` +
        `<p>Turbopack ổn định${buildProvenanceMarker(k2)}</p>`
    );
    expect(html).not.toContain("<script>");
    expect(extractProvenanceKeys(html)).toEqual([k1, k2]);
  });

  it("adds no text to excerpts or word counts", () => {
    const html = buildStatementsHtml([{ text: "Một câu có nguồn.", claimRefKey: createClaimRefKey() }]);
    expect(plainTextExcerpt(html)).toBe("Một câu có nguồn.");
    expect(contentStats(html).words).toBe(4);
  });
});
