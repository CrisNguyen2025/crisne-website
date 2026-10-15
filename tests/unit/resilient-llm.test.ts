import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROQ_CHAT_MODEL_CHAIN } from "@/lib/ai/groq";
import { DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from "@/lib/ai/gemini";
import { setLlmProvider, type LlmProvider } from "@/lib/ai/llm-provider";
import { isCircuitOpen, resetLlmCircuitBreaker } from "@/lib/ai/llm-circuit-breaker";
import { generateWithFallback } from "@/lib/ai/resilient-llm";

const params = { systemInstruction: "", contents: "hi", temperature: 0, maxOutputTokens: 10 };
const quotaError = () => Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });

function createFake(failingModels: string[]) {
  const models: string[] = [];
  const provider: LlmProvider = {
    async generate({ model }) {
      models.push(model);
      if (failingModels.includes(model)) throw quotaError();
      return { text: `answer from ${model}` };
    },
    generateStream: vi.fn(),
    embed: vi.fn(),
  };
  setLlmProvider(provider);
  return models;
}

beforeEach(() => {
  resetLlmCircuitBreaker();
  vi.stubEnv("LLM_PROVIDER", "");
});
afterEach(() => {
  setLlmProvider(null);
  vi.unstubAllEnvs();
});

describe("generateWithFallback", () => {
  it("reports the provider and model that answered", async () => {
    createFake([]);
    expect(await generateWithFallback(params)).toEqual({
      result: { text: `answer from ${DEFAULT_CHAT_MODEL}` },
      model: DEFAULT_CHAT_MODEL,
      provider: "gemini",
      fallbackFrom: [],
    });
  });

  it("falls back along the active provider's chain, keeping model names in fallbackFrom", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    const models = createFake([GROQ_CHAT_MODEL_CHAIN[0]]);

    const { model, provider, fallbackFrom } = await generateWithFallback(params);

    expect(models).toEqual(GROQ_CHAT_MODEL_CHAIN);
    expect({ model, provider, fallbackFrom }).toEqual({
      model: GROQ_CHAT_MODEL_CHAIN[1],
      provider: "groq",
      fallbackFrom: [GROQ_CHAT_MODEL_CHAIN[0]],
    });
  });

  it("opens the circuit under a provider:model key", async () => {
    createFake([DEFAULT_CHAT_MODEL]);
    await generateWithFallback(params);

    expect(isCircuitOpen(`gemini:${DEFAULT_CHAT_MODEL}`)).toBe(true);
    expect(isCircuitOpen(`gemini:${FALLBACK_CHAT_MODEL}`)).toBe(false);
    // The same model name under another provider keeps its own circuit
    expect(isCircuitOpen(`groq:${DEFAULT_CHAT_MODEL}`)).toBe(false);
  });
});
