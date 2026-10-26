import { describe, expect, it, vi } from "vitest";
import { defaultGroupTitle, findOrCreateGroup, normalizeLevel, requireLevel } from "@/lib/roadmap/levels";
import shared from "../../roadmap-rag-assistant/tests/data/level_cases.json";

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
    ["", ""],
    [undefined, ""],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeLevel(input)).toBe(expected);
  });
});

describe("shared with rag_service/adapters/levels.py", () => {
  it.each(shared.normalize as [string, string][])("normalizes %s -> %s", (input, expected) => {
    expect(normalizeLevel(input)).toBe(expected);
  });

  it.each(shared.default_title as [string, string][])("titles %s as %s", (input, title) => {
    expect(defaultGroupTitle(input)).toBe(title);
  });
});

describe("requireLevel", () => {
  it("keeps a given level", () => {
    expect(requireLevel("Nâng cao")).toBe("advanced");
  });

  it("throws when no level was given: nothing is filed under a default", () => {
    expect(() => requireLevel("")).toThrow(/level is required/);
    expect(() => requireLevel(undefined)).toThrow(/core \| intermediate \| advanced/);
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

  it("refuses to file a group or item without a level", async () => {
    const db = fakeDb([]);
    await expect(findOrCreateGroup(db as never, "layer-1", "")).rejects.toThrow(/level is required/);
    expect(db.roadmapGroup.create).not.toHaveBeenCalled();
  });

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
