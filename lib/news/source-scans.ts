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

  for (const sourceId of new Set(results.map((result) => result.sourceId))) {
    const stale = await prisma.newsSourceScan.findMany({
      where: { sourceId },
      orderBy: { createdAt: "desc" },
      skip: NEWS_SOURCE_SCAN_HISTORY_LIMIT,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.newsSourceScan.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
    }
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
