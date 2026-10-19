import type { Prisma, PrismaClient } from '@prisma/client';

// Same aliases as roadmap-rag-assistant/rag_service/adapters/levels.py; keep the two in sync.
const LEVEL_ALIASES: Record<string, string> = {
  core: 'core',
  basic: 'core',
  'cơ bản': 'core',
  intermediate: 'intermediate',
  'trung bình': 'intermediate',
  'trung cấp': 'intermediate',
  advanced: 'advanced',
  'nâng cao': 'advanced',
};

const DEFAULT_TITLES: Record<string, string> = {
  core: '🟢 Core',
  intermediate: '🟡 Intermediate',
  advanced: '🔴 Advanced',
};

/** Canonical level: known aliases map to core | intermediate | advanced; custom levels are kept, lowercased. */
export function normalizeLevel(raw: string | null | undefined): string {
  const level = (raw ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!level) return 'core';
  return LEVEL_ALIASES[level] ?? level;
}

/** Title of a group created for a level; custom levels are title-cased. */
export function defaultGroupTitle(level: string): string {
  const canonical = normalizeLevel(level);
  return DEFAULT_TITLES[canonical] ?? canonical.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The layer's group for a level, created on first use.
 * Existing groups are matched after normalizing, so a legacy "Core" group is reused rather than split.
 */
export async function findOrCreateGroup(db: Db, layerId: string, rawLevel: string) {
  const level = normalizeLevel(rawLevel);
  const groups = await db.roadmapGroup.findMany({
    where: { layerId },
    include: { _count: { select: { items: true } } },
  });
  const existing = groups.find((g) => normalizeLevel(g.level) === level);
  if (existing) return existing;
  return db.roadmapGroup.create({
    data: { layerId, level, title: defaultGroupTitle(level), order: 99 },
    include: { _count: { select: { items: true } } },
  });
}
