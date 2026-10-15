import { afterEach, describe, expect, it, vi } from "vitest";
import { generateJson, generateJsonWithFallback, stripCodeFence } from "@/lib/ai/generate-json";
import { setLlmProvider, type LlmProvider } from "@/lib/ai/llm-provider";
import { DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from "@/lib/ai/gemini";
import { resetLlmCircuitBreaker } from "@/lib/ai/llm-circuit-breaker";

const params = { model: "m", systemInstruction: "", contents: "hi", temperature: 0, maxOutputTokens: 10 };

interface Draft {
  title: string;
}
const isDraft = (value: unknown): value is Draft =>
  typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).title === "string";

function createProvider(generate: LlmProvider["generate"]): LlmProvider {
  return { generate: vi.fn(generate), generateStream: vi.fn(), embed: vi.fn() };
}

describe("stripCodeFence", () => {
  it("unwraps a whole-answer fence and keeps fences inside the JSON", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
    const withInnerFence = '{"content":"```ts\\nconst a = 1;\\n```"}';
    expect(stripCodeFence(withInnerFence)).toBe(withInnerFence);
  });
});

describe("generateJson", () => {
  it("requests JSON mode and returns the validated value with usage", async () => {
    const provider = createProvider(async () => ({
      text: '```json\n{"title":"Reranker"}\n```',
      usage: { input: 5, output: 2, total: 7 },
    }));

    expect(await generateJson(provider, params, isDraft)).toEqual({
      ok: true,
      value: { title: "Reranker" },
      usage: { input: 5, output: 2, total: 7 },
    });
    expect(provider.generate).toHaveBeenCalledWith({ ...params, responseFormat: "json" });
  });

  it("returns ok: false with the raw text for invalid JSON or a wrong shape", async () => {
    const invalid = await generateJson(createProvider(async () => ({ text: "không phải JSON" })), params, isDraft);
    expect(invalid).toMatchObject({ ok: false, text: "không phải JSON" });
    expect((invalid as { error: unknown }).error).toBeInstanceOf(SyntaxError);

    const wrongShape = await generateJson(createProvider(async () => ({ text: '{"title":5}' })), params, isDraft);
    expect(wrongShape).toMatchObject({ ok: false, text: '{"title":5}' });
  });

  it("returns ok: false instead of throwing when the model call fails", async () => {
    const error = Object.assign(new Error("quota"), { status: 429 });
    expect(await generateJson(createProvider(async () => Promise.reject(error)), params, isDraft)).toEqual({
      ok: false,
      error,
      text: undefined,
    });
  });
});

describe("generateJsonWithFallback", () => {
  const quota = () => Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });

  afterEach(() => {
    setLlmProvider(null);
    resetLlmCircuitBreaker();
    vi.unstubAllEnvs();
  });

  it("moves to the next model on quota and reports which one answered", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    const generate = vi
      .fn<LlmProvider["generate"]>()
      .mockRejectedValueOnce(quota())
      .mockResolvedValueOnce({ text: '{"title":"Reranker"}' });
    setLlmProvider({ generate, generateStream: vi.fn(), embed: vi.fn() });

    expect(await generateJsonWithFallback(params, isDraft)).toEqual({
      ok: true,
      value: { title: "Reranker" },
      usage: undefined,
      model: FALLBACK_CHAT_MODEL,
      provider: "gemini",
    });
    expect(generate.mock.calls.map(([p]) => [p.model, p.responseFormat])).toEqual([
      [DEFAULT_CHAT_MODEL, "json"],
      [FALLBACK_CHAT_MODEL, "json"],
    ]);
  });

  it("does not retry another model for invalid JSON, and never throws when all models fail", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    const generate = vi.fn<LlmProvider["generate"]>().mockResolvedValueOnce({ text: "nope" });
    setLlmProvider({ generate, generateStream: vi.fn(), embed: vi.fn() });

    expect(await generateJsonWithFallback(params, isDraft)).toMatchObject({ ok: false, text: "nope" });
    expect(generate).toHaveBeenCalledTimes(1);

    generate.mockRejectedValue(quota());
    resetLlmCircuitBreaker();
    const failed = await generateJsonWithFallback(params, isDraft);
    expect(failed.ok).toBe(false);
    expect(failed).not.toHaveProperty("text");
  });
});
