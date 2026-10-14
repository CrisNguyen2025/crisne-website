import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearResponseCache,
  getCachedAnswer,
  isCacheableQuery,
  setCachedAnswer,
} from "@/lib/ai/response-cache";

describe("response cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearResponseCache();
  });
  afterEach(() => vi.useRealTimers());

  it("only caches standalone questions without personal data", () => {
    expect(isCacheableQuery("Liên hệ Cris thế nào?", 0)).toBe(true);
    expect(isCacheableQuery("Liên hệ Cris thế nào?", 2)).toBe(false);
    expect(isCacheableQuery("gọi mình 0912345678", 0)).toBe(false);
  });

  it("matches questions regardless of case, accents and spacing", () => {
    setCachedAnswer("Liên hệ Cris thế nào?", "answer", "model");
    expect(getCachedAnswer("  lien he CRIS the nao? ")?.answer).toBe("answer");
  });

  it("expires entries after 6 hours", () => {
    setCachedAnswer("q", "answer", "model");
    vi.advanceTimersByTime(6 * 60 * 60_000 - 1);
    expect(getCachedAnswer("q")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getCachedAnswer("q")).toBeNull();
  });

  it("evicts the oldest entry when full", () => {
    for (let i = 0; i < 500; i++) setCachedAnswer(`q${i}`, `a${i}`, "model");
    setCachedAnswer("newest", "a", "model");
    expect(getCachedAnswer("q0")).toBeNull();
    expect(getCachedAnswer("q1")?.answer).toBe("a1");
    expect(getCachedAnswer("newest")?.answer).toBe("a");
  });
});
