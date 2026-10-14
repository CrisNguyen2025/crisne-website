import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const requestFrom = (ip: string) =>
  ({ headers: new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` }) }) as unknown as NextRequest;

describe("checkRateLimit", () => {
  it("allows up to the limit per client, then blocks with Retry-After", () => {
    const options = { key: "test-limit", limit: 3, windowMs: 60_000 };
    const results = Array.from({ length: 4 }, () => checkRateLimit(requestFrom("203.0.113.1"), options));

    expect(results.map((r) => r.isAllowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate counters per client IP and per bucket key", () => {
    const options = { key: "test-separate", limit: 1, windowMs: 60_000 };
    expect(checkRateLimit(requestFrom("203.0.113.2"), options).isAllowed).toBe(true);
    expect(checkRateLimit(requestFrom("203.0.113.3"), options).isAllowed).toBe(true);
    expect(
      checkRateLimit(requestFrom("203.0.113.2"), { ...options, key: "test-other" }).isAllowed
    ).toBe(true);
  });
});
