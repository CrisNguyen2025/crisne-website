import { prisma } from '@/lib/prisma';
import type { Roadmap, RoadmapItem } from '@prisma/client';
import { lessonPath, topicPath } from '@/lib/roadmap/paths';

export async function findTopic(identifier: string): Promise<Roadmap | null> {
  const roadmap = await prisma.roadmap.findUnique({ where: { slug: identifier } });
  if (roadmap) return roadmap;
  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmap.findMany();
  return all.find((r) => r.slug.toLowerCase() === norm) || all.find((r) => r.title.toLowerCase() === norm) || null;
}

export async function findItemBySlug(roadmapId: string, identifier: string): Promise<RoadmapItem | null> {
  const item = await prisma.roadmapItem.findFirst({
    where: { roadmapId, slug: identifier },
  });
  if (item) return item;

  const byId = await prisma.roadmapItem.findFirst({
    where: { roadmapId, id: identifier },
  });
  if (byId) return byId;

  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmapItem.findMany({ where: { roadmapId } });
  return all.find((i) => i.slug?.toLowerCase() === norm) || all.find((i) => i.id === identifier) || null;
}

export type TopicResolution =
  | { kind: 'found'; topic: Roadmap }
  | { kind: 'redirect'; toSlug: string }
  | { kind: 'missing' };

export type LessonResolution =
  | { kind: 'found'; item: RoadmapItem; topic: Roadmap }
  | { kind: 'redirect'; toSlug: string }
  | { kind: 'missing' };

export async function resolveTopicGlobal(identifier: string): Promise<TopicResolution> {
  const raw = identifier.trim();
  if (!raw) return { kind: 'missing' };

  const exact = await prisma.roadmap.findUnique({ where: { slug: raw } });
  if (exact) return { kind: 'found', topic: exact };

  const norm = raw.toLowerCase();
  const all = await prisma.roadmap.findMany();
  const byCaseOrTitle =
    all.find((r) => r.slug.toLowerCase() === norm) ||
    all.find((r) => r.title.toLowerCase() === norm);
  if (byCaseOrTitle) {
    return { kind: 'redirect', toSlug: byCaseOrTitle.slug };
  }

  const redirectRow = await prisma.slugRedirect?.findUnique?.({
    where: { fromSlug: norm },
  });
  if (redirectRow && redirectRow.entity === 'topic') {
    const target = await prisma.roadmap.findUnique({ where: { id: redirectRow.targetId } });
    if (target) return { kind: 'redirect', toSlug: target.slug };
  }

  return { kind: 'missing' };
}

/**
 * Canonical path of the Lesson that `identifier` (slug, id or old slug) names, following
 * a redirect so the caller can answer with a single 308; null when there is no such Lesson.
 */
export async function findLessonPath(identifier: string): Promise<string | null> {
  const resolved = await resolveLessonGlobal(identifier);
  if (resolved.kind === 'found') return lessonPath(resolved.topic.slug, resolved.item.slug);
  if (resolved.kind === 'redirect') {
    const target = await resolveLessonGlobal(resolved.toSlug);
    if (target.kind === 'found') return lessonPath(target.topic.slug, target.item.slug);
  }
  return null;
}

/** Canonical path of the Topic that `identifier` names; null when there is no such Topic. */
export async function findTopicPath(identifier: string): Promise<string | null> {
  const resolved = await resolveTopicGlobal(identifier);
  if (resolved.kind === 'found') return topicPath(resolved.topic.slug);
  if (resolved.kind === 'redirect') return topicPath(resolved.toSlug);
  return null;
}

export async function resolveLessonGlobal(identifier: string): Promise<LessonResolution> {
  const raw = identifier.trim();
  if (!raw) return { kind: 'missing' };

  const exact = await prisma.roadmapItem.findUnique({
    where: { slug: raw },
    include: { roadmap: true },
  });
  if (exact) {
    return { kind: 'found', item: exact, topic: exact.roadmap };
  }

  const byId = await prisma.roadmapItem.findUnique({
    where: { id: raw },
    include: { roadmap: true },
  });
  if (byId && byId.slug) {
    return { kind: 'redirect', toSlug: byId.slug };
  }

  const norm = raw.toLowerCase();
  const all = await prisma.roadmapItem.findMany({
    select: { id: true, slug: true },
  });
  const caseMatch = all.find((i) => i.slug.toLowerCase() === norm);
  if (caseMatch && caseMatch.slug) {
    return { kind: 'redirect', toSlug: caseMatch.slug };
  }

  const redirectRow = await prisma.slugRedirect?.findUnique?.({
    where: { fromSlug: norm },
  });
  if (redirectRow && redirectRow.entity === 'lesson') {
    const target = await prisma.roadmapItem.findUnique({
      where: { id: redirectRow.targetId },
      select: { slug: true },
    });
    if (target && target.slug) {
      return { kind: 'redirect', toSlug: target.slug };
    }
  }

  return { kind: 'missing' };
}
