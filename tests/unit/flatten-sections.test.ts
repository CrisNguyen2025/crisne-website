import { describe, expect, it } from "vitest";
import { normalizeTitle, planFlatten, sectionName } from "@/scripts/lib/flatten-sections";

const layer = (id: string, order: number, title: string, roadmapId = "topic-1") => ({ id, roadmapId, order, title });
const group = (id: string, layerId: string, order: number, title: string) => ({ id, layerId, order, title });
const item = (id: string, groupId: string, order: number, title: string) => ({ id, groupId, order, title });

describe("sectionName", () => {
  it("a layer with one group keeps the layer's name", () => {
    expect(sectionName(layer("l", 1, "RAG"), "Core", 1)).toBe("RAG");
  });

  it("a layer with several groups keeps both names, so no lesson loses its group", () => {
    expect(sectionName(layer("l", 1, "RAG"), "Core", 2)).toBe("RAG · Core");
  });

  it("trims the names it joins", () => {
    expect(sectionName(layer("l", 1, "  RAG "), " Core ", 2)).toBe("RAG · Core");
  });
});

describe("planFlatten", () => {
  it("moves every lesson into its topic, in the order it had on the page", () => {
    const plan = planFlatten({
      layers: [layer("l2", 2, "LLM"), layer("l1", 1, "DB")],
      groups: [group("g2", "l2", 1, "Core"), group("g1", "l1", 1, "Core")],
      items: [item("i2", "g2", 1, "Transformer"), item("i1", "g1", 2, "Index"), item("i0", "g1", 1, "SQL")],
      triage: [],
    });
    expect(plan.items.map((i) => [i.id, i.section, i.order])).toEqual([
      ["i0", "DB", 1],
      ["i1", "DB", 2],
      ["i2", "LLM", 3],
    ]);
    expect(plan.items.every((i) => i.roadmapId === "topic-1")).toBe(true);
    expect(plan.conflicts).toEqual([]);
  });

  it("numbers the order per topic, so two topics do not share a sequence", () => {
    const plan = planFlatten({
      layers: [layer("a", 1, "X", "t1"), layer("b", 1, "Y", "t2")],
      groups: [group("ga", "a", 1, "G"), group("gb", "b", 1, "G")],
      items: [item("ia", "ga", 1, "One"), item("ib", "gb", 1, "Two")],
      triage: [],
    });
    expect(plan.items.map((i) => [i.roadmapId, i.order])).toEqual([["t1", 1], ["t2", 1]]);
  });

  it("names a section after the layer, or after layer and group when the layer had several", () => {
    const plan = planFlatten({
      layers: [layer("l", 1, "RAG")],
      groups: [group("g1", "l", 1, "Core"), group("g2", "l", 2, "Case study")],
      items: [item("i1", "g1", 1, "Chunking"), item("i2", "g2", 1, "Netflix")],
      triage: [],
    });
    expect(plan.items.map((i) => i.section)).toEqual(["RAG · Core", "RAG · Case study"]);
  });

  it("reports a lesson name used twice in one topic, ignoring case and spacing", () => {
    const plan = planFlatten({
      layers: [layer("a", 1, "X"), layer("b", 2, "Y")],
      groups: [group("ga", "a", 1, "G"), group("gb", "b", 1, "G")],
      items: [item("i1", "ga", 1, "Docker"), item("i2", "gb", 1, "  docker ")],
      triage: [],
    });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toContain("i1");
  });

  it("keeps a triage draft's target as a section, and leaves a draft with no layer without one", () => {
    const plan = planFlatten({
      layers: [layer("l", 1, "RAG")],
      groups: [group("g1", "l", 1, "Core"), group("g2", "l", 2, "Case")],
      items: [],
      triage: [
        { id: "t1", layerId: "l", groupTitle: "Case" },
        { id: "t2", layerId: null, groupTitle: null },
      ],
    });
    expect(plan.triage).toEqual([
      { id: "t1", section: "RAG · Case" },
      { id: "t2", section: null },
    ]);
  });

  it("refuses a lesson that points at a missing group, rather than moving it to nowhere", () => {
    expect(() =>
      planFlatten({ layers: [], groups: [], items: [item("i", "gone", 1, "X")], triage: [] })
    ).toThrow(/no group or layer/);
  });
});

describe("normalizeTitle", () => {
  it("matches the Next.js duplicate check", () => {
    expect(normalizeTitle("  RAG   Core ")).toBe("rag core");
  });
});
