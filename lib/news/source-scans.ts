import { prisma } from "@/lib/prisma";
import {
  type CronSyncSourceResult,
  type NewsSourceScanDto,
  type NewsSourceScanTrigger,
  serializeNewsSourceScan,
} from "./schemas";

/** Scan rows kept per NewsSource; older rows are deleted after each sync. */
export const NEWS_SOURCE_SCAN_HISTORY_LIMIT = 20;

/** Stores one history row per synced source, then trims each source to the latest rows. */
export async function recordNewsSourceScans(
  results: CronSyncSourceResult[],
  trigger: NewsSourceScanTrigger
): Promise<void> {
  if (results.length === 0) return;

  await prisma.newsSourceScan.createMany({
    data: results.map((result) => ({
      sourceId: result.sourceId,
      trigger,
      queued: result.queued,
      duplicates: result.duplicates,
      skippedErrors: result.skippedErrors,
      notModified: Boolean(result.notModified),
      error: result.error,
    })),
  });

  const sourceIds = Array.from(new Set(results.map((result) => result.sourceId)));
  if (sourceIds.length === 0) return;

  const rows = await prisma.newsSourceScan.findMany({
    where: { sourceId: { in: sourceIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceId: true },
  });
  const counts = new Map<string, number>();
  const staleIds: string[] = [];
  for (const row of rows) {
    const count = (counts.get(row.sourceId) ?? 0) + 1;
    counts.set(row.sourceId, count);
    if (count > NEWS_SOURCE_SCAN_HISTORY_LIMIT) {
      staleIds.push(row.id);
    }
  }
  if (staleIds.length > 0) {
    await prisma.newsSourceScan.deleteMany({
      where: { id: { in: staleIds } },
    });
  }
}

/** Latest scans of one source, newest first. */
export async function listNewsSourceScans(sourceId: string): Promise<NewsSourceScanDto[]> {
  const rows = await prisma.newsSourceScan.findMany({
    where: { sourceId },
    orderBy: { createdAt: "desc" },
    take: NEWS_SOURCE_SCAN_HISTORY_LIMIT,
  });
  return rows.map(serializeNewsSourceScan);
}
