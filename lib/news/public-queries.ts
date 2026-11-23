import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseJsonStringArray } from "./schemas";

/**
 * Read-only data for the Visitor page (`/picks`). Selects an explicit allowlist of fields so
 * Owner-only data (personalNote, tags, source, review/read state) can never reach the page.
 */
export interface PublicNewsItemDto {
  id: string;
  title: string;
  canonicalUrl: string;
  domain: string;
  author: string | null;
  tldr: string | null;
  takeaways: string[];
  publishedAt: string | null;
  publicAt: string | null;
}

const PUBLIC_NEWS_SELECT = {
  id: true,
  title: true,
  canonicalUrl: true,
  domain: true,
  author: true,
  tldr: true,
  takeaways: true,
  publishedAt: true,
  publicAt: true,
} satisfies Prisma.NewsItemSelect;

const PUBLIC_NEWS_WHERE = {
  isPublic: true,
  ingestStatus: "ready",
  reviewStatus: { not: "dismissed" },
} satisfies Prisma.NewsItemWhereInput;

const PUBLIC_NEWS_LIMIT = 100;

type PublicNewsRow = Prisma.NewsItemGetPayload<{ select: typeof PUBLIC_NEWS_SELECT }>;

function toPublicNewsItem(row: PublicNewsRow): PublicNewsItemDto {
  return {
    id: row.id,
    title: row.title,
    canonicalUrl: row.canonicalUrl,
    domain: row.domain,
    author: row.author,
    tldr: row.tldr,
    takeaways: parseJsonStringArray(row.takeaways),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    publicAt: row.publicAt ? row.publicAt.toISOString() : null,
  };
}

export async function listPublicNewsItems(): Promise<PublicNewsItemDto[]> {
  const rows = await prisma.newsItem.findMany({
    where: PUBLIC_NEWS_WHERE,
    orderBy: [{ publicAt: "desc" }, { id: "desc" }],
    take: PUBLIC_NEWS_LIMIT,
    select: PUBLIC_NEWS_SELECT,
  });
  return rows.map(toPublicNewsItem);
}

export async function getPublicNewsItem(id: string): Promise<PublicNewsItemDto | null> {
  const row = await prisma.newsItem.findFirst({
    where: { id, ...PUBLIC_NEWS_WHERE },
    select: PUBLIC_NEWS_SELECT,
  });
  return row ? toPublicNewsItem(row) : null;
}
