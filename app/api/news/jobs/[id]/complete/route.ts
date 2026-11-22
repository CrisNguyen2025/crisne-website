import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { IngestJobConflictError, completeIngestJob } from "@/lib/news/ingest";
import { JobCompleteRequestSchema } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = JobCompleteRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const item = await completeIngestJob(id, parsed.data);
    if (!item) {
      return NextResponse.json({ error: "Ingest job not found" }, { status: 404 });
    }
    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof IngestJobConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API POST /api/news/jobs/[id]/complete] Error:", error);
    return NextResponse.json({ error: "Failed to complete ingest job" }, { status: 500 });
  }
}
