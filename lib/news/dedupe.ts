import { prisma } from "@/lib/prisma";

const DEFAULT_WINDOW_HOURS = 72;
const DEFAULT_SIMILARITY_THRESHOLD = 0.72;
const MIN_NORMALIZED_LENGTH = 15;

export function normalizeTitleForCompare(title: string): string {
  return title
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

function charBigrams(normalized: string): string[] {
  const compact = normalized.replace(/\s+/g, "");
  if (compact.length < 2) return compact ? [compact] : [];
  const bigrams: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) {
    bigrams.push(compact.slice(i, i + 2));
  }
  return bigrams;
}

function diceCoefficient(a: string, b: string): number {
  const bigramsA = charBigrams(a);
  const bigramsB = charBigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const bg of bigramsA) {
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }

  let matches = 0;
  for (const bg of bigramsB) {
    const count = counts.get(bg) ?? 0;
    if (count > 0) {
      matches++;
      counts.set(bg, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

function jaccardTokens(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function computeTitleSimilarity(titleA: string, titleB: string): number {
  const normA = normalizeTitleForCompare(titleA);
  const normB = normalizeTitleForCompare(titleB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  return 0.5 * jaccardTokens(normA, normB) + 0.5 * diceCoefficient(normA, normB);
}

export async function findPossibleTitleDuplicate(params: {
  excludeId: string;
  title: string;
  windowHours?: number;
  threshold?: number;
}): Promise<string | null> {
  const normalized = normalizeTitleForCompare(params.title);
  if (normalized.length < MIN_NORMALIZED_LENGTH) {
    return null;
  }

  const windowHours = params.windowHours ?? DEFAULT_WINDOW_HOURS;
  const threshold = params.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const cutoff = new Date(Date.now() - windowHours * 3_600_000);

  const candidates = await prisma.newsItem.findMany({
    where: {
      id: { not: params.excludeId },
      reviewStatus: { not: "dismissed" },
      normalizedTitle: { not: null },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      normalizedTitle: true,
    },
  });

  let bestId: string | null = null;
  let bestScore = threshold;

  for (const candidate of candidates) {
    if (!candidate.normalizedTitle) continue;
    const score = computeTitleSimilarity(normalized, candidate.normalizedTitle);
    if (score >= bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return bestId;
}
