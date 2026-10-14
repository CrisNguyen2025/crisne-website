import { geminiProvider } from "./gemini";

export interface LlmUsage {
  input: number;
  output: number;
  total: number;
}

export interface LlmMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface LlmGenerateParams {
  model: string;
  systemInstruction: string;
  contents: string | LlmMessage[];
  temperature: number;
  topP?: number;
  maxOutputTokens: number;
}

export interface LlmStreamChunk {
  text?: string;
  // Usually only present on the last chunk
  usage?: LlmUsage;
}

export type EmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

/**
 * Everything the chat pipeline needs from an LLM vendor. Keeps vendor specifics in one place
 * and lets tests run the real route against a scripted fake (no network, no quota).
 */
export interface LlmProvider {
  generate(params: LlmGenerateParams): Promise<{ text: string; usage?: LlmUsage }>;
  generateStream(params: LlmGenerateParams): Promise<AsyncIterable<LlmStreamChunk>>;
  embed(text: string, taskType: EmbeddingTaskType): Promise<number[] | null>;
}

let overrideProvider: LlmProvider | null = null;

/** Test hook: swap the provider (pass null to restore the real one). */
export function setLlmProvider(provider: LlmProvider | null): void {
  overrideProvider = provider;
}

export function getLlmProvider(): LlmProvider {
  return overrideProvider ?? geminiProvider;
}
