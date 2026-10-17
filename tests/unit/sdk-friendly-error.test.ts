import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyError } from "@/roadmap-rag-assistant/sdk/typescript/src/react/errors";
import { StreamTimeoutError } from "@/roadmap-rag-assistant/sdk/typescript/src/client";

describe("friendlyError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never shows the service address or port to the reader", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cases = [
      new TypeError("Failed to fetch"),
      new Error("connect ECONNREFUSED 127.0.0.1:8000"),
      new Error("SSE streaming failed (500): http://localhost:8000 down"),
      new StreamTimeoutError(),
    ];
    for (const err of cases) {
      const { text } = friendlyError(err);
      expect(text).not.toMatch(/localhost|127\.0\.0\.1|:8000|FastAPI|http/i);
    }
  });

  it("uses the timeout message for an idle stream", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError(new StreamTimeoutError())).toEqual({
      text: "Abot trả lời quá lâu. Bạn thử lại nhé.",
      retryable: true,
    });
  });

  it("tells the reader to slow down on 429", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { text, retryable } = friendlyError(new Error("SSE streaming failed (429): too many"));
    expect(text).toContain("hơi nhanh");
    expect(retryable).toBe(true);
  });

  it("says the question is too long on 413 or 422, and retrying won't help", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of [413, 422]) {
      const { text, retryable } = friendlyError(new Error(`SSE streaming failed (${code}): x`));
      expect(text).toContain("quá dài");
      expect(retryable).toBe(false);
    }
  });

  it("keeps the raw detail in the console for the developer", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    friendlyError(new Error("connect ECONNREFUSED 127.0.0.1:8000"));
    expect(spy).toHaveBeenCalledWith("[Abot]", "connect ECONNREFUSED 127.0.0.1:8000");
  });
});
