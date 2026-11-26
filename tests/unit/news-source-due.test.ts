import { describe, expect, it } from "vitest";
import { isNewsSourceDue } from "@/lib/news/rss-fetcher";

const HOUR_MS = 60 * 60_000;
// 00:30 UTC = 07:30 in Vietnam, inside the daily cron hour
const now = new Date("2026-11-26T00:30:00Z").getTime();
const ago = (hours: number) => new Date(now - hours * HOUR_MS);

describe("isNewsSourceDue", () => {
  it("pulls a never-fetched source", () => {
    expect(isNewsSourceDue({ fetchIntervalDays: 7, lastFetchedAt: null }, now)).toBe(true);
  });

  it("pulls a daily source after the previous cron run, even one that fired late in its hour", () => {
    expect(isNewsSourceDue({ fetchIntervalDays: 1, lastFetchedAt: ago(23) }, now)).toBe(true);
  });

  it("pulls a daily source that was pulled manually the previous evening", () => {
    expect(isNewsSourceDue({ fetchIntervalDays: 1, lastFetchedAt: ago(11) }, now)).toBe(true);
  });

  it("skips a daily source pulled manually less than 2 hours ago", () => {
    expect(isNewsSourceDue({ fetchIntervalDays: 1, lastFetchedAt: ago(1) }, now)).toBe(false);
  });

  it("skips a 3-day source on its second cron day, even with the widest hour drift", () => {
    expect(
      isNewsSourceDue({ fetchIntervalDays: 3, lastFetchedAt: ago(48 + 59 / 60) }, now)
    ).toBe(false);
  });

  it("pulls a 3-day source on its third cron day, even with the widest hour drift", () => {
    expect(isNewsSourceDue({ fetchIntervalDays: 3, lastFetchedAt: ago(71) }, now)).toBe(true);
  });
});
