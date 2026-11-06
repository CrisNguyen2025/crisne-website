import { prisma } from '@/lib/prisma';
import type { Roadmap } from '@prisma/client';

export async function findTopic(identifier: string): Promise<Roadmap | null> {
  const roadmap = await prisma.roadmap.findUnique({ where: { slug: identifier } });
  if (roadmap) return roadmap;
  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmap.findMany();
  return all.find((r) => r.slug.toLowerCase() === norm) || all.find((r) => r.title.toLowerCase() === norm) || null;
}
