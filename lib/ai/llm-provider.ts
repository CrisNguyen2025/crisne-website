import { CHAT_MODEL_CHAIN, geminiProvider } from "./gemini";
import { GROQ_CHAT_MODEL_CHAIN, groqProvider } from "./groq";
import type { LlmErrorKind } from "./llm-errors";

export interface LlmUsage {
  input: number;
  output: number;
  total: number;
}

/** Legacy Gemini-shaped turn; adapters still accept it as-is. */
export interface LlmMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// Tool parts are declared for the message shape only; no adapter sends them yet
export type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };

/** Provider-neutral message; each adapter maps it to its vendor format. */
export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: ChatPart[];
}

export interface LlmGenerateParams {
  model: string;
  systemInstruction: string;
  contents: string | LlmMessage[] | ChatMessage[];
  temperature: number;
  topP?: number;
  maxOutputTokens: number;
  // "json" asks the provider's native JSON mode for a bare JSON answer (default "text")
  responseFormat?: "text" | "json";
}

export interface LlmStreamChunk {
  text?: string;
  // Usually only present on the last chunk
  usage?: LlmUsage;
}

// Only native streamParts implementations can tell why a stream ended; the wrapper leaves it unset
export type FinishReason = "stop" | "length" | "tool-calls" | "other";

/** Typed stream event: failures arrive as an `error` part instead of a thrown exception. */
export type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "finish"; usage?: LlmUsage; finishReason?: FinishReason }
  | { type: "error"; error: unknown; kind: LlmErrorKind };

export type EmbeddingTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

/**
 * Everything the chat pipeline needs from an LLM vendor. Keeps vendor specifics in one place
 * and lets tests run the real route against a scripted fake (no network, no quota).
 */
export interface LlmProvider {
  generate(params: LlmGenerateParams): Promise<{ text: string; usage?: LlmUsage }>;
  generateStream(params: LlmGenerateParams): Promise<AsyncIterable<LlmStreamChunk>>;
  // Optional native typed stream; the streamParts() helper wraps generateStream when absent
  streamParts?(params: LlmGenerateParams): AsyncIterable<StreamPart>;
  embed(text: string, taskType: EmbeddingTaskType): Promise<number[] | null>;
}

/** Adds behavior around a provider's calls (quota, logging, ...) and returns a provider. */
export type LlmMiddleware = (next: LlmProvider) => LlmProvider;

/** Applies middlewares outermost first: wrapProvider(p, a, b) behaves as a(b(p)). */
export function wrapProvider(provider: LlmProvider, ...middlewares: LlmMiddleware[]): LlmProvider {
  return middlewares.reduceRight((next, middleware) => middleware(next), provider);
}

let overrideProvider: LlmProvider | null = null;

/** Test hook: swap the provider (pass null to restore the real one). */
export function setLlmProvider(provider: LlmProvider | null): void {
  overrideProvider = provider;
}

export type ProviderName = "gemini" | "groq";

/** A model together with the provider that serves it, so a chain can span providers. */
export interface ModelRef {
  provider: ProviderName;
  model: string;
}

interface ProviderEntry {
  provider: LlmProvider;
  // Chat models tried in order by the resilient wrapper
  chatModels: string[];
  // Whether a usable API key is set (otherwise the route answers offline)
  isConfigured: () => boolean;
}

const PROVIDERS: Record<ProviderName, ProviderEntry> = {
  gemini: {
    provider: geminiProvider,
    chatModels: CHAT_MODEL_CHAIN,
    isConfigured: () => {
      const key = (process.env.GEMINI_API_KEY || "").trim();
      return key.length > 10 && !key.includes("your_google_gemini_api_key");
    },
  },
  groq: {
    provider: groqProvider,
    chatModels: GROQ_CHAT_MODEL_CHAIN,
    isConfigured: () => (process.env.GROQ_API_KEY || "").trim().length > 10,
  },
};

/** LLM_PROVIDER=groq switches chat generation to Groq; anything else keeps Gemini. */
export function getProviderName(): ProviderName {
  return (process.env.LLM_PROVIDER || "").trim().toLowerCase() === "groq" ? "groq" : "gemini";
}

/** Chat models tried in order by the resilient wrapper, each with its provider. */
export function getChatModelRefs(): ModelRef[] {
  const provider = getProviderName();
  return PROVIDERS[provider].chatModels.map((model) => ({ provider, model }));
}

/** Model names of the active chain; kept for callers that only need names. */
export function getChatModelChain(): string[] {
  return getChatModelRefs().map((ref) => ref.model);
}

export function isLlmConfigured(): boolean {
  return PROVIDERS[getProviderName()].isConfigured();
}

/** Provider serving a model ref (the test override replaces every provider). */
export function getProviderFor(ref: ModelRef): LlmProvider {
  return overrideProvider ?? PROVIDERS[ref.provider].provider;
}

export function getLlmProvider(): LlmProvider {
  return overrideProvider ?? PROVIDERS[getProviderName()].provider;
}
