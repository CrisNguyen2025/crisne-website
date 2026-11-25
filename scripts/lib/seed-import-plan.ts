import { v7 as uuidv7 } from "uuid";
import type { SeedLayer } from "../../lib/roadmap/data";
import { normalizeTitle, sectionName } from "./flatten-sections";

export interface ExistingLesson {
  title: string;
  order: number;
}

export interface PlannedLesson {
  id: string;
  roadmapId?: string;
  section: string;
  title: string;
  description: string | null;
  content: string | null;
  order: number;
  status: "target";
  statusUpdatedAt: null;
  createdAt: number;
  updatedAt: number;
}

export interface SkippedLesson {
  title: string;
  section: string;
  reason: string;
}

export interface SeedImportPlanInput {
  existingLessons: ExistingLesson[];
  seedLayers: SeedLayer[];
  roadmapId?: string;
  generateId?: () => string;
  now?: number;
}

export interface SeedImportPlan {
  toAdd: PlannedLesson[];
  skipped: SkippedLesson[];
  bySection: Record<string, number>;
}

function toOptionalTrimmed(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function collectGroupSeedPlan(
  items: SeedLayer["groups"][number]["items"],
  section: string,
  seenTitles: Set<string>,
  state: {
    currentOrder: number;
    toAdd: PlannedLesson[];
    skipped: SkippedLesson[];
    bySection: Record<string, number>;
  },
  generateId: () => string,
  now: number,
  roadmapId?: string
): void {
  for (const item of items) {
    const normalized = normalizeTitle(item.title);
    if (seenTitles.has(normalized)) {
      state.skipped.push({
        title: item.title,
        section,
        reason: "already exists in topic",
      });
      continue;
    }

    seenTitles.add(normalized);
    state.currentOrder += 1;

    state.toAdd.push({
      id: generateId(),
      ...(roadmapId ? { roadmapId } : {}),
      section,
      title: item.title,
      description: toOptionalTrimmed(item.description),
      content: toOptionalTrimmed(item.content),
      order: state.currentOrder,
      status: "target",
      statusUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    state.bySection[section] = (state.bySection[section] ?? 0) + 1;
  }
}

export function planSeedImport(input: SeedImportPlanInput): SeedImportPlan {
  const maxOrder = input.existingLessons.reduce(
    (max, item) => Math.max(max, Number(item.order) || 0),
    0
  );

  const seenTitles = new Set<string>(
    input.existingLessons.map((item) => normalizeTitle(item.title))
  );

  const state = {
    currentOrder: maxOrder,
    toAdd: [] as PlannedLesson[],
    skipped: [] as SkippedLesson[],
    bySection: {} as Record<string, number>,
  };
  const generateId = input.generateId ?? uuidv7;
  const now = input.now ?? Date.now();

  for (const layer of input.seedLayers) {
    for (const group of layer.groups) {
      const section = sectionName(
        { id: layer.id, roadmapId: input.roadmapId ?? "", order: layer.order, title: layer.title },
        group.title,
        layer.groups.length
      );
      collectGroupSeedPlan(
        group.items,
        section,
        seenTitles,
        state,
        generateId,
        now,
        input.roadmapId
      );
    }
  }

  return { toAdd: state.toAdd, skipped: state.skipped, bySection: state.bySection };
}
