import { describe, expect, it } from "vitest";
import { sectionSpelling, sectionsInOrder } from "@/lib/roadmap/sections";

describe("sectionSpelling", () => {
  it("reuses the spelling a section already has, so a different case or spacing is the same section", () => {
    expect(sectionSpelling(["RAG"], "rag ")).toBe("RAG");
    expect(sectionSpelling(["RAG"], "  Rag  ")).toBe("RAG");
  });

  it("keeps diacritics significant: a different accent is a different section", () => {
    expect(sectionSpelling(["Cơ bản"], "Co ban")).toBe("Co ban");
  });

  it("trims and collapses inner spaces of a new name", () => {
    expect(sectionSpelling([], "  Case   study ")).toBe("Case study");
  });

  it("blank input means no section", () => {
    expect(sectionSpelling(["RAG"], "   ")).toBeNull();
    expect(sectionSpelling(["RAG"], null)).toBeNull();
    expect(sectionSpelling(["RAG"], undefined)).toBeNull();
  });
});

describe("sectionsInOrder", () => {
  it("lists sections in the order their first lesson appears", () => {
    expect(
      sectionsInOrder([{ section: "RAG" }, { section: "DB" }, { section: "RAG" }, { section: null }])
    ).toEqual(["RAG", "DB", null]);
  });

  it("lists the no-section group once, wherever it first appears", () => {
    expect(sectionsInOrder([{ section: null }, { section: "A" }, { section: null }])).toEqual([null, "A"]);
  });

  it("is empty for a topic with no lessons", () => {
    expect(sectionsInOrder([])).toEqual([]);
  });
});
