import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitleForCompare } from "./dedupe";
import {
  type NewsCountsDto,
  type NewsFeedQueryParams,
  type NewsFeedResponseDto,
  type NewsFeedView,
  type NewsItemDto,
  type NewsTagCountDto,
  type UpdateNewsItemRequest,
  normalizeTagList,
  serializeNewsItem,
} from "./schemas";

const SEARCH_BATCH_SIZE = 500;
const MAX_SEARCH_SCANNED_ROWS = 5000;
const MAX_RETURNED_TAGS = 40;

function buildViewWhere(view?: NewsFeedView): Prisma.NewsItemWhereInput {
  switch (view) {
    case "inbox":
      return { reviewStatus: { not: "dismissed" }, isSaved: false };
    case "done":
      return { OR: [{ isSaved: true }, { reviewStatus: "dismissed" }] };
    case "unread":
      return { reviewStatus: "published", readState: "unread" };
    case "saved":
      return { reviewStatus: { not: "dismissed" }, isSaved: true };
    case "all":
      return {};
    case "draft":
      return { reviewStatus: "draft" };
    case "queue":
      return {
        reviewStatus: { not: "dismissed" },
        ingestStatus: { in: ["queued", "processing", "failed"] },
      };
    default:
      return { reviewStatus: { not: "dismissed" } };
  }
}

function matchesSearchQuery(item: NewsItemDto, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystacks = [
    item.title,
    item.tldr ?? "",
    item.domain,
    item.author ?? "",
    item.personalNote ?? "",
    item.tags.join(" "),
  ];
  return haystacks.some((text) => normalizeTitleForCompare(text).includes(normalizedQuery));
}

async function computeNewsCounts(): Promise<NewsCountsDto> {
  const [
    total,
    queued,
    processing,
    ready,
    partial,
    failed,
    draft,
    unread,
    saved,
    queue,
    inbox,
    done,
  ] =
    await Promise.all([
      prisma.newsItem.count({ where: buildViewWhere("all") }),
      prisma.newsItem.count({ where: { reviewStatus: { not: "dismissed" }, ingestStatus: "queued" } }),
      prisma.newsItem.count({
        where: { reviewStatus: { not: "dismissed" }, ingestStatus: "processing" },
      }),
      prisma.newsItem.count({ where: { reviewStatus: { not: "dismissed" }, ingestStatus: "ready" } }),
      prisma.newsItem.count({ where: { reviewStatus: { not: "dismissed" }, ingestStatus: "partial" } }),
      prisma.newsItem.count({ where: { reviewStatus: { not: "dismissed" }, ingestStatus: "failed" } }),
      prisma.newsItem.count({ where: { reviewStatus: "draft" } }),
      prisma.newsItem.count({ where: { reviewStatus: "published", readState: "unread" } }),
      prisma.newsItem.count({ where: { reviewStatus: { not: "dismissed" }, isSaved: true } }),
      prisma.newsItem.count({
        where: {
          reviewStatus: { not: "dismissed" },
          ingestStatus: { in: ["queued", "processing", "failed"] },
        },
      }),
      prisma.newsItem.count({ where: buildViewWhere("inbox") }),
      prisma.newsItem.count({ where: buildViewWhere("done") }),
    ]);

  return {
    total,
    queued,
    processing,
    ready,
    partial,
    failed,
    draft,
    unread,
    saved,
    queue,
    inbox,
    done,
  };
}

async function computeAvailableTags(): Promise<NewsTagCountDto[]> {
  const rows = await prisma.newsItem.findMany({
    where: { reviewStatus: { not: "dismissed" } },
    select: { tags: true },
  });

  const tally = new Map<string, number>();
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.tags);
      if (!Array.isArray(parsed)) continue;
      for (const raw of parsed) {
        if (typeof raw !== "string") continue;
        const clean = raw.trim().toLowerCase();
        if (!clean) continue;
        tally.set(clean, (tally.get(clean) ?? 0) + 1);
      }
    } catch {
      // Ignore malformed tag JSON
    }
  }

  return Array.from(tally.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, MAX_RETURNED_TAGS);
}

/**
 * Newest-first rows matching `where`. Without a text query this is one SQL page; with one, rows
 * are scanned in batches (search normalizes diacritics, which SQL cannot) until `limit` matches
 * are found or MAX_SEARCH_SCANNED_ROWS rows have been read.
 */
async function collectFeedItems(
  where: Prisma.NewsItemWhereInput,
  limit: number,
  normalizedQuery: string
): Promise<NewsItemDto[]> {
  if (limit <= 0) return [];
  const orderBy: Prisma.NewsItemOrderByWithRelationInput[] = [
    { createdAt: "desc" },
    { id: "desc" },
  ];

  if (!normalizedQuery) {
    const rows = await prisma.newsItem.findMany({ where, orderBy, take: limit });
    return rows.map(serializeNewsItem);
  }

  const matches: NewsItemDto[] = [];
  let cursorId: string | undefined;
  let scanned = 0;
  while (matches.length < limit && scanned < MAX_SEARCH_SCANNED_ROWS) {
    const rows = await prisma.newsItem.findMany({
      where,
      orderBy,
      take: SEARCH_BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      const item = serializeNewsItem(row);
      if (matchesSearchQuery(item, normalizedQuery)) {
        matches.push(item);
        if (matches.length >= limit) break;
      }
    }
    if (rows.length < SEARCH_BATCH_SIZE) break;
    cursorId = rows[rows.length - 1].id;
  }
  return matches;
}

export async function queryNewsFeed(
  params: NewsFeedQueryParams = {}
): Promise<NewsFeedResponseDto> {
  const safeLimit = Math.min(Math.max(1, params.limit ?? 50), 100);
  const tagFilter = params.tag?.trim().toLowerCase() ?? "";
  const normalizedQuery = params.q ? normalizeTitleForCompare(params.q) : "";
  const sortMode = params.sort ?? "latest";

  const where: Prisma.NewsItemWhereInput = {
    ...buildViewWhere(params.view),
    ...(params.origin ? { origin: params.origin } : {}),
    // tags is a JSON array of lowercase strings, so the quoted value matches one whole element
    ...(tagFilter ? { tags: { contains: JSON.stringify(tagFilter) } } : {}),
  };

  const loadItems = async (): Promise<NewsItemDto[]> => {
    if (sortMode !== "curated_first" || params.origin) {
      return collectFeedItems(where, safeLimit, normalizedQuery);
    }
    // Curated (share/manual) items first, then cron items, each newest first
    const curated = await collectFeedItems(
      { ...where, origin: { not: "cron" } },
      safeLimit,
      normalizedQuery
    );
    const cron = await collectFeedItems(
      { ...where, origin: "cron" },
      safeLimit - curated.length,
      normalizedQuery
    );
    return [...curated, ...cron];
  };

  const [items, counts, tags] = await Promise.all([
    loadItems(),
    computeNewsCounts(),
    computeAvailableTags(),
  ]);

  const sliced = items.slice(0, safeLimit);

  const duplicateIds = Array.from(
    new Set(
      sliced
        .map((item) => item.possibleDuplicateOfId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const duplicateTitles: Record<string, string> = {};
  if (duplicateIds.length > 0) {
    const related = await prisma.newsItem.findMany({
      where: { id: { in: duplicateIds } },
      select: { id: true, title: true },
    });
    for (const row of related) {
      duplicateTitles[row.id] = row.title;
    }
  }

  return {
    items: sliced,
    counts,
    tags,
    duplicateTitles,
  };
}

export async function getNewsItemById(id: string): Promise<NewsItemDto | null> {
  const row = await prisma.newsItem.findUnique({ where: { id } });
  return row ? serializeNewsItem(row) : null;
}

export async function updateNewsItem(
  id: string,
  input: UpdateNewsItemRequest
): Promise<NewsItemDto | null> {
  const existing = await prisma.newsItem.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Prisma.NewsItemUpdateInput = {};
  if (input.readState !== undefined) {
    data.readState = input.readState;
  }
  if (input.isSaved !== undefined) {
    data.isSaved = input.isSaved;
  }
  if (input.reviewStatus !== undefined) {
    data.reviewStatus = input.reviewStatus;
  }
  if (input.tags !== undefined) {
    data.tags = JSON.stringify(normalizeTagList(input.tags, 8));
  }
  if (input.personalNote !== undefined) {
    const trimmed = input.personalNote === null ? "" : input.personalNote.trim();
    data.personalNote = trimmed ? trimmed : null;
  }

  const updated = await prisma.newsItem.update({
    where: { id },
    data,
  });
  return serializeNewsItem(updated);
}
