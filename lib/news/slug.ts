import type { Prisma, PrismaClient } from "@prisma/client";
import { slugify } from "../utils";

const MAX_NEWS_SLUG_LENGTH = 90;

export function isEligibleNewsTitleForSlug(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length > 0 && !/^https?:\/\//i.test(trimmed);
}

function trimSlugToLength(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf("-");
  const trimmed = lastHyphen >= Math.floor(maxLength / 2) ? cut.slice(0, lastHyphen) : cut;
  return trimmed.replace(/-+$/g, "") || cut;
}

export function buildBaseNewsSlug(title: string, fallbackDomain?: string): string {
  const fromTitle = trimSlugToLength(slugify(title), MAX_NEWS_SLUG_LENGTH);
  if (fromTitle) return fromTitle;
  const fromDomain = fallbackDomain ? trimSlugToLength(slugify(fallbackDomain), MAX_NEWS_SLUG_LENGTH) : "";
  return fromDomain || "news";
}

export function pickUniqueNewsSlug(base: string, used: Set<string>): string {
  let candidate = base;
  for (let suffix = 2; used.has(candidate); suffix++) {
    candidate = `${base}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

type NewsSlugClient = Pick<PrismaClient, "newsItem"> | Pick<Prisma.TransactionClient, "newsItem">;

export async function allocateUniqueNewsSlug(
  db: NewsSlugClient,
  title: string,
  options: { fallbackDomain?: string; excludeId?: string } = {}
): Promise<string> {
  const base = buildBaseNewsSlug(title, options.fallbackDomain);
  const existing = await db.newsItem.findMany({
    where: {
      slug: { startsWith: base },
      ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
    },
    select: { slug: true },
  });
  const used = new Set(
    existing
      .map((row) => row.slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0)
  );
  return pickUniqueNewsSlug(base, used);
}
