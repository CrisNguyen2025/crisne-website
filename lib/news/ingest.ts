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
  const enabledSources = await prisma.newsSource.findMany({
    where: { enabled: true },
    select: { domain: true },
  });
  const sourceDomains = enabledSources.map((s) => s.domain);

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
  const isPublic = input.origin !== "cron";
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
          // Links the Owner shared or added are public by default; /news only lists them once the summary
          // is ready, and the Owner can turn Public off per post. Cron posts are drafts nobody reviewed yet,
          // so they stay private until the Owner turns Public on. Rows created before this keep their value.
          isPublic,
          publicAt: isPublic ? new Date() : null,
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
  forceDeep = true
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

  notifyNewsWorker(updated.job.id);
  return { item: serializeNewsItem(updated.item), jobId: updated.job.id };
}

async function reclaimExpiredJobLeases(now: Date): Promise<void> {
  const expired = await prisma.ingestJob.findMany({
    where: {
      status: "running",
      lockedUntil: { lt: now },
    },
    select: { id: true, newsItemId: true, attempts: true, maxAttempts: true },
  });

  for (const job of expired) {
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.$transaction(async (tx) => {
      // Guard on attempts too: the job may have been completed or re-claimed since the read above
      const reclaimed = await tx.ingestJob.updateMany({
        where: {
          id: job.id,
          status: "running",
          attempts: job.attempts,
          lockedUntil: { lt: now },
        },
        data: exhausted
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
            },
      });
      if (reclaimed.count !== 1) return;

      await tx.newsItem.update({
        where: { id: job.newsItemId },
        data: exhausted
          ? {
              ingestStatus: "failed",
              extractionError: "Worker lease expired after max attempts",
            }
          : { ingestStatus: "queued" },
      });
    });
  }
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

  let jobData: Prisma.IngestJobUpdateManyMutationInput;
  let itemData: Prisma.NewsItemUpdateInput;
  let slugTitleForAllocation: string | null = null;

  if (payload.outcome === "ready") {
    const existingTags = parseJsonStringArray(job.newsItem.tags);
    const normalizedTags = normalizeTagList([...payload.summary.tags, ...existingTags], 8);
    const normalizedTitle = normalizeTitleForCompare(payload.summary.title);
    const possibleDuplicateOfId = await findPossibleTitleDuplicate({
      excludeId: job.newsItemId,
      title: payload.summary.title,
    });
    const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;

    if (!job.newsItem.slug && isEligibleNewsTitleForSlug(payload.summary.title)) {
      slugTitleForAllocation = payload.summary.title;
    }

    itemData = {
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
    };
    jobData = { status: "done", stage: "done", lockedUntil: null, lastError: null };
  } else if (payload.outcome === "partial") {
    const resolvedTitle = payload.title?.trim() || job.newsItem.title;
    const normalizedTitle = normalizeTitleForCompare(resolvedTitle);
    const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;

    if (!job.newsItem.slug && isEligibleNewsTitleForSlug(resolvedTitle)) {
      slugTitleForAllocation = resolvedTitle;
    }

    itemData = {
      title: resolvedTitle,
      author: payload.author ?? job.newsItem.author,
      thumbnailUrl: payload.thumbnailUrl ?? job.newsItem.thumbnailUrl,
      extractionMethod: payload.extractionMethod,
      extractionError: payload.extractionError,
      ingestStatus: "partial",
      extractedAt: new Date(),
      normalizedTitle: normalizedTitle || job.newsItem.normalizedTitle,
      publishedAt: publishedAt ?? job.newsItem.publishedAt,
    };
    jobData = {
      status: "done",
      stage: "partial",
      lockedUntil: null,
      lastError: payload.extractionError,
    };
  } else if (payload.retryable && job.attempts < job.maxAttempts) {
    const backoffMs = Math.max(1, job.attempts) * 60_000;
    itemData = { ingestStatus: "queued", extractionError: payload.error };
    jobData = {
      status: "pending",
      stage: "retry_scheduled",
      lockedUntil: null,
      nextRunAt: new Date(Date.now() + backoffMs),
      lastError: payload.error,
    };
  } else {
    itemData = { ingestStatus: "failed", extractionError: payload.error };
    jobData = {
      status: "failed",
      stage: "failed",
      lockedUntil: null,
      lastError: payload.error,
    };
  }

  const maxAttempts = slugTitleForAllocation ? 3 : 1;
  for (let attemptIdx = 0; attemptIdx < maxAttempts; attemptIdx++) {
    let nextSlug: string | undefined;
    if (slugTitleForAllocation) {
      nextSlug =
        attemptIdx === maxAttempts - 1
          ? `${buildBaseNewsSlug(slugTitleForAllocation, job.newsItem.domain)}-${job.newsItemId.slice(-6)}`
          : await allocateUniqueNewsSlug(prisma, slugTitleForAllocation, {
              fallbackDomain: job.newsItem.domain,
              excludeId: job.newsItemId,
            });
    }

    try {
      const updatedItem = await prisma.$transaction(async (tx) => {
        const claimed = await tx.ingestJob.updateMany({
          where: { id: job.id, status: "running", attempts: job.attempts },
          data: jobData,
        });
        if (claimed.count !== 1) {
          throw new IngestJobConflictError();
        }
        return tx.newsItem.update({
          where: { id: job.newsItemId },
          data: nextSlug ? { ...itemData, slug: nextSlug } : itemData,
        });
      });

      return serializeNewsItem(updatedItem);
    } catch (error) {
      if (
        slugTitleForAllocation &&
        attemptIdx < maxAttempts - 1 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
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
