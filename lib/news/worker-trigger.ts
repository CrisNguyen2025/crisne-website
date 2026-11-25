import { after } from "next/server";
import { trimTrailingChar } from "@/lib/utils";

const WAKE_TIMEOUT_MS = 10_000;

/**
 * Notifies the standalone Python news-ingest-worker that a new job is ready to claim.
 * Never throws: the worker also polls on an interval if a wake ping is missed.
 */
export async function requestNewsWorkerWake(jobId?: string): Promise<void> {
  const baseUrl = process.env.NEWS_WORKER_URL;
  const internalKey = process.env.NEWS_WORKER_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return;

  try {
    const res = await fetch(`${trimTrailingChar(baseUrl, "/")}/internal/wake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(jobId ? { jobId } : {}),
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`News worker wake failed: HTTP ${res.status}`);
    }
  } catch (error) {
    console.error("News worker wake failed:", error);
  }
}

export function notifyNewsWorker(jobId?: string): void {
  try {
    after(() => requestNewsWorkerWake(jobId));
  } catch {
    void requestNewsWorkerWake(jobId);
  }
}
