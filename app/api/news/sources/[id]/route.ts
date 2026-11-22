import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { UpdateNewsSourceSchema } from "@/lib/news/schemas";
import {
  NewsSourceConflictError,
  deleteNewsSource,
  updateNewsSource,
} from "@/lib/news/sources";
import { UrlGuardError } from "@/lib/news/url-guard";

export const dynamic = "force-dynamic";

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

  const parsed = UpdateNewsSourceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const source = await updateNewsSource(id, parsed.data);
    if (!source) {
      return NextResponse.json({ error: "News source not found" }, { status: 404 });
    }
    return NextResponse.json(
      { source },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof UrlGuardError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof NewsSourceConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API PATCH /api/news/sources/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to update news source" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const deleted = await deleteNewsSource(id);
    if (!deleted) {
      return NextResponse.json({ error: "News source not found" }, { status: 404 });
    }
    return NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API DELETE /api/news/sources/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to delete news source" }, { status: 500 });
  }
}
