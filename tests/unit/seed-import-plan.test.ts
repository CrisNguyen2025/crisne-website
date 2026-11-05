import { describe, expect, it } from "vitest";
import { INITIAL_ROADMAP_DATA, type SeedLayer } from "@/lib/roadmap/data";
import { planSeedImport, type ExistingLesson } from "@/scripts/lib/seed-import-plan";

const sampleLayers: SeedLayer[] = [
  {
    id: "l1",
    order: 1,
    shortTag: "01-DB",
    title: "01. Database",
    subtitle: "Data fundamentals",
    groups: [
      {
        id: "g1",
        title: "Core",
        items: [
          {
            id: "i1",
            title: "PostgreSQL",
            description: "Relational database",
          },
          {
            id: "i2",
            title: "Redis",
            description: "In-memory cache",
          },
        ],
      },
      {
        id: "g2",
        title: "Advanced",
        items: [
          {
            id: "i3",
            title: "Vector Search",
            description: "Embeddings",
          },
        ],
      },
    ],
  },
  {
    id: "l2",
    order: 2,
    shortTag: "02-LLM",
    title: "02. LLM",
    subtitle: "Language models",
    groups: [
      {
        id: "g3",
        title: "Single Group",
        items: [
          {
            id: "i4",
            title: "Prompt Engineering",
            description: "Techniques",
          },
        ],
      },
    ],
  },
];

describe("planSeedImport", () => {
  it("imports all lessons into an empty topic with target status and sequential order", () => {
    const plan = planSeedImport({
      existingLessons: [],
      seedLayers: sampleLayers,
      roadmapId: "topic-1",
    });

    expect(plan.toAdd).toHaveLength(4);
    expect(plan.skipped).toHaveLength(0);

    expect(plan.toAdd[0]).toMatchObject({
      roadmapId: "topic-1",
      section: "01. Database · Core",
      title: "PostgreSQL",
      description: "Relational database",
      content: null,
      order: 1,
      status: "target",
      statusUpdatedAt: null,
    });

    expect(plan.toAdd[1]).toMatchObject({
      section: "01. Database · Core",
      title: "Redis",
      order: 2,
      status: "target",
    });

    expect(plan.toAdd[2]).toMatchObject({
      section: "01. Database · Advanced",
      title: "Vector Search",
      order: 3,
      status: "target",
    });

    expect(plan.toAdd[3]).toMatchObject({
      section: "02. LLM",
      title: "Prompt Engineering",
      order: 4,
      status: "target",
    });

    expect(plan.bySection).toEqual({
      "01. Database · Core": 2,
      "01. Database · Advanced": 1,
      "02. LLM": 1,
    });
  });

  it("skips duplicate titles ignoring case and surrounding whitespace", () => {
    const existing: ExistingLesson[] = [
      { title: "  postgresql  ", order: 10 },
      { title: "VECTOR SEARCH", order: 11 },
    ];

    const plan = planSeedImport({
      existingLessons: existing,
      seedLayers: sampleLayers,
      roadmapId: "topic-1",
    });

    expect(plan.toAdd).toHaveLength(2);
    expect(plan.toAdd.map((i) => i.title)).toEqual(["Redis", "Prompt Engineering"]);

    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.map((s) => s.title)).toEqual(["PostgreSQL", "Vector Search"]);
  });

  it("continues order sequentially after the maximum existing order", () => {
    const existing: ExistingLesson[] = [
      { title: "Existing 1", order: 5 },
      { title: "Existing 2", order: 25 },
      { title: "Existing 3", order: 12 },
    ];

    const plan = planSeedImport({
      existingLessons: existing,
      seedLayers: sampleLayers,
      roadmapId: "topic-1",
    });

    expect(plan.toAdd[0].order).toBe(26);
    expect(plan.toAdd[1].order).toBe(27);
    expect(plan.toAdd[2].order).toBe(28);
    expect(plan.toAdd[3].order).toBe(29);
  });

  it("produces nothing to add when rerun on its own result", () => {
    const firstRun = planSeedImport({
      existingLessons: [],
      seedLayers: sampleLayers,
      roadmapId: "topic-1",
    });

    const secondRun = planSeedImport({
      existingLessons: firstRun.toAdd.map((i) => ({ title: i.title, order: i.order })),
      seedLayers: sampleLayers,
      roadmapId: "topic-1",
    });

    expect(secondRun.toAdd).toHaveLength(0);
    expect(secondRun.skipped).toHaveLength(4);
  });

  it("generates UUID v7 identifiers by default or uses custom id generator", () => {
    const defaultPlan = planSeedImport({
      existingLessons: [],
      seedLayers: sampleLayers,
    });
    for (const item of defaultPlan.toAdd) {
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    }

    let count = 1;
    const customPlan = planSeedImport({
      existingLessons: [],
      seedLayers: sampleLayers,
      generateId: () => `custom-id-${count++}`,
    });
    expect(customPlan.toAdd[0].id).toBe("custom-id-1");
    expect(customPlan.toAdd[1].id).toBe("custom-id-2");
  });

  it("handles INITIAL_ROADMAP_DATA completely", () => {
    const plan = planSeedImport({
      existingLessons: [],
      seedLayers: INITIAL_ROADMAP_DATA,
      roadmapId: "ai-architecture",
    });

    expect(plan.toAdd).toHaveLength(109);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.toAdd.every((i) => i.status === "target")).toBe(true);
    expect(plan.toAdd.every((i) => i.statusUpdatedAt === null)).toBe(true);
    expect(plan.toAdd[0].order).toBe(1);
    expect(plan.toAdd[108].order).toBe(109);
  });
});
