import type { Prisma, RoadmapItem } from '@prisma/client';
import { findDuplicate } from '@/lib/roadmap/duplicates';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { DEFAULT_LESSON_STATUS, type LessonStatus } from '@/lib/roadmap/status';
import { allocateGlobalLessonSlug } from '@/lib/utils';

export interface CreateLessonInput {
  roadmapSlug: string;
  title: string;
  section?: string | null;
  description?: string | null;
  content?: string | null;
  status?: LessonStatus;
}

export type CreateLessonResult =
  | { kind: 'created'; item: RoadmapItem; roadmapSlug: string }
  | { kind: 'roadmap_not_found' }
  | { kind: 'duplicate'; existing: { id: string; title: string; roadmapSlug: string } };

/**
 * Adds a Lesson to a Topic, optionally into a Section: one title per Topic, a slug unique across the site
 * (ADR-0014) and the next order. Takes a transaction client so callers can write more rows atomically.
 * The caller validates input and notifies the Roadmap Assistant.
 */
export async function createLesson(db: Prisma.TransactionClient, input: CreateLessonInput): Promise<CreateLessonResult> {
  const roadmap = await db.roadmap.findUnique({
    where: { slug: input.roadmapSlug },
    include: { items: { select: { id: true, title: true, slug: true, section: true, order: true } } },
  });
  if (!roadmap) return { kind: 'roadmap_not_found' };

  // A lesson title appears once per topic, whatever its section
  const duplicate = findDuplicate(roadmap.items, input.title);
  if (duplicate) {
    return { kind: 'duplicate', existing: { id: duplicate.id, title: duplicate.title, roadmapSlug: roadmap.slug } };
  }

  const allItems = (await db.roadmapItem.findMany?.({ select: { slug: true } })) ?? [];
  const redirects =
    (await db.slugRedirect?.findMany?.({
      where: { entity: 'lesson' },
      select: { fromSlug: true },
    })) ?? [];
  const topicSlugs = new Set<string>(roadmap.items.map((i) => i.slug).filter(Boolean));
  const existingSlugs = new Set<string>([
    ...topicSlugs,
    ...allItems.map((i) => i.slug).filter(Boolean),
    ...redirects.map((r) => r.fromSlug).filter(Boolean),
  ]);
  const itemSlug = allocateGlobalLessonSlug(input.title.trim(), existingSlugs, roadmap.slug, topicSlugs);

  const sectionName = sectionSpelling(roadmap.items.map((i) => i.section), input.section);
  const order = roadmap.items.reduce((max, i) => Math.max(max, i.order), 0) + 1;

  const item = await db.roadmapItem.create({
    data: {
      roadmapId: roadmap.id,
      slug: itemSlug,
      section: sectionName,
      title: input.title.trim(),
      description: input.description || '',
      content: input.content || null,
      order,
      // A lesson added without a status is known (ADR-0010)
      status: input.status ?? DEFAULT_LESSON_STATUS,
    },
  });

  return { kind: 'created', item, roadmapSlug: roadmap.slug };
}
