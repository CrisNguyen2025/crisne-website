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

export function planSeedImport(input: SeedImportPlanInput): SeedImportPlan {
  const maxOrder = input.existingLessons.reduce(
    (max, item) => Math.max(max, Number(item.order) || 0),
    0
  );
  let currentOrder = maxOrder;

  const seenTitles = new Set<string>(
    input.existingLessons.map((item) => normalizeTitle(item.title))
  );

  const toAdd: PlannedLesson[] = [];
  const skipped: SkippedLesson[] = [];
  const bySection: Record<string, number> = {};
  const generateId = input.generateId ?? uuidv7;
  const now = input.now ?? Date.now();

  for (const layer of input.seedLayers) {
    for (const group of layer.groups) {
      const section = sectionName(
        { id: layer.id, roadmapId: input.roadmapId ?? "", order: layer.order, title: layer.title },
        group.title,
        layer.groups.length
      );

      for (const item of group.items) {
        const normalized = normalizeTitle(item.title);
        if (seenTitles.has(normalized)) {
          skipped.push({
            title: item.title,
            section,
            reason: "already exists in topic",
          });
          continue;
        }

        seenTitles.add(normalized);
        currentOrder += 1;

        const planned: PlannedLesson = {
          id: generateId(),
          ...(input.roadmapId ? { roadmapId: input.roadmapId } : {}),
          section,
          title: item.title,
          description: item.description ? item.description.trim() || null : null,
          content: item.content ? item.content.trim() || null : null,
          order: currentOrder,
          status: "target",
          statusUpdatedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        toAdd.push(planned);
        bySection[section] = (bySection[section] ?? 0) + 1;
      }
    }
  }

  return { toAdd, skipped, bySection };
}
