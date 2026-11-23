import { describe, expect, it } from "vitest";
import { isPublicPagePath } from "@/lib/auth/public-paths";

describe("isPublicPagePath", () => {
  it("allows the public News list and post pages", () => {
    expect(isPublicPagePath("/news")).toBe(true);
    expect(isPublicPagePath("/news/01a2067a-15d0-7ee1-a77a-1482568a7278")).toBe(true);
    expect(isPublicPagePath("/news/nextjs-cache-components-explained")).toBe(true);
  });

  it("keeps every other path Owner-only", () => {
    for (const path of [
      "/newsx",
      "/feed-ingestion",
      "/feed-ingestion/sources",
      "/picks",
      "/picks/01a2067a-15d0-7ee1-a77a-1482568a7278",
      "/api/news",
      "/api/picks",
      "/",
      "/share",
    ]) {
      expect(isPublicPagePath(path)).toBe(false);
    }
  });
});
