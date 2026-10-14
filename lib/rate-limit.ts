import type { NextRequest } from "next/server";

interface RateLimitOptions {
  // Bucket name so different routes keep separate counters
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  isAllowed: boolean;
  retryAfterSeconds: number;
}

const MAX_TRACKED_CLIENTS = 10_000;

// In-memory fixed window per instance. Good enough for a single server;
// swap for a shared store (Redis/KV) when running multiple serverless instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(req: NextRequest, { key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${key}:${getClientIp(req)}`;

  if (buckets.size > MAX_TRACKED_CLIENTS) {
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { isAllowed: true, retryAfterSeconds: 0 };
  }

  bucket.count++;
  return {
    isAllowed: bucket.count <= limit,
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
  };
}
