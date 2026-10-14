import { afterEach, describe, expect, it, vi } from "vitest";
import { GROQ_CHAT_MODEL_CHAIN, groqProvider } from "@/lib/ai/groq";
import { CHAT_MODEL_CHAIN } from "@/lib/ai/gemini";
import { getChatModelChain, isLlmConfigured } from "@/lib/ai/llm-provider";
import { classifyLlmError } from "@/lib/ai/llm-errors";

const params = {
  model: "openai/gpt-oss-120b",
  systemInstruction: "SYS",
  contents: [
    { role: "user" as const, parts: [{ text: "Hi" }] },
    { role: "model" as const, parts: [{ text: "Hello" }, { text: "there" }] },
    { role: "user" as const, parts: [{ text: "Docker?" }] },
  ],
  temperature: 0.3,
  topP: 0.9,
  maxOutputTokens: 1000,
};

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  // Split mid-line to exercise buffering across network chunks
  const half = Math.floor(body.length / 2);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(body.slice(0, half)));
      c.enqueue(new TextEncoder().encode(body.slice(half)));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("groqProvider", () => {
  it("maps Gemini-style turns to OpenAI chat messages with a system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await groqProvider.generate(params);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello\nthere" },
      { role: "user", content: "Docker?" },
    ]);
    expect(body.max_completion_tokens).toBe(1000);
    expect(body.reasoning_effort).toBe("low");
    expect(res).toEqual({ text: "ok", usage: { input: 3, output: 1, total: 4 } });
  });

  it("streams text deltas and reports usage from the final chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          { choices: [{ delta: { role: "assistant" } }] },
          { choices: [{ delta: { content: "Docker " } }] },
          { choices: [{ delta: { content: "là nền tảng" } }] },
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
        ])
      )
    );

    const chunks = [];
    for await (const c of await groqProvider.generateStream(params)) chunks.push(c);

    expect(chunks.map((c) => c.text).join("")).toBe("Docker là nền tảng");
    expect(chunks.at(-1)?.usage).toEqual({ input: 10, output: 5, total: 15 });
  });

  it("throws errors carrying the HTTP status so 429 is classified as quota", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    const error = await groqProvider.generate(params).catch((e) => e);
    expect(error.status).toBe(429);
    expect(classifyLlmError(error)).toBe("quota");
  });
});

describe("provider selection", () => {
  it("uses the Gemini chain by default and the Groq chain when LLM_PROVIDER=groq", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    expect(getChatModelChain()).toEqual(CHAT_MODEL_CHAIN);

    vi.stubEnv("LLM_PROVIDER", "groq");
    expect(getChatModelChain()).toEqual(GROQ_CHAT_MODEL_CHAIN);
  });

  it("requires GROQ_API_KEY when Groq is selected", () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(isLlmConfigured()).toBe(false);
    vi.stubEnv("GROQ_API_KEY", "gsk_test_key_not_real_123");
    expect(isLlmConfigured()).toBe(true);
  });
});
