import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findPossibleTitleDuplicate, normalizeTitleForCompare } from "./dedupe";
import { queryNewsFeed } from "./queries";
import { allocateUniqueNewsSlug, buildBaseNewsSlug, isEligibleNewsTitleForSlug } from "./slug";
import {
  type IngestRequest,
  type JobCompleteRequest,
  type NewsCountsDto,
  type NewsItemDto,
  normalizeTagList,
  parseJsonStringArray,
  serializeNewsItem,
} from "./schemas";
import { type ResolveUrlOptions, resolveAndValidateUrl } from "./url-guard";
import { notifyNewsWorker } from "./worker-trigger";

const JOB_LEASE_DURATION_MS = 10 * 60_000;

export interface EnqueueNewsOptions extends ResolveUrlOptions {
  skipWake?: boolean;
  preloadedSourceDomains?: string[];
}

export interface EnqueueNewsResult {
  status: "queued" | "duplicate";
  item: NewsItemDto;
  jobId?: string;
}

export interface ClaimedJobDto {
  jobId: string;
  newsItemId: string;
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  platform: string;
  origin: string;
  forceDeep: boolean;
  attempts: number;
}

export async function enqueueNewsUrl(
  input: IngestRequest,
  urlOptions: EnqueueNewsOptions = {}
): Promise<EnqueueNewsResult> {
  const sourceDomains =
    urlOptions.preloadedSourceDomains ??
    (
      await prisma.newsSource.findMany({
        where: { enabled: true },
        select: { domain: true },
      })
    ).map((s) => s.domain);

  const validated = await resolveAndValidateUrl(input.url, {
    ...urlOptions,
    extraAllowedDomains: [...sourceDomains, ...(urlOptions.extraAllowedDomains ?? [])],
  });

  const existing = await prisma.newsItem.findUnique({
    where: { canonicalUrl: validated.canonicalUrl },
  });
  if (existing) {
    return { status: "duplicate", item: serializeNewsItem(existing) };
  }

  const reviewStatus = input.origin === "cron" ? "draft" : "published";
  const initialTags = normalizeTagList(input.tags ?? [], 5);
  const parsedPublishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  const publishedAt =
    parsedPublishedAt && !Number.isNaN(parsedPublishedAt.getTime()) ? parsedPublishedAt : null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.newsItem.create({
        data: {
          sourceUrl: validated.sourceUrl,
          canonicalUrl: validated.canonicalUrl,
          domain: validated.domain,
          platform: validated.platform,
          origin: input.origin,
          sourceId: input.sourceId ?? null,
          title: input.title ?? validated.canonicalUrl,
          tags: JSON.stringify(initialTags),
          publishedAt,
          ingestStatus: "queued",
          reviewStatus,
          readState: "unread",
          isSaved: false,
        },
      });
      const job = await tx.ingestJob.create({
        data: {
          newsItemId: item.id,
          status: "pending",
          forceDeep: Boolean(input.forceDeep),
        },
      });
      return { item, job };
    });

    if (!urlOptions.skipWake) {
      notifyNewsWorker(created.job.id);
    }
    return {
      status: "queued",
      item: serializeNewsItem(created.item),
      jobId: created.job.id,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.newsItem.findUnique({
        where: { canonicalUrl: validated.canonicalUrl },
      });
      if (raced) {
        return { status: "duplicate", item: serializeNewsItem(raced) };
      }
    }
    throw error;
  }
}

export async function reingestNewsItem(
  newsItemId: string,
  forceDeep = true,
  options: { skipWake?: boolean } = {}
): Promise<{ item: NewsItemDto; jobId: string } | null> {
  const existing = await prisma.newsItem.findUnique({
    where: { id: newsItemId },
    select: { id: true },
  });
  if (!existing) return null;

  const updated = await prisma.$transaction(async (tx) => {
    // Supersede any job still pending/running so only the new job can complete the item
    await tx.ingestJob.updateMany({
      where: { newsItemId, status: { in: ["pending", "running"] } },
      data: {
        status: "failed",
        stage: "superseded",
        lockedUntil: null,
        lastError: "Superseded by reingest",
      },
    });
    const item = await tx.newsItem.update({
      where: { id: newsItemId },
      data: {
        ingestStatus: "queued",
        extractionError: null,
      },
    });
    const job = await tx.ingestJob.create({
      data: {
        newsItemId: item.id,
        status: "pending",
        forceDeep,
      },
    });
    return { item, job };
  });

  if (!options.skipWake) {
    notifyNewsWorker(updated.job.id);
  }
  return { item: serializeNewsItem(updated.item), jobId: updated.job.id };
}

export async function reingestBlockedNewsItems(
  options: { limit?: number; skipWake?: boolean } = {}
): Promise<{ count: number; itemIds: string[] }> {
  const safeLimit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const candidates = await prisma.newsItem.findMany({
    where: {
      ingestStatus: "partial",
      OR: [
        { extractionError: { contains: "[IP_BLOCKED]" } },
        { extractionError: { contains: "Your IP address is blocked" } },
      ],
      jobs: {
        none: {
          status: { in: ["pending", "running"] },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: { id: true },
  });

  const itemIds: string[] = [];
  const skipWake = options.skipWake ?? true;
  for (const candidate of candidates) {
    const res = await reingestNewsItem(candidate.id, true, { skipWake });
    if (res) {
      itemIds.push(candidate.id);
    }
  }
  return { count: itemIds.length, itemIds };
}

interface ExpiredLeaseRow {
  id: string;
  newsItemId: string;
  attempts: number;
}

async function reclaimLeaseBucket(
  tx: Prisma.TransactionClient,
  bucket: ExpiredLeaseRow[],
  now: Date,
  exhausted: boolean
): Promise<void> {
  if (bucket.length === 0) return;
  const attemptGuards = bucket.map((job) => ({ id: job.id, attempts: job.attempts }));
  const jobData = exhausted
    ? {
        status: "failed",
        lockedUntil: null,
        lastError: "Worker lease expired after max attempts",
      }
    : {
        status: "pending",
        lockedUntil: null,
        nextRunAt: now,
        lastError: "Previous worker lease expired; re-queued",
      };

  const reclaimed = await tx.ingestJob.updateMany({
    where: {
      status: "running",
      lockedUntil: { lt: now },
      OR: attemptGuards,
    },
    data: jobData,
  });
  if (reclaimed.count === 0) return;

  let newsItemIds: string[];
  if (reclaimed.count === bucket.length) {
    newsItemIds = Array.from(new Set(bucket.map((job) => job.newsItemId)));
  } else {
    const matched = await tx.ingestJob.findMany({
      where: exhausted
        ? {
            status: "failed",
            lockedUntil: null,
            lastError: "Worker lease expired after max attempts",
            OR: attemptGuards,
          }
        : {
            status: "pending",
            lockedUntil: null,
            nextRunAt: now,
            OR: attemptGuards,
          },
      select: { newsItemId: true },
    });
    newsItemIds = Array.from(new Set(matched.map((job) => job.newsItemId)));
  }
  if (newsItemIds.length === 0) return;

  await tx.newsItem.updateMany({
    where: { id: { in: newsItemIds } },
    data: exhausted
      ? {
          ingestStatus: "failed",
          extractionError: "Worker lease expired after max attempts",
        }
      : { ingestStatus: "queued" },
  });
}

async function reclaimExpiredJobLeases(now: Date): Promise<void> {
  const expired = await prisma.ingestJob.findMany({
    where: {
      status: "running",
      lockedUntil: { lt: now },
    },
    select: { id: true, newsItemId: true, attempts: true, maxAttempts: true },
  });
  if (expired.length === 0) return;

  const exhausted = expired.filter((job) => job.attempts >= job.maxAttempts);
  const retryable = expired.filter((job) => job.attempts < job.maxAttempts);

  await prisma.$transaction(async (tx) => {
    await reclaimLeaseBucket(tx, exhausted, now, true);
    await reclaimLeaseBucket(tx, retryable, now, false);
  });
}

export async function claimNextIngestJob(): Promise<ClaimedJobDto | null> {
  const now = new Date();
  await reclaimExpiredJobLeases(now);

  const candidate = await prisma.ingestJob.findFirst({
    where: {
      status: "pending",
      nextRunAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    include: {
      newsItem: true,
    },
  });

  if (!candidate) return null;

  const leaseUntil = new Date(now.getTime() + JOB_LEASE_DURATION_MS);
  const didClaim = await prisma.$transaction(async (tx) => {
    const claimed = await tx.ingestJob.updateMany({
      where: {
        id: candidate.id,
        status: "pending",
      },
      data: {
        status: "running",
        stage: "extracting",
        attempts: { increment: 1 },
        lockedUntil: leaseUntil,
      },
    });
    if (claimed.count === 0) return false;

    await tx.newsItem.update({
      where: { id: candidate.newsItemId },
      data: { ingestStatus: "processing" },
    });
    return true;
  });

  if (!didClaim) return null;

  return {
    jobId: candidate.id,
    newsItemId: candidate.newsItemId,
    sourceUrl: candidate.newsItem.sourceUrl,
    canonicalUrl: candidate.newsItem.canonicalUrl,
    domain: candidate.newsItem.domain,
    platform: candidate.newsItem.platform,
    origin: candidate.newsItem.origin,
    forceDeep: candidate.forceDeep,
    attempts: candidate.attempts + 1,
  };
}

export class IngestJobConflictError extends Error {
  readonly status = 409;

  constructor(message = "Ingest job is no longer running for this worker attempt") {
    super(message);
    this.name = "IngestJobConflictError";
  }
}

interface IngestOutcomeBuild {
  jobData: Prisma.IngestJobUpdateManyMutationInput;
  itemData: Prisma.NewsItemUpdateInput;
  slugTitleForAllocation: string | null;
}

async function buildIngestOutcomeUpdate(
  job: { id: string; attempts: number; maxAttempts: number; newsItemId: string; newsItem: { tags: string; title: string; author: string | null; thumbnailUrl: string | null; slug: string | null; normalizedTitle: string | null; publishedAt: Date | null } },
  payload: JobCompleteRequest
): Promise<IngestOutcomeBuild> {
  if (payload.outcome === "ready") {
    const existingTags = parseJsonStringArray(job.newsItem.tags);
    const normalizedTags = normalizeTagList([...payload.summary.tags, ...existingTags], 8);
    const normalizedTitle = normalizeTitleForCompare(payload.summary.title);
    const possibleDuplicateOfId = await findPossibleTitleDuplicate({
      excludeId: job.newsItemId,
      title: payload.summary.title,
    });
    const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;
    const slugTitleForAllocation =
      !job.newsItem.slug && isEligibleNewsTitleForSlug(payload.summary.title) ? payload.summary.title : null;

    return {
      slugTitleForAllocation,
      itemData: {
        title: payload.summary.title,
        author: payload.author ?? job.newsItem.author,
        thumbnailUrl: payload.thumbnailUrl ?? job.newsItem.thumbnailUrl,
        tldr: payload.summary.tldr,
        takeaways: JSON.stringify(payload.summary.takeaways),
        tags: JSON.stringify(normalizedTags),
        extractionMethod: payload.extractionMethod,
        extractionError: null,
        ingestStatus: "ready",
        extractedAt: new Date(),
        normalizedTitle,
        possibleDuplicateOfId,
        publishedAt: publishedAt ?? job.newsItem.publishedAt,
      },
      jobData: { status: "done", stage: "done", lockedUntil: null, lastError: null },
    };
  }

  if (payload.outcome === "partial") {
    const resolvedTitle = payload.title?.trim() || job.newsItem.title;
    const normalizedTitle = normalizeTitleForCompare(resolvedTitle);
    const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;
    const slugTitleForAllocation =
      !job.newsItem.slug && isEligibleNewsTitleForSlug(resolvedTitle) ? resolvedTitle : null;

    return {
      slugTitleForAllocation,
      itemData: {
        title: resolvedTitle,
        author: payload.author ?? job.newsItem.author,
        thumbnailUrl: payload.thumbnailUrl ?? job.newsItem.thumbnailUrl,
        extractionMethod: payload.extractionMethod,
        extractionError: payload.extractionError,
        ingestStatus: "partial",
        extractedAt: new Date(),
        normalizedTitle: normalizedTitle || job.newsItem.normalizedTitle,
        publishedAt: publishedAt ?? job.newsItem.publishedAt,
      },
      jobData: { status: "done", stage: "partial", lockedUntil: null, lastError: payload.extractionError },
    };
  }

  if (payload.retryable && job.attempts < job.maxAttempts) {
    const backoffMs = Math.max(1, job.attempts) * 60_000;
    return {
      slugTitleForAllocation: null,
      itemData: { ingestStatus: "queued", extractionError: payload.error },
      jobData: {
        status: "pending",
        stage: "retry_scheduled",
        lockedUntil: null,
        nextRunAt: new Date(Date.now() + backoffMs),
        lastError: payload.error,
      },
    };
  }

  return {
    slugTitleForAllocation: null,
    itemData: { ingestStatus: "failed", extractionError: payload.error },
    jobData: { status: "failed", stage: "failed", lockedUntil: null, lastError: payload.error },
  };
}

async function commitIngestOutcomeAttempt(
  job: { id: string; attempts: number; newsItemId: string; newsItem: { domain: string } },
  outcome: IngestOutcomeBuild,
  attemptIdx: number,
  maxAttempts: number
): Promise<NewsItemDto> {
  let nextSlug: string | undefined;
  if (outcome.slugTitleForAllocation) {
    nextSlug =
      attemptIdx === maxAttempts - 1
        ? `${buildBaseNewsSlug(outcome.slugTitleForAllocation, job.newsItem.domain)}-${job.newsItemId.slice(-6)}`
        : await allocateUniqueNewsSlug(prisma, outcome.slugTitleForAllocation, {
            fallbackDomain: job.newsItem.domain,
            excludeId: job.newsItemId,
          });
  }

  const updatedItem = await prisma.$transaction(async (tx) => {
    const claimed = await tx.ingestJob.updateMany({
      where: { id: job.id, status: "running", attempts: job.attempts },
      data: outcome.jobData,
    });
    if (claimed.count !== 1) {
      throw new IngestJobConflictError();
    }
    return tx.newsItem.update({
      where: { id: job.newsItemId },
      data: nextSlug ? { ...outcome.itemData, slug: nextSlug } : outcome.itemData,
    });
  });

  return serializeNewsItem(updatedItem);
}

/**
 * Applies a worker's result to a job it holds. Throws `IngestJobConflictError` when the job is no
 * longer `running` or the reported attempt is stale (lease reclaimed, superseded by reingest, or a
 * duplicate report), so a late report can never overwrite a newer outcome.
 */
export async function completeIngestJob(
  jobId: string,
  payload: JobCompleteRequest
): Promise<NewsItemDto | null> {
  const job = await prisma.ingestJob.findUnique({
    where: { id: jobId },
    include: { newsItem: true },
  });
  if (!job) return null;

  if (
    job.status !== "running" ||
    (payload.attempt !== undefined && payload.attempt !== job.attempts)
  ) {
    throw new IngestJobConflictError();
  }

  const outcome = await buildIngestOutcomeUpdate(job, payload);
  const maxAttempts = outcome.slugTitleForAllocation ? 3 : 1;

  for (let attemptIdx = 0; attemptIdx < maxAttempts; attemptIdx++) {
    try {
      return await commitIngestOutcomeAttempt(job, outcome, attemptIdx, maxAttempts);
    } catch (error) {
      const canRetrySlugCollision =
        Boolean(outcome.slugTitleForAllocation) &&
        attemptIdx < maxAttempts - 1 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!canRetrySlugCollision) throw error;
    }
  }

  throw new Error("Failed to allocate unique NewsItem slug");
}

export async function listNewsItemsWithCounts(limit = 50): Promise<{
  items: NewsItemDto[];
  counts: NewsCountsDto;
}> {
  const { items, counts } = await queryNewsFeed({ limit });
  return { items, counts };
}
