import { prisma } from '@/lib/prisma';

/**
 * A cheap fingerprint of everything the Roadmap Assistant indexes from /api/v1/roadmaps/full-export.
 *
 * Any create, edit, move, rename or delete of a topic or lesson changes a count or a latest `updatedAt`, so the
 * assistant's periodic freshness check can skip re-reading the whole export while the version stays the same.
 * Reads two aggregates only, never lesson content.
 */
export async function getRoadmapIndexVersion(): Promise<string> {
  const [topics, lessons] = await Promise.all([
    prisma.roadmap.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.roadmapItem.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  return [
    topics._count._all,
    topics._max.updatedAt?.getTime() ?? 0,
    lessons._count._all,
    lessons._max.updatedAt?.getTime() ?? 0,
  ].join('.');
}
