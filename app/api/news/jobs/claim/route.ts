import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { claimNextIngestJob } from "@/lib/news/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const job = await claimNextIngestJob();
    return NextResponse.json(
      { job },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API POST /api/news/jobs/claim] Error:", error);
    return NextResponse.json({ error: "Failed to claim ingest job" }, { status: 500 });
  }
}
