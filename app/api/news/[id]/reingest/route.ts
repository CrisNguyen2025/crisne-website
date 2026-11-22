import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { reingestNewsItem } from "@/lib/news/ingest";
import { ReingestRequestSchema } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      rawBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReingestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const result = await reingestNewsItem(id, parsed.data.forceDeep);
    if (!result) {
      return NextResponse.json({ error: "News item not found" }, { status: 404 });
    }
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[API POST /api/news/[id]/reingest] Error:", error);
    return NextResponse.json({ error: "Failed to schedule reingest" }, { status: 500 });
  }
}
