import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmGenerateParams } from "@/lib/ai/llm-provider";

const genai = vi.hoisted(() => ({
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  embedContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () {
    return { models: genai };
  }),
}));

import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION, geminiProvider } from "@/lib/ai/gemini";

const params: LlmGenerateParams = {
  model: "gemini-2.5-flash",
  systemInstruction: "Bạn là Cris AI",
  contents: [
    { role: "user", parts: [{ text: "Xin chào" }] },
    { role: "model", parts: [{ text: "Chào bạn" }] },
    { role: "user", parts: [{ text: "Kể về Zelene" }] },
  ],
  temperature: 0.3,
  topP: 0.9,
  maxOutputTokens: 1000,
};

beforeEach(() => vi.clearAllMocks());

// Baseline for the AI-layer refactor: the request shape Gemini receives today
describe("geminiProvider", () => {
  it("passes contents through unchanged and disables thinking", async () => {
    genai.generateContent.mockResolvedValueOnce({
      text: "Zelene là app đặt lịch spa.",
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 8, totalTokenCount: 128 },
    });

    const result = await geminiProvider.generate(params);

    expect(genai.generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: params.contents,
      config: {
        systemInstruction: "Bạn là Cris AI",
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    expect(result).toEqual({
      text: "Zelene là app đặt lịch spa.",
      usage: { input: 120, output: 8, total: 128 },
    });
  });

  it("normalizes neutral messages into alternating Gemini turns", async () => {
    genai.generateContent.mockResolvedValueOnce({ text: "ok" });

    await geminiProvider.generate({
      ...params,
      contents: [
        { role: "assistant", content: [{ type: "text", text: "Xin chào" }] },
        { role: "user", content: [{ type: "text", text: "Kể về Zelene" }] },
        { role: "user", content: [{ type: "text", text: "và Kamala" }] },
      ],
    });

    expect(genai.generateContent.mock.calls[0][0].contents).toEqual([
      { role: "user", parts: [{ text: "Kể về Zelene" }, { text: "và Kamala" }] },
    ]);
  });

  it("turns on native JSON mode only when responseFormat is json", async () => {
    genai.generateContent.mockResolvedValue({ text: "{}" });

    await geminiProvider.generate({ ...params, responseFormat: "json" });
    await geminiProvider.generate({ ...params, responseFormat: "text" });

    expect(genai.generateContent.mock.calls[0][0].config.responseMimeType).toBe("application/json");
    expect(genai.generateContent.mock.calls[1][0].config).not.toHaveProperty("responseMimeType");
  });

  it("returns empty text and no usage when the response has neither", async () => {
    genai.generateContent.mockResolvedValueOnce({});
    expect(await geminiProvider.generate(params)).toEqual({ text: "", usage: undefined });
  });

  it("streams text chunks and maps usage per chunk", async () => {
    genai.generateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "Zelene " };
        yield {
          text: "là app.",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
        };
      })()
    );

    const chunks = [];
    for await (const chunk of await geminiProvider.generateStream(params)) chunks.push(chunk);

    expect(chunks).toEqual([
      { text: "Zelene ", usage: undefined },
      { text: "là app.", usage: { input: 10, output: 2, total: 12 } },
    ]);
  });

  it("embeds with the shared model and dimension, null when no vector comes back", async () => {
    genai.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.1, 0.2] }] });
    expect(await geminiProvider.embed("Zelene", "RETRIEVAL_QUERY")).toEqual([0.1, 0.2]);
    expect(genai.embedContent).toHaveBeenCalledWith({
      model: DEFAULT_EMBEDDING_MODEL,
      contents: ["Zelene"],
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBEDDING_DIMENSION },
    });

    genai.embedContent.mockResolvedValueOnce({});
    expect(await geminiProvider.embed("Zelene", "RETRIEVAL_DOCUMENT")).toBeNull();
  });
});
