import { describe, expect, it } from "vitest";
import { getVietnamHour, isNewsSourceDue } from "@/lib/news/rss-fetcher";

const HOUR_MS = 60 * 60_000;
// 04:00 UTC = 11:00 in Vietnam
const now = new Date("2026-11-25T04:00:00Z").getTime();
const ago = (hours: number) => new Date(now - hours * HOUR_MS);

describe("getVietnamHour", () => {
  it("shifts UTC by 7 hours and wraps past midnight", () => {
    expect(getVietnamHour(now)).toBe(11);
    expect(getVietnamHour(new Date("2026-11-25T20:30:00Z").getTime())).toBe(3);
  });
});

describe("isNewsSourceDue", () => {
  it("skips a source whose fetchHour is not the current Vietnam hour", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 1, fetchHour: 9, lastFetchedAt: null }, now)
    ).toBe(false);
  });

  it("pulls a never-fetched source at its hour", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 7, fetchHour: 11, lastFetchedAt: null }, now)
    ).toBe(true);
  });

  it("pulls a daily source at its hour even after fetchHour moved earlier", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 1, fetchHour: 11, lastFetchedAt: ago(20) }, now)
    ).toBe(true);
  });

  it("skips a 3-day source pulled yesterday", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 3, fetchHour: 11, lastFetchedAt: ago(24) }, now)
    ).toBe(false);
  });

  it("pulls a 3-day source once its interval has passed", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 3, fetchHour: 11, lastFetchedAt: ago(72) }, now)
    ).toBe(true);
  });
});
