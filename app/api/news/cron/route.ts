import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { checkRateLimit } from "@/lib/rate-limit";
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

async function authorizeCronRequest(req: NextRequest): Promise<Response | null> {
  if (hasValidCronSecret(req)) {
    return null;
  }

  const hasCronAttempt =
    Boolean(req.headers.get("x-cron-secret")) ||
    Boolean(req.headers.get("authorization")?.startsWith("Bearer "));
  if (hasCronAttempt) {
    const rateLimit = checkRateLimit(req, {
      key: "news-cron-auth-fail",
      limit: 10,
      windowMs: 5 * 60_000,
    });
    if (!rateLimit.isAllowed) {
      return NextResponse.json(
        { error: "Too many failed cron authentication attempts" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }
  }

  return requireWriteAccess(req);
}

async function handleCronSync(rawPayload: unknown, method: "GET" | "POST") {
  const parsed = CronSyncRequestSchema.safeParse(rawPayload);
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
    console.error(`[API ${method} /api/news/cron] Error:`, error);
    return NextResponse.json({ error: "Failed to run RSS cron sync" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await authorizeCronRequest(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const rawMax = sp.get("maxItemsPerSource");
  const rawPayload = {
    ...(sp.get("sourceId") ? { sourceId: sp.get("sourceId") } : {}),
    ...(rawMax !== null && rawMax !== "" ? { maxItemsPerSource: Number(rawMax) } : {}),
  };

  return handleCronSync(rawPayload, "GET");
}

export async function POST(req: NextRequest) {
  const denied = await authorizeCronRequest(req);
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

  return handleCronSync(rawBody, "POST");
}
