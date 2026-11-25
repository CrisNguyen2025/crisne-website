import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { FeedDiscoveryError, previewFeedSource } from "@/lib/news/feed-discovery";
import { PreviewNewsSourceSchema } from "@/lib/news/schemas";
import { UrlGuardError } from "@/lib/news/url-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PreviewNewsSourceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const preview = await previewFeedSource(parsed.data.feedUrl);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof FeedDiscoveryError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}),
        },
        { status: error.status }
      );
    }
    if (error instanceof UrlGuardError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("[API POST /api/news/sources/preview] Error:", error);
    return NextResponse.json({ error: "Không thể kiểm tra nguồn RSS." }, { status: 500 });
  }
}
