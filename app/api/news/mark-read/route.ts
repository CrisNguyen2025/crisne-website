import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { markNewsItemsAsRead } from "@/lib/news/queries";
import { MarkReadRequestSchema } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const parsed = MarkReadRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const updated = await markNewsItemsAsRead(parsed.data);
    return NextResponse.json(
      { updated },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API POST /api/news/mark-read] Error:", error);
    return NextResponse.json({ error: "Failed to mark items as read" }, { status: 500 });
  }
}
