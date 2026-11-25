import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { listNewsSourceScans } from "@/lib/news/source-scans";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Scan history is part of source management, which is Owner-only like the source CRUD routes
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const scans = await listNewsSourceScans(id);
    return NextResponse.json(
      { scans },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API GET /api/news/sources/[id]/scans] Error:", error);
    return NextResponse.json({ error: "Failed to load scan history" }, { status: 500 });
  }
}
