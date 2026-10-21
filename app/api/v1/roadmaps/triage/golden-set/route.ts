import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { getReviewStatus } from "@/lib/ai/langfuse";
// Bundled at build time: the stamp `python -m evals sync-dataset` writes when it changes the golden set
import answerMeta from "@/roadmap-rag-assistant/evals/datasets/_answer/meta.json";

// Langfuse dataset frozen into roadmap-rag-assistant/evals/datasets/_answer (evals/sync_dataset.py DATASET_NAME)
const GOLDEN_SET_DATASET = "cris-ai-golden-set";

interface SyncStamp {
  dataset: string;
  synced_at: string;
  samples: number;
}

/**
 * Owner only: the golden set as committed (samples from Langfuse, last sync) next to Langfuse live
 * (dataset items, 👎 waiting for review), so the owner sees when a sync or a review is due.
 */
export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const sync = ((answerMeta as { langfuse_sync?: SyncStamp }).langfuse_sync ?? null) as SyncStamp | null;
  try {
    const live = await getReviewStatus(GOLDEN_SET_DATASET);
    return NextResponse.json({ dataset: GOLDEN_SET_DATASET, sync, ...live });
  } catch (error) {
    // The committed part is still worth showing when Langfuse is down or not configured
    return NextResponse.json({
      dataset: GOLDEN_SET_DATASET,
      sync,
      error: error instanceof Error ? error.message : "Langfuse unavailable",
    });
  }
}
