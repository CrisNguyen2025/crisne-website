import { revalidatePath } from "next/cache";
import { after } from "next/server";

const REINDEX_TIMEOUT_MS = 5_000;

/**
 * Asks the Roadmap Assistant (Python service) to rebuild its index from /api/v1/roadmaps/full-export.
 * Never throws: when the service is down or not configured, its 30s TTL refresh still catches up.
 */
export async function requestRagReindex(): Promise<void> {
  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/reindex`, {
      method: "POST",
      headers: { "x-internal-key": internalKey },
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`Roadmap Assistant reindex request failed: HTTP ${res.status}`);
  } catch (error) {
    console.error("Roadmap Assistant reindex request failed:", error);
  }
}

/** Call once a roadmap write has succeeded. Runs after the response is sent, so it never delays or fails the write. */
export function notifyRoadmapChanged(): void {
  try {
    revalidatePath("/", "layout");
  } catch {
    // Outside a Next.js request scope (scripts, unit tests)
  }
  try {
    after(requestRagReindex);
  } catch {
    // Outside a request scope (scripts, tests): send it now instead of failing a write that already happened
    void requestRagReindex();
  }
}

/**
 * Asks the Roadmap Assistant (Python service) to drop its RAM cache of Owner Memory (ADR-0015).
 * Does NOT trigger a RAG re-index; never throws so the 60s TTL still catches up if the service is down.
 */
export async function requestOwnerMemoryCacheInvalidate(): Promise<void> {
  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/memory-cache/invalidate`, {
      method: "POST",
      headers: { "x-internal-key": internalKey },
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`Owner memory cache invalidate failed: HTTP ${res.status}`);
  } catch (error) {
    console.error("Owner memory cache invalidate failed:", error);
  }
}

/** Call once an Owner Memory write succeeds so Python stops serving stale RAM cache immediately. */
export function notifyOwnerMemoryChanged(): void {
  try {
    after(requestOwnerMemoryCacheInvalidate);
  } catch {
    // Outside a request scope (scripts, tests)
    void requestOwnerMemoryCacheInvalidate();
  }
}
