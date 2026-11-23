import type { NewsItem, NewsSource } from "@prisma/client";
import { z } from "zod";

export const NewsOriginSchema = z.enum(["cron", "share", "manual"]);
export type NewsOrigin = z.infer<typeof NewsOriginSchema>;

export const NewsPlatformSchema = z.enum(["youtube", "tiktok", "article", "rss"]);
export type NewsPlatform = z.infer<typeof NewsPlatformSchema>;

export const IngestStatusSchema = z.enum(["queued", "processing", "ready", "partial", "failed"]);
export type IngestStatus = z.infer<typeof IngestStatusSchema>;

export const ReviewStatusSchema = z.enum(["draft", "published", "dismissed"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReadStateSchema = z.enum(["unread", "read"]);
export type ReadState = z.infer<typeof ReadStateSchema>;

export const NewsContentTypeTagSchema = z.enum(["tip", "tutorial", "tin-moi", "quan-diem"]);
export type NewsContentTypeTag = z.infer<typeof NewsContentTypeTagSchema>;

export const NewsFeedViewSchema = z.enum([
  "inbox",
  "saved",
  "dismissed",
  "done",
  "unread",
  "all",
  "draft",
  "queue",
]);
export type NewsFeedView = z.infer<typeof NewsFeedViewSchema>;

export const NewsFeedSortSchema = z.enum(["latest", "curated_first"]);
export type NewsFeedSort = z.infer<typeof NewsFeedSortSchema>;

export const ExtractionMethodSchema = z.enum([
  "description",
  "article",
  "captions",
  "whisper",
  "vision",
  "metadata_only",
]);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

const MAX_URL_LENGTH = 2048;

const HttpUrlSchema = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "URL must use http or https without credentials");

const OptionalDateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date string")
  .nullable()
  .optional();

export const NewsSummaryOutputSchema = z.object({
  title: z.string().trim().min(3).max(180),
  tldr: z.string().trim().min(10).max(400),
  // Keep in sync with MAX_TAKEAWAYS in news-ingest-worker/news_worker/schemas.py
  takeaways: z.array(z.string().trim().min(5).max(240)).min(1).max(10),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(5),
  language: z.enum(["vi", "en", "other"]),
});
export type NewsSummaryOutput = z.infer<typeof NewsSummaryOutputSchema>;

export const IngestRequestSchema = z.object({
  url: z.string().trim().max(MAX_URL_LENGTH).url(),
  origin: NewsOriginSchema.default("manual"),
  title: z.string().trim().min(1).max(240).optional(),
  sourceId: z.string().trim().min(1).optional(),
  forceDeep: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(5).optional(),
  publishedAt: OptionalDateStringSchema,
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const CreateNewsSourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  feedUrl: HttpUrlSchema,
  domain: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional().default(true),
  defaultTags: z.array(z.string().trim().min(1).max(32)).max(5).optional().default([]),
});
export type CreateNewsSourceRequest = z.infer<typeof CreateNewsSourceSchema>;

export const UpdateNewsSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    feedUrl: HttpUrlSchema.optional(),
    domain: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    defaultTags: z.array(z.string().trim().min(1).max(32)).max(5).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateNewsSourceRequest = z.infer<typeof UpdateNewsSourceSchema>;

export const CronSyncRequestSchema = z.object({
  sourceId: z.string().trim().min(1).optional(),
  maxItemsPerSource: z.number().int().min(1).max(30).optional(),
});
export type CronSyncRequest = z.infer<typeof CronSyncRequestSchema>;

export const ReingestRequestSchema = z.object({
  forceDeep: z.boolean().optional().default(true),
});
export type ReingestRequest = z.infer<typeof ReingestRequestSchema>;

export const UpdateNewsItemSchema = z
  .object({
    readState: ReadStateSchema.optional(),
    isSaved: z.boolean().optional(),
    reviewStatus: ReviewStatusSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
    personalNote: z.string().max(4000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateNewsItemRequest = z.infer<typeof UpdateNewsItemSchema>;

export const MarkReadRequestSchema = z.object({
  view: NewsFeedViewSchema.optional(),
  origin: NewsOriginSchema.optional(),
  tag: z.string().trim().min(1).max(32).optional(),
  contentType: NewsContentTypeTagSchema.optional(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;

// Attempt number from the claim; optional so older workers keep working
const JobAttemptSchema = z.number().int().min(1).optional();

export const JobCompleteRequestSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("ready"),
    attempt: JobAttemptSchema,
    summary: NewsSummaryOutputSchema,
    extractionMethod: ExtractionMethodSchema,
    author: z.string().trim().max(120).nullable().optional(),
    thumbnailUrl: HttpUrlSchema.nullable().optional(),
    publishedAt: OptionalDateStringSchema,
  }),
  z.object({
    outcome: z.literal("partial"),
    attempt: JobAttemptSchema,
    extractionError: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(240).nullable().optional(),
    author: z.string().trim().max(120).nullable().optional(),
    thumbnailUrl: HttpUrlSchema.nullable().optional(),
    publishedAt: OptionalDateStringSchema,
    extractionMethod: ExtractionMethodSchema.optional().default("metadata_only"),
  }),
  z.object({
    outcome: z.literal("failed"),
    attempt: JobAttemptSchema,
    error: z.string().trim().min(1).max(500),
    retryable: z.boolean().optional().default(true),
  }),
]);
export type JobCompleteRequest = z.infer<typeof JobCompleteRequestSchema>;

export interface NewsItemDto {
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  platform: NewsPlatform;
  origin: NewsOrigin;
  sourceId: string | null;
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
  tldr: string | null;
  takeaways: string[];
  tags: string[];
  personalNote: string | null;
  ingestStatus: IngestStatus;
  reviewStatus: ReviewStatus;
  readState: ReadState;
  isSaved: boolean;
  extractionMethod: ExtractionMethod | null;
  extractionError: string | null;
  possibleDuplicateOfId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsCountsDto {
  total: number;
  queued: number;
  processing: number;
  ready: number;
  partial: number;
  failed: number;
  draft: number;
  unread: number;
  saved: number;
  dismissed: number;
  queue: number;
  inbox: number;
  done: number;
}

export interface NewsTagCountDto {
  tag: string;
  count: number;
}

export interface NewsFeedQueryParams {
  view?: NewsFeedView;
  origin?: NewsOrigin;
  tag?: string;
  contentType?: NewsContentTypeTag;
  readState?: ReadState;
  q?: string;
  sort?: NewsFeedSort;
  limit?: number;
}

export interface NewsFeedResponseDto {
  items: NewsItemDto[];
  counts: NewsCountsDto;
  tags: NewsTagCountDto[];
  duplicateTitles: Record<string, string>;
  hasMore?: boolean;
}

export interface NewsWorkerHealthDto {
  configured: boolean;
  status: "ok" | "offline" | "unconfigured";
}

export interface NewsSourceDto {
  id: string;
  name: string;
  feedUrl: string;
  domain: string;
  enabled: boolean;
  defaultTags: string[];
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CronSyncSourceResult {
  sourceId: string;
  sourceName: string;
  queued: number;
  duplicates: number;
  skippedErrors: number;
  notModified?: boolean;
  error: string | null;
}

export interface CronSyncSummary {
  sourcesProcessed: number;
  totalQueued: number;
  totalDuplicates: number;
  results: CronSyncSourceResult[];
}

export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function normalizeTagList(tags: string[], maxTags = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim().toLowerCase().slice(0, 32);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= maxTags) break;
  }
  return result;
}

export function serializeNewsItem(row: NewsItem): NewsItemDto {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    domain: row.domain,
    platform: (NewsPlatformSchema.safeParse(row.platform).data ?? "article") as NewsPlatform,
    origin: (NewsOriginSchema.safeParse(row.origin).data ?? "manual") as NewsOrigin,
    sourceId: row.sourceId,
    title: row.title,
    author: row.author,
    thumbnailUrl: row.thumbnailUrl,
    tldr: row.tldr,
    takeaways: parseJsonStringArray(row.takeaways),
    tags: parseJsonStringArray(row.tags),
    personalNote: row.personalNote,
    ingestStatus: (IngestStatusSchema.safeParse(row.ingestStatus).data ?? "queued") as IngestStatus,
    reviewStatus: (ReviewStatusSchema.safeParse(row.reviewStatus).data ?? "published") as ReviewStatus,
    readState: (ReadStateSchema.safeParse(row.readState).data ?? "unread") as ReadState,
    isSaved: row.isSaved,
    extractionMethod: ExtractionMethodSchema.safeParse(row.extractionMethod).data ?? null,
    extractionError: row.extractionError,
    possibleDuplicateOfId: row.possibleDuplicateOfId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeNewsSource(row: NewsSource): NewsSourceDto {
  return {
    id: row.id,
    name: row.name,
    feedUrl: row.feedUrl,
    domain: row.domain,
    enabled: row.enabled,
    defaultTags: parseJsonStringArray(row.defaultTags),
    lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
