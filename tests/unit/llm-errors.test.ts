import { describe, expect, it } from "vitest";
import { classifyLlmError, getRetryAfterMs } from "@/lib/ai/llm-errors";

const withStatus = (status: number, message = "error") => Object.assign(new Error(message), { status });

describe("classifyLlmError", () => {
  it("detects quota exhaustion", () => {
    expect(classifyLlmError(withStatus(429))).toBe("quota");
    expect(classifyLlmError(new Error('{"status":"RESOURCE_EXHAUSTED"}'))).toBe("quota");
  });

  it("detects timeouts", () => {
    expect(classifyLlmError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe("timeout");
    expect(classifyLlmError(new Error("Request timed out"))).toBe("timeout");
  });

  it("detects upstream outages", () => {
    expect(classifyLlmError(withStatus(503))).toBe("upstream");
    expect(classifyLlmError(new Error("UNAVAILABLE"))).toBe("upstream");
  });

  it("falls back to unknown", () => {
    expect(classifyLlmError(withStatus(400, "bad request"))).toBe("unknown");
    expect(classifyLlmError("weird")).toBe("unknown");
    expect(classifyLlmError(undefined)).toBe("unknown");
  });
});

describe("getRetryAfterMs", () => {
  it("reads Gemini's retryDelay field", () => {
    expect(getRetryAfterMs(new Error('{"retryDelay":"74291s"}'))).toBe(74_291_000);
  });

  it("reads retryDelay inside escaped nested JSON (stream errors)", () => {
    expect(getRetryAfterMs(new Error('{"message":"{\\n \\"retryDelay\\": \\"30s\\"}"}'))).toBe(30_000);
  });

  it("reads 'Please retry in 20h38m11.3s'", () => {
    expect(getRetryAfterMs(new Error("Please retry in 20h38m11.3s."))).toBe((20 * 3600 + 38 * 60 + 11.3) * 1000);
  });

  it("returns null without a hint", () => {
    expect(getRetryAfterMs(new Error("boom"))).toBeNull();
  });
});
