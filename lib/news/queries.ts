import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitleForCompare } from "./dedupe";
import {
  type MarkReadRequest,
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
const MAX_FEED_LIMIT = 300;
const MAX_ITEM_TAGS = 8;

function buildViewWhere(view?: NewsFeedView): Prisma.NewsItemWhereInput {
  switch (view) {
    case "inbox":
      return { reviewStatus: { not: "dismissed" }, isSaved: false };
    case "saved":
      return { reviewStatus: { not: "dismissed" }, isSaved: true };
    case "dismissed":
      return { reviewStatus: "dismissed" };
    case "done":
      return { OR: [{ isSaved: true }, { reviewStatus: "dismissed" }] };
    case "unread":
      return { reviewStatus: "published", readState: "unread" };
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

function buildFeedFilterWhere(
  params: Pick<NewsFeedQueryParams, "view" | "origin" | "tag" | "contentType" | "readState">,
  options: { includeTags?: boolean } = {}
): Prisma.NewsItemWhereInput {
  const andConditions: Prisma.NewsItemWhereInput[] = [];
  if (options.includeTags !== false) {
    const tagFilter = params.tag?.trim().toLowerCase() ?? "";
    if (tagFilter) {
      andConditions.push({ tags: { contains: JSON.stringify(tagFilter) } });
    }
    if (params.contentType) {
      andConditions.push({ tags: { contains: JSON.stringify(params.contentType) } });
    }
  }

  return {
    ...buildViewWhere(params.view),
    ...(params.origin ? { origin: params.origin } : {}),
    ...(params.readState ? { readState: params.readState } : {}),
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
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
  const groups = await prisma.newsItem.groupBy({
    by: ["reviewStatus", "ingestStatus", "readState", "isSaved"],
    _count: { _all: true },
  });

  const counts: NewsCountsDto = {
    total: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    partial: 0,
    failed: 0,
    draft: 0,
    unread: 0,
    saved: 0,
    dismissed: 0,
    queue: 0,
    inbox: 0,
    done: 0,
  };

  for (const row of groups) {
    const n = row._count._all;
    const isDismissed = row.reviewStatus === "dismissed";
    counts.total += n;

    if (isDismissed) {
      counts.dismissed += n;
    } else {
      if (row.ingestStatus === "queued") counts.queued += n;
      else if (row.ingestStatus === "processing") counts.processing += n;
      else if (row.ingestStatus === "ready") counts.ready += n;
      else if (row.ingestStatus === "partial") counts.partial += n;
      else if (row.ingestStatus === "failed") counts.failed += n;

      if (
        row.ingestStatus === "queued" ||
        row.ingestStatus === "processing" ||
        row.ingestStatus === "failed"
      ) {
        counts.queue += n;
      }

      if (row.isSaved) {
        counts.saved += n;
      } else {
        counts.inbox += n;
      }
    }

    if (row.reviewStatus === "draft") {
      counts.draft += n;
    }
    if (row.reviewStatus === "published" && row.readState === "unread") {
      counts.unread += n;
    }
    if (row.isSaved || isDismissed) {
      counts.done += n;
    }
  }

  return counts;
}

async function computeAvailableTags(where: Prisma.NewsItemWhereInput): Promise<NewsTagCountDto[]> {
  const rows = await prisma.newsItem.findMany({
    where,
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
  const safeLimit = Math.min(Math.max(1, params.limit ?? 50), MAX_FEED_LIMIT);
  const normalizedQuery = params.q ? normalizeTitleForCompare(params.q) : "";
  const sortMode = params.sort ?? "latest";

  const where = buildFeedFilterWhere(params);
  const tagScopeWhere = buildFeedFilterWhere(params, { includeTags: false });
  const probeLimit = safeLimit + 1;

  const loadItems = async (): Promise<NewsItemDto[]> => {
    if (sortMode !== "curated_first" || params.origin) {
      return collectFeedItems(where, probeLimit, normalizedQuery);
    }
    // Curated (share/manual) items first, then cron items, each newest first
    const curated = await collectFeedItems(
      { ...where, origin: { not: "cron" } },
      probeLimit,
      normalizedQuery
    );
    const cron = await collectFeedItems(
      { ...where, origin: "cron" },
      probeLimit - curated.length,
      normalizedQuery
    );
    return [...curated, ...cron];
  };

  const [items, counts, tags] = await Promise.all([
    loadItems(),
    computeNewsCounts(),
    computeAvailableTags(tagScopeWhere),
  ]);

  const hasMore = items.length > safeLimit;
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
    hasMore,
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
    data.tags = JSON.stringify(normalizeTagList(input.tags, MAX_ITEM_TAGS));
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

export async function deleteNewsItem(id: string): Promise<boolean> {
  const existing = await prisma.newsItem.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.newsItem.delete({ where: { id } });
  return true;
}

export async function markNewsItemsAsRead(params: MarkReadRequest = {}): Promise<number> {
  const result = await prisma.newsItem.updateMany({
    where: {
      ...buildFeedFilterWhere(params),
      readState: "unread",
    },
    data: { readState: "read" },
  });
  return result.count;
}
