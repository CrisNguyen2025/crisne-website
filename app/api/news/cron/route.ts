import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { syncNewsSourcesCron } from "@/lib/news/rss-fetcher";
import { CronSyncRequestSchema } from "@/lib/news/schemas";

export const dynamic = "force-dynamic";

function hasValidCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerToken = req.headers.get("x-cron-secret")?.trim() ?? null;
  const provided = bearerToken || headerToken;
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return (
    expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf)
  );
}

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    const denied = await requireWriteAccess(req);
    if (denied) return denied;
  }

  let rawBody: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      rawBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CronSyncRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const summary = await syncNewsSourcesCron({
      sourceId: parsed.data.sourceId,
      maxItemsPerSource: parsed.data.maxItemsPerSource,
    });
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[API POST /api/news/cron] Error:", error);
    return NextResponse.json({ error: "Failed to run RSS cron sync" }, { status: 500 });
  }
}
