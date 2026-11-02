import { describe, expect, it, vi } from "vitest";
import { GroupChoiceRequired, pickGroup, resolveGroup } from "@/lib/roadmap/groups";
import shared from "../../roadmap-rag-assistant/tests/data/group_cases.json";

interface PickCase {
  name: string;
  groups: string[];
  groupId?: string;
  groupTitle?: string;
  expect: [string, string | string[]];
}

describe("shared with rag_service/adapters/groups.py", () => {
  it.each((shared.pick as PickCase[]).map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const groups = c.groups.map((title, i) => ({ id: `g${i + 1}`, title }));
    const pick = pickGroup(groups, { groupId: c.groupId, groupTitle: c.groupTitle });
    const [kind, want] = c.expect;
    expect(pick.kind).toBe(kind);
    if (pick.kind === "existing") expect(pick.group.title).toBe(want);
    if (pick.kind === "create") expect(pick.title).toBe(want);
    if (pick.kind === "ask") expect(pick.titles).toEqual(want);
  });
});

describe("resolveGroup", () => {
  function fakeDb(groups: { id: string; title: string }[]) {
    return {
      roadmapGroup: {
        findMany: vi.fn().mockResolvedValue(groups),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data })),
      },
    };
  }

  it("asks with the layer's groups and writes nothing when none is named", async () => {
    const db = fakeDb([
      { id: "g1", title: "Core" },
      { id: "g2", title: "Production" },
    ]);
    const err = await resolveGroup(db as never, "layer-1", {}).catch((e) => e);
    expect(err).toBeInstanceOf(GroupChoiceRequired);
    expect(err.titles).toEqual(["Core", "Production"]);
    expect(db.roadmapGroup.create).not.toHaveBeenCalled();
  });

  it("creates a group for a new title after the existing ones", async () => {
    const db = fakeDb([{ id: "g1", title: "Core" }]);
    const group = await resolveGroup(db as never, "layer-1", { groupTitle: " Deep  Dive " });
    expect(db.roadmapGroup.create).toHaveBeenCalledWith({ data: { layerId: "layer-1", title: "Deep Dive", order: 2 } });
    expect(group.title).toBe("Deep Dive");
  });

  it("uses the layer's only group", async () => {
    const db = fakeDb([{ id: "g1", title: "Core" }]);
    expect((await resolveGroup(db as never, "layer-1", {})).id).toBe("g1");
    expect(db.roadmapGroup.create).not.toHaveBeenCalled();
  });
});
