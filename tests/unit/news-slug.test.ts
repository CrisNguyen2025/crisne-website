import { describe, expect, it } from "vitest";
import { buildBaseNewsSlug, isEligibleNewsTitleForSlug, pickUniqueNewsSlug } from "@/lib/news/slug";

describe("isEligibleNewsTitleForSlug", () => {
  it("accepts non-empty readable titles and rejects blank or URL fallback titles", () => {
    expect(isEligibleNewsTitleForSlug("Next.js 16 Release Notes")).toBe(true);
    expect(isEligibleNewsTitleForSlug("")).toBe(false);
    expect(isEligibleNewsTitleForSlug("   ")).toBe(false);
    expect(isEligibleNewsTitleForSlug("https://tiktok.com/@donnie/photo/123")).toBe(false);
    expect(isEligibleNewsTitleForSlug("HTTP://example.com/post")).toBe(false);
  });
});

describe("buildBaseNewsSlug", () => {
  it("normalizes Vietnamese accents, đ, and spaces into lowercase ASCII slugs", () => {
    expect(buildBaseNewsSlug("Hướng dẫn cấu hình Đọc và Lưu bài viết")).toBe(
      "huong-dan-cau-hinh-doc-va-luu-bai-viet"
    );
  });

  it("trims long titles on a word boundary within 90 characters", () => {
    const longTitle = [
      "building",
      "production",
      "retrieval",
      "augmented",
      "generation",
      "pipelines",
      "with",
      "hybrid",
      "search",
      "and",
      "reranking",
      "evaluation",
      "frameworks",
      "today",
    ].join(" ");
    const slug = buildBaseNewsSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe(
      "building-production-retrieval-augmented-generation-pipelines-with-hybrid-search-and"
    );

    const unbroken = "a".repeat(120);
    expect(buildBaseNewsSlug(unbroken)).toBe("a".repeat(90));
  });

  it("falls back to domain or 'news' when the title produces no ASCII slug characters", () => {
    expect(buildBaseNewsSlug("🚀🔥✨", "youtube.com")).toBe("youtubecom");
    expect(buildBaseNewsSlug("日本語タイトル")).toBe("news");
  });
});

describe("pickUniqueNewsSlug", () => {
  it("appends incremental numeric suffixes on collision and tracks used slugs", () => {
    const used = new Set<string>(["nextjs-release", "nextjs-release-2"]);

    expect(pickUniqueNewsSlug("fresh-post", used)).toBe("fresh-post");
    expect(pickUniqueNewsSlug("fresh-post", used)).toBe("fresh-post-2");
    expect(pickUniqueNewsSlug("nextjs-release", used)).toBe("nextjs-release-3");
    expect(pickUniqueNewsSlug("nextjs-release", used)).toBe("nextjs-release-4");
  });
});
