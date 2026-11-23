import type { EnqueueNewsResult } from "@/lib/news/ingest";
import type { IntegrateRequest, IntegrateResponse } from "@/lib/provenance/schemas";
import type {
  CreateNewsSourceRequest,
  CronSyncSummary,
  MarkReadRequest,
  NewsFeedQueryParams,
  NewsFeedResponseDto,
  NewsItemDto,
  NewsOrigin,
  NewsSourceDto,
  NewsWorkerHealthDto,
  UpdateNewsItemRequest,
  UpdateNewsSourceRequest,
} from "@/lib/news/schemas";

export interface IngestApiError {
  error: string;
  code?: string;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<IngestApiError> {
  try {
    const data = (await res.json()) as Partial<IngestApiError>;
    return {
      error: typeof data.error === "string" && data.error ? data.error : fallback,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  } catch {
    return { error: fallback };
  }
}

export async function fetchNewsFeed(
  params: NewsFeedQueryParams = {}
): Promise<NewsFeedResponseDto> {
  const qs = new URLSearchParams();
  if (params.view) qs.set("view", params.view);
  if (params.origin) qs.set("origin", params.origin);
  if (params.tag) qs.set("tag", params.tag);
  if (params.contentType) qs.set("contentType", params.contentType);
  if (params.readState) qs.set("readState", params.readState);
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  qs.set("limit", String(params.limit ?? 50));

  const res = await fetch(`/api/news?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không tải được danh sách tin.");
    throw new Error(err.error);
  }
  return (await res.json()) as NewsFeedResponseDto;
}

export async function fetchNewsList(limit = 50): Promise<NewsFeedResponseDto> {
  return fetchNewsFeed({ limit });
}

export async function ingestNewsUrl(payload: {
  url: string;
  origin?: NewsOrigin;
  forceDeep?: boolean;
}): Promise<EnqueueNewsResult> {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: payload.url,
      origin: payload.origin ?? "manual",
      forceDeep: payload.forceDeep ?? false,
    }),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể đưa URL vào hàng đợi.");
    const error = new Error(err.error) as Error & { code?: string };
    error.code = err.code;
    throw error;
  }
  return (await res.json()) as EnqueueNewsResult;
}

export async function updateNewsItem(
  id: string,
  patch: UpdateNewsItemRequest
): Promise<{ item: NewsItemDto }> {
  const res = await fetch(`/api/news/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể cập nhật bài tin.");
    throw new Error(err.error);
  }
  return (await res.json()) as { item: NewsItemDto };
}

export type AddToLessonResult =
  | ({ kind: "created" } & IntegrateResponse)
  | { kind: "duplicate"; existing: { id: string; title: string } }
  | { kind: "already_integrated" }
  | { kind: "error"; message: string };

/** Put the chosen statements of a News Item into a new or existing Lesson, with Provenance (ADR-0017). */
export async function addNewsItemToLesson(id: string, payload: IntegrateRequest): Promise<AddToLessonResult> {
  const res = await fetch(`/api/news/${encodeURIComponent(id)}/integrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 201) {
    return { kind: "created", ...((await res.json()) as IntegrateResponse) };
  }
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
      existing?: { id: string; title: string };
    };
    if (data.code === "DUPLICATE" && data.existing) return { kind: "duplicate", existing: data.existing };
    if (data.code === "ALREADY_INTEGRATED") return { kind: "already_integrated" };
    return { kind: "error", message: data.error || "Bài tin chưa sẵn sàng để đưa vào Lesson." };
  }
  const err = await parseErrorMessage(res, "Không thể đưa bài tin vào Lesson.");
  return { kind: "error", message: err.error };
}

export async function reingestNewsItem(
  id: string,
  forceDeep = true
): Promise<{ item: NewsItemDto; jobId: string }> {
  const res = await fetch(`/api/news/${encodeURIComponent(id)}/reingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forceDeep }),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể xếp hàng phân tích lại.");
    throw new Error(err.error);
  }
  return (await res.json()) as { item: NewsItemDto; jobId: string };
}

export async function fetchNewsSources(): Promise<{ sources: NewsSourceDto[] }> {
  const res = await fetch("/api/news/sources", { cache: "no-store" });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không tải được danh sách nguồn RSS.");
    throw new Error(err.error);
  }
  return (await res.json()) as { sources: NewsSourceDto[] };
}

export async function createNewsSource(
  payload: CreateNewsSourceRequest
): Promise<{ source: NewsSourceDto }> {
  const res = await fetch("/api/news/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể tạo nguồn RSS.");
    throw new Error(err.error);
  }
  return (await res.json()) as { source: NewsSourceDto };
}

export async function updateNewsSource(
  id: string,
  patch: UpdateNewsSourceRequest
): Promise<{ source: NewsSourceDto }> {
  const res = await fetch(`/api/news/sources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể cập nhật nguồn RSS.");
    throw new Error(err.error);
  }
  return (await res.json()) as { source: NewsSourceDto };
}

export async function deleteNewsSource(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/news/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể xoá nguồn RSS.");
    throw new Error(err.error);
  }
  return (await res.json()) as { deleted: boolean };
}

export async function deleteNewsItem(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/news/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể xoá bài tin.");
    throw new Error(err.error);
  }
  return (await res.json()) as { deleted: boolean };
}

export async function markNewsItemsAsRead(
  payload: MarkReadRequest = {}
): Promise<{ updated: number }> {
  const res = await fetch("/api/news/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể đánh dấu đã đọc.");
    throw new Error(err.error);
  }
  return (await res.json()) as { updated: number };
}

export async function fetchNewsWorkerHealth(): Promise<NewsWorkerHealthDto> {
  const res = await fetch("/api/news/worker-health", { cache: "no-store" });
  if (!res.ok) {
    return { configured: true, status: "offline" };
  }
  return (await res.json()) as NewsWorkerHealthDto;
}

export async function triggerNewsCronSync(payload?: {
  sourceId?: string;
  maxItemsPerSource?: number;
}): Promise<CronSyncSummary> {
  const res = await fetch("/api/news/cron", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const err = await parseErrorMessage(res, "Không thể chạy đồng bộ RSS.");
    throw new Error(err.error);
  }
  return (await res.json()) as CronSyncSummary;
}
