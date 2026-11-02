import { prisma } from '@/lib/prisma';

/**
 * Resolve a topic by slug, then by title (case-insensitive). The assistant may send a title where the URL
 * expects a slug.
 */
export async function resolveRoadmapId(identifier: string): Promise<string | null> {
  const direct = await prisma.roadmap.findUnique({ where: { slug: identifier }, select: { id: true } });
  if (direct) return direct.id;

  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmap.findMany({ select: { id: true, slug: true, title: true } });
  const match = all.find((r) => r.slug.toLowerCase() === norm) || all.find((r) => r.title.toLowerCase() === norm);
  return match?.id ?? null;
}
