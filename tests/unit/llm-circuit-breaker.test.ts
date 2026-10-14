import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCircuitOpen, recordLlmFailure, resetLlmCircuitBreaker } from "@/lib/ai/llm-circuit-breaker";

const quota = (retryDelaySeconds?: number) =>
  Object.assign(
    new Error(retryDelaySeconds ? `{"retryDelay":"${retryDelaySeconds}s"}` : "RESOURCE_EXHAUSTED"),
    { status: 429 }
  );

describe("llm circuit breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLlmCircuitBreaker();
  });
  afterEach(() => vi.useRealTimers());

  it("opens on quota for the provider's retry delay, then closes", () => {
    expect(recordLlmFailure("m", quota(30))).toBe("quota");
    expect(isCircuitOpen("m")).toBe(true);
    vi.advanceTimersByTime(29_000);
    expect(isCircuitOpen("m")).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(isCircuitOpen("m")).toBe(false);
  });

  it("caps long daily-quota delays at one hour so billing changes are picked up", () => {
    recordLlmFailure("m", quota(74_291));
    vi.advanceTimersByTime(60 * 60_000);
    expect(isCircuitOpen("m")).toBe(false);
  });

  it("uses a short cooldown for upstream outages", () => {
    recordLlmFailure("m", Object.assign(new Error("UNAVAILABLE"), { status: 503 }));
    expect(isCircuitOpen("m")).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(isCircuitOpen("m")).toBe(false);
  });

  it("stays closed for other errors and is tracked per model", () => {
    recordLlmFailure("a", Object.assign(new Error("bad request"), { status: 400 }));
    recordLlmFailure("b", quota(60));
    expect(isCircuitOpen("a")).toBe(false);
    expect(isCircuitOpen("b")).toBe(true);
    expect(isCircuitOpen("c")).toBe(false);
  });
});
