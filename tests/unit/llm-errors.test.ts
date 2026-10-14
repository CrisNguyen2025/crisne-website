import { describe, expect, it } from "vitest";
import { classifyLlmError } from "@/lib/ai/llm-errors";

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
