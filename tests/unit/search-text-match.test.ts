import { describe, expect, it } from "vitest";
import {
  extractHighlightedSnippet,
  foldSearchText,
  matchesSearchText,
  scoreTextMatch,
} from "@/lib/search/text-match";

describe("lib/search/text-match", () => {
  it("normalizes Vietnamese diacritics and đ/Đ identically", () => {
    expect(foldSearchText("Định tuyến & Kiến trúc Hệ thống")).toBe("dinh tuyen & kien truc he thong");
    expect(matchesSearchText("Định tuyến trong Next.js", "dinh tuyen")).toBe(true);
    expect(matchesSearchText("Cấu trúc Bộ nhớ Abot", "bo nho")).toBe(true);
  });

  it("enforces word boundaries for short tokens (<= 3 chars)", () => {
    expect(matchesSearchText("Hướng dẫn AI Agent", "ai")).toBe(true);
    expect(matchesSearchText("Main layout configuration", "ai")).toBe(false);
    expect(matchesSearchText("Hybrid RAG Pipeline", "rag")).toBe(true);
    expect(matchesSearchText("Drag and drop list", "rag")).toBe(false);
  });

  it("scores title/prefix matches higher than scattered tokens", () => {
    const exact = scoreTextMatch("RAG", "rag");
    const prefix = scoreTextMatch("RAG Architecture", "rag");
    const inner = scoreTextMatch("Hybrid RAG Pipeline", "rag");
    const multi = scoreTextMatch("Tìm kiếm kết hợp vector và BM25", "tim kiem bm25");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(multi);
    expect(scoreTextMatch("Unrelated content", "rag")).toBe(0);
  });

  it("extracts snippet with accurate Unicode highlight offsets for diacriticless queries", () => {
    const content =
      "Trong hệ thống phân tán, việc đồng bộ chỉ mục tìm kiếm và kiến trúc bộ nhớ cần giữ độ trễ thấp.";
    const snippet = extractHighlightedSnippet(content, "kien truc", 70);
    expect(snippet).not.toBeNull();
    if (!snippet) return;
    const highlighted = snippet.text.slice(snippet.highlightStart, snippet.highlightEnd);
    expect(highlighted.toLowerCase()).toBe("kiến trúc");
  });
});
