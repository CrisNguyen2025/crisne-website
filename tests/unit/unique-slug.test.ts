import { describe, expect, it } from "vitest";
import { uniqueSlug } from "@/lib/utils";

describe("uniqueSlug", () => {
  it("slugifies the title and records it as used", () => {
    const used = new Set<string>();
    expect(uniqueSlug("Cơ bản về Docker", used)).toBe("co-ban-ve-docker");
    expect(used.has("co-ban-ve-docker")).toBe(true);
  });

  it("adds -2, -3 when titles slugify the same in one topic", () => {
    const used = new Set(["kubernetes"]);
    expect(uniqueSlug("Kubernetes!", used)).toBe("kubernetes-2");
    expect(uniqueSlug("kubernetes?", used)).toBe("kubernetes-3");
  });

  it("falls back to 'lesson' when the title has no slug characters", () => {
    expect(uniqueSlug("!!!", new Set())).toBe("lesson");
  });
});
