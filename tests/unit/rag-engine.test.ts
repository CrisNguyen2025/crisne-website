import { describe, expect, it } from "vitest";
import {
  findRelevantChunks,
  keywordMatchScore,
  normalizeText,
  shouldRewriteQuery,
} from "@/lib/ai/rag-engine";
import type { KnowledgeChunk } from "@/lib/ai/portfolio-knowledge";

const chunk = (id: string, overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk => ({
  id,
  title: id,
  category: "faq",
  content: "",
  keywords: [],
  ...overrides,
});

describe("normalizeText", () => {
  it("lowercases and strips Vietnamese diacritics", () => {
    expect(normalizeText("Kinh Nghiệm Đà Nẵng")).toBe("kinh nghiem da nang");
  });
});

describe("keywordMatchScore", () => {
  const booking = chunk("booking", { title: "Booking platform", content: "Spa booking flow" });

  it("matches whole words only (no 'bo' inside 'booking')", () => {
    expect(keywordMatchScore("phở bò", booking)).toBe(0);
  });

  it("matches multi-word keywords only as a full phrase", () => {
    const stats = chunk("stats", { keywords: ["số năm kinh nghiệm"] });
    expect(keywordMatchScore("kinh nghiệm mobile", stats)).toBe(0);
    expect(keywordMatchScore("số năm kinh nghiệm của Cris", stats)).toBeGreaterThan(0);
  });

  it("ignores the knowledge base subject name", () => {
    expect(keywordMatchScore("Cris Nguyen", chunk("bio", { title: "Cris Nguyen" }))).toBe(0);
  });
});

describe("findRelevantChunks", () => {
  // 3-d toy embeddings: cosine with the query decides relevance
  const knowledgeBase = [
    chunk("contact", { embedding: [1, 0, 0] }),
    chunk("near", { embedding: [0.95, 0.31, 0] }),
    chunk("far", { embedding: [0, 1, 0] }),
  ];

  it("returns nothing when no chunk passes the vector gate (off-topic)", () => {
    expect(findRelevantChunks("x", [0, 0, 1], knowledgeBase, 4)).toEqual([]);
  });

  it("ranks by score and drops chunks far below the best match", () => {
    const ids = findRelevantChunks("x", [1, 0, 0], knowledgeBase, 4).map((c) => c.id);
    expect(ids).toEqual(["contact", "near"]);
  });

  it("exposes per-chunk scores for tracing", () => {
    const [top] = findRelevantChunks("x", [1, 0, 0], knowledgeBase, 4);
    expect(top.vectorScore).toBeCloseTo(1);
    expect(top).toHaveProperty("keywordScore");
  });

  it("falls back to keyword-only scoring without an embedding", () => {
    const kb = [chunk("contact", { keywords: ["liên hệ"] }), chunk("other")];
    const ids = findRelevantChunks("liên hệ thế nào", null, kb, 4).map((c) => c.id);
    expect(ids).toEqual(["contact"]);
  });
});

describe("shouldRewriteQuery", () => {
  it("needs a previous user turn", () => {
    expect(shouldRewriteQuery([])).toBe(false);
    expect(shouldRewriteQuery([{ role: "assistant", content: "Xin chào" }])).toBe(false);
    expect(shouldRewriteQuery([{ role: "user", content: "Kể về Zelene" }])).toBe(true);
  });
});
