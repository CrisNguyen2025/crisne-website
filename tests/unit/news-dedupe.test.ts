import { describe, expect, it } from "vitest";
import { computeTitleSimilarity, normalizeTitleForCompare } from "@/lib/news/dedupe";

describe("news title dedupe helpers", () => {
  it("normalizes Vietnamese diacritics and punctuation consistently", () => {
    expect(normalizeTitleForCompare("Đánh giá Next.js 16: Cải thiện tốc độ build!")).toBe(
      "danh gia next js 16 cai thien toc do build"
    );
  });

  it("scores near-identical titles high and unrelated titles low", () => {
    const similar = computeTitleSimilarity(
      "OpenAI ra mắt mô hình GPT-5 hỗ trợ suy luận nhanh hơn",
      "OpenAI vừa ra mắt mô hình GPT 5 hỗ trợ suy luận nhanh"
    );
    const distinct = computeTitleSimilarity(
      "OpenAI ra mắt mô hình GPT-5 hỗ trợ suy luận nhanh hơn",
      "Hướng dẫn cấu hình Cloudflare R2 cho Next.js App Router"
    );

    expect(similar).toBeGreaterThanOrEqual(0.72);
    expect(distinct).toBeLessThan(0.4);
  });
});
