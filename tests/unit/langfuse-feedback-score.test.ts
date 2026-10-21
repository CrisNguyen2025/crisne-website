import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Score API of the Langfuse client; no network
const deleteScore = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/client", () => ({
  LangfuseClient: class {
    api = { legacy: { scoreV1: { delete: deleteScore } } };
  },
}));

const notFound = () => Object.assign(new Error("Not found"), { statusCode: 404 });
const TRACE_ID = "0123456789abcdef0123456789abcdef";

async function loadWithKeys() {
  // The client is only created when the keys are set, and the module reads them on import
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");
  vi.resetModules();
  return import("@/lib/ai/langfuse");
}

describe("deleteFeedbackScore", () => {
  beforeEach(() => {
    deleteScore.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("deletes the trace's feedback score by its deterministic id", async () => {
    const { deleteFeedbackScore } = await loadWithKeys();
    deleteScore.mockResolvedValueOnce(undefined);

    await deleteFeedbackScore(TRACE_ID);
    expect(deleteScore).toHaveBeenCalledWith(`${TRACE_ID}-user-feedback`);
  });

  it("treats an already deleted score as done", async () => {
    const { deleteFeedbackScore } = await loadWithKeys();
    deleteScore.mockRejectedValueOnce(notFound());

    await expect(deleteFeedbackScore(TRACE_ID)).resolves.toBeUndefined();
  });

  it("fails on other errors so the widget shows the vote again", async () => {
    const { deleteFeedbackScore } = await loadWithKeys();
    deleteScore.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));

    await expect(deleteFeedbackScore(TRACE_ID)).rejects.toThrow("boom");
    expect(deleteScore).toHaveBeenCalledTimes(1);
  });
});
