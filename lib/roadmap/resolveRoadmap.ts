import { prisma } from '@/lib/prisma';
import type { Roadmap, RoadmapItem } from '@prisma/client';

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
