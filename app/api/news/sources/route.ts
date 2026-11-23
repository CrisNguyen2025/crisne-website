import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { CreateNewsSourceSchema } from "@/lib/news/schemas";
import { FeedDiscoveryError } from "@/lib/news/feed-discovery";
import {
  NewsSourceConflictError,
  createNewsSource,
  listNewsSources,
} from "@/lib/news/sources";
import { UrlGuardError } from "@/lib/news/url-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const sources = await listNewsSources();
    return NextResponse.json(
      { sources },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[API GET /api/news/sources] Error:", error);
    return NextResponse.json({ error: "Failed to load news sources" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateNewsSourceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const source = await createNewsSource(parsed.data);
    return NextResponse.json(
      { source },
      {
        status: 201,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    if (error instanceof UrlGuardError || error instanceof FeedDiscoveryError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof NewsSourceConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API POST /api/news/sources] Error:", error);
    return NextResponse.json({ error: "Failed to create news source" }, { status: 500 });
  }
}
