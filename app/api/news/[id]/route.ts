import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { getNewsItemById, updateNewsItem } from "@/lib/news/queries";
import { UpdateNewsItemSchema } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const item = await getNewsItemById(id);
    if (!item) {
      return NextResponse.json({ error: "News item not found" }, { status: 404 });
    }
    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API GET /api/news/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to load news item" }, { status: 500 });
  }
}

export async function PATCH(
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

  const parsed = UpdateNewsItemSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const item = await updateNewsItem(id, parsed.data);
    if (!item) {
      return NextResponse.json({ error: "News item not found" }, { status: 404 });
    }
    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API PATCH /api/news/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to update news item" }, { status: 500 });
  }
}
