import { prisma } from '@/lib/prisma';

/**
 * Resolve a roadmap by slug, then shortCode, then title (case-insensitive).
 * The assistant may send a shortCode (e.g. "KKK") where the URL expects a slug.
 */
export async function resolveRoadmapId(identifier: string): Promise<string | null> {
  const direct = await prisma.roadmap.findUnique({ where: { slug: identifier }, select: { id: true } });
  if (direct) return direct.id;

  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmap.findMany({ select: { id: true, slug: true, shortCode: true, title: true } });
  const match =
    all.find((r) => r.slug.toLowerCase() === norm) ||
    all.find((r) => r.shortCode?.toLowerCase() === norm) ||
    all.find((r) => r.title.toLowerCase() === norm);
  return match?.id ?? null;
}
