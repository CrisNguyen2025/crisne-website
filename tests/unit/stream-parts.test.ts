import { describe, expect, it, vi } from "vitest";
import type { LlmProvider, LlmStreamChunk, StreamPart } from "@/lib/ai/llm-provider";
import { streamParts } from "@/lib/ai/stream-parts";
import { createDryRunProvider } from "@/lib/workflow/dry-run-provider";

const params = { model: "m", systemInstruction: "", contents: "hi", temperature: 0, maxOutputTokens: 10 };
const quotaError = () => Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });

function createProvider(generateStream: LlmProvider["generateStream"]): LlmProvider {
  return { generate: vi.fn(), generateStream: vi.fn(generateStream), embed: vi.fn() };
}

async function collect(parts: AsyncIterable<StreamPart>): Promise<StreamPart[]> {
  const result: StreamPart[] = [];
  for await (const part of parts) result.push(part);
  return result;
}

describe("streamParts", () => {
  it("turns chunks into text deltas, skipping empty text, and ends with finish + last usage", async () => {
    const provider = createProvider(async () =>
      (async function* (): AsyncGenerator<LlmStreamChunk> {
        yield { text: "Cris " };
        yield { text: "" };
        yield { text: "giúp bạn.", usage: { input: 10, output: 3, total: 13 } };
      })()
    );

    expect(await collect(streamParts(provider, params))).toEqual([
      { type: "text-delta", text: "Cris " },
      { type: "text-delta", text: "giúp bạn." },
      { type: "finish", usage: { input: 10, output: 3, total: 13 } },
    ]);
  });

  it("reports a failure to open the stream as a single classified error part", async () => {
    const error = quotaError();
    const provider = createProvider(async () => {
      throw error;
    });

    expect(await collect(streamParts(provider, params))).toEqual([{ type: "error", error, kind: "quota" }]);
  });

  it("keeps the text received before a mid-stream failure, then ends with an error part", async () => {
    const error = Object.assign(new Error("Request timed out"), { name: "TimeoutError" });
    const provider = createProvider(async () =>
      (async function* (): AsyncGenerator<LlmStreamChunk> {
        yield { text: "Cris " };
        throw error;
      })()
    );

    expect(await collect(streamParts(provider, params))).toEqual([
      { type: "text-delta", text: "Cris " },
      { type: "error", error, kind: "timeout" },
    ]);
  });

  it("stops pulling from the model when the consumer stops early", async () => {
    let pulled = 0;
    const provider = createProvider(async () =>
      (async function* (): AsyncGenerator<LlmStreamChunk> {
        for (const text of ["a", "b", "c"]) {
          pulled++;
          yield { text };
        }
      })()
    );

    for await (const part of streamParts(provider, params)) {
      if (part.type === "text-delta") break;
    }
    expect(pulled).toBe(1);
  });

  it("prefers a native streamParts implementation and still converts its failures", async () => {
    const error = quotaError();
    const provider: LlmProvider = {
      ...createProvider(async () => (async function* () {})()),
      async *streamParts() {
        yield { type: "text-delta", text: "native" };
        throw error;
      },
    };

    expect(await collect(streamParts(provider, params))).toEqual([
      { type: "text-delta", text: "native" },
      { type: "error", error, kind: "quota" },
    ]);
    expect(provider.generateStream).not.toHaveBeenCalled();
  });

  it("works for existing providers without changes (dry-run)", async () => {
    expect(await collect(streamParts(createDryRunProvider(), params))).toEqual([
      { type: "text-delta", text: "[dry-run] hi" },
      { type: "finish", usage: { input: 0, output: 0, total: 0 } },
    ]);
  });
});
