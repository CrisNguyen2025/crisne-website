import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { trimTrailingChar } from "@/lib/utils";

const REINDEX_TIMEOUT_MS = 5_000;

async function postRagInternal(endpointPath: string, label: string): Promise<void> {
  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return;

  try {
    const res = await fetch(`${trimTrailingChar(baseUrl, "/")}${endpointPath}`, {
      method: "POST",
      headers: { "x-internal-key": internalKey },
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`${label} failed: HTTP ${res.status}`);
  } catch (error) {
    console.error(`${label} failed:`, error);
  }
}

/**
 * Asks the Roadmap Assistant (Python service) to rebuild its index from /api/v1/roadmaps/full-export.
 * Never throws: when the service is down or not configured, its 30s TTL refresh still catches up.
 */
export async function requestRagReindex(): Promise<void> {
  return postRagInternal("/internal/reindex", "Roadmap Assistant reindex request");
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
  return postRagInternal("/internal/memory-cache/invalidate", "Owner memory cache invalidate");
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
