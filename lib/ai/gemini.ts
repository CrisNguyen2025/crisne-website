import { GoogleGenAI, type GenerateContentResponseUsageMetadata } from "@google/genai";
import type { EmbeddingTaskType, LlmGenerateParams, LlmProvider, LlmUsage } from "./llm-provider";

export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
// Index script and runtime query must share this dimension, otherwise cosine similarity returns 0
export const EMBEDDING_DIMENSION = 768;

// Created lazily so scripts can load env files before the client reads the key
function getGenAI() {
  return new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY || "").trim() });
}

function toUsage(usageMetadata?: GenerateContentResponseUsageMetadata): LlmUsage | undefined {
  if (!usageMetadata) return undefined;
  return {
    input: usageMetadata.promptTokenCount ?? 0,
    output: usageMetadata.candidatesTokenCount ?? 0,
    total: usageMetadata.totalTokenCount ?? 0,
  };
}

function toRequest({ model, systemInstruction, contents, temperature, topP, maxOutputTokens }: LlmGenerateParams) {
  return {
    model,
    contents,
    config: {
      systemInstruction,
      temperature,
      topP,
      maxOutputTokens,
      // Thinking tokens would eat into maxOutputTokens and add latency
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

export const geminiProvider: LlmProvider = {
  async generate(params) {
    const response = await getGenAI().models.generateContent(toRequest(params));
    return { text: response.text ?? "", usage: toUsage(response.usageMetadata) };
  },

  async generateStream(params) {
    const stream = await getGenAI().models.generateContentStream(toRequest(params));
    return (async function* () {
      for await (const chunk of stream) {
        yield { text: chunk.text, usage: toUsage(chunk.usageMetadata) };
      }
    })();
  },

  async embed(text: string, taskType: EmbeddingTaskType) {
    const response = await getGenAI().models.embedContent({
      model: DEFAULT_EMBEDDING_MODEL,
      contents: [text],
      config: { taskType, outputDimensionality: EMBEDDING_DIMENSION },
    });
    return response.embeddings?.[0]?.values ?? null;
  },
};
