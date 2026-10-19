import { describe, expect, it, vi } from "vitest";
import { defaultGroupTitle, findOrCreateGroup, normalizeLevel } from "@/lib/roadmap/levels";

describe("normalizeLevel", () => {
  it.each([
    ["core", "core"],
    ["Core", "core"],
    ["  CORE  ", "core"],
    ["basic", "core"],
    ["cơ bản", "core"],
    ["Trung bình", "intermediate"],
    ["trung cấp", "intermediate"],
    ["Advanced", "advanced"],
    ["nâng  cao", "advanced"],
    ["Deep Dive", "deep dive"],
    ["", "core"],
    [undefined, "core"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeLevel(input)).toBe(expected);
  });
});

describe("defaultGroupTitle", () => {
  it("uses the standard titles for known levels", () => {
    expect(defaultGroupTitle("Core")).toBe("🟢 Core");
    expect(defaultGroupTitle("nâng cao")).toBe("🔴 Advanced");
  });

  it("title-cases custom levels", () => {
    expect(defaultGroupTitle("deep dive")).toBe("Deep Dive");
  });
});

describe("findOrCreateGroup", () => {
  function fakeDb(groups: { id: string; level: string }[]) {
    return {
      roadmapGroup: {
        findMany: vi.fn().mockResolvedValue(groups.map((g) => ({ ...g, _count: { items: 0 } }))),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data, _count: { items: 0 } })),
      },
    };
  }

  it("reuses a legacy group whose level differs only in case", async () => {
    const db = fakeDb([{ id: "g1", level: "Core" }]);
    const group = await findOrCreateGroup(db as never, "layer-1", "core");
    expect(group.id).toBe("g1");
    expect(db.roadmapGroup.create).not.toHaveBeenCalled();
  });

  it("creates the group on first use with a normalized level and default title", async () => {
    const db = fakeDb([]);
    const group = await findOrCreateGroup(db as never, "layer-1", "Nâng cao");
    expect(db.roadmapGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { layerId: "layer-1", level: "advanced", title: "🔴 Advanced", order: 99 } }),
    );
    expect(group.level).toBe("advanced");
  });
});
