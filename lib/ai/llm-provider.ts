import { CHAT_MODEL_CHAIN, geminiProvider } from "./gemini";
import { GROQ_CHAT_MODEL_CHAIN, groqProvider } from "./groq";

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

type ProviderName = "gemini" | "groq";

/** LLM_PROVIDER=groq switches chat generation to Groq; anything else keeps Gemini. */
export function getProviderName(): ProviderName {
  return (process.env.LLM_PROVIDER || "").trim().toLowerCase() === "groq" ? "groq" : "gemini";
}

/** Models tried in order by the resilient wrapper, for the active provider. */
export function getChatModelChain(): string[] {
  return getProviderName() === "groq" ? GROQ_CHAT_MODEL_CHAIN : CHAT_MODEL_CHAIN;
}

/** Whether the active provider has a usable API key (otherwise the route answers offline). */
export function isLlmConfigured(): boolean {
  if (getProviderName() === "groq") return (process.env.GROQ_API_KEY || "").trim().length > 10;
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return key.length > 10 && !key.includes("your_google_gemini_api_key");
}

export function getLlmProvider(): LlmProvider {
  if (overrideProvider) return overrideProvider;
  return getProviderName() === "groq" ? groqProvider : geminiProvider;
}
