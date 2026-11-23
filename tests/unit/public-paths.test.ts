import { describe, expect, it } from "vitest";
import { isPublicPagePath } from "@/lib/auth/public-paths";

describe("isPublicPagePath", () => {
  it("allows the public News list and post pages", () => {
    expect(isPublicPagePath("/picks")).toBe(true);
    expect(isPublicPagePath("/picks/01a2067a-15d0-7ee1-a77a-1482568a7278")).toBe(true);
  });

  it("keeps every other path Owner-only", () => {
    for (const path of ["/picksx", "/news", "/news/picks", "/api/news", "/api/picks", "/", "/share"]) {
      expect(isPublicPagePath(path)).toBe(false);
    }
  });
});
