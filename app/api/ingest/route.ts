import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { enqueueNewsUrl } from "@/lib/news/ingest";
import { IngestRequestSchema } from "@/lib/news/schemas";
import { UrlGuardError } from "@/lib/news/url-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = IngestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await enqueueNewsUrl(parsed.data);
    return NextResponse.json(result, {
      status: result.status === "duplicate" ? 200 : 202,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof UrlGuardError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[API POST /api/ingest] Error:", error);
    return NextResponse.json({ error: "Failed to enqueue URL" }, { status: 500 });
  }
}
