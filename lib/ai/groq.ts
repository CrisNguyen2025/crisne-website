import { geminiProvider } from "./gemini";
import type { LlmGenerateParams, LlmProvider, LlmStreamChunk, LlmUsage } from "./llm-provider";

// Groq's free tier needs no card. Fallback is a smaller model with its own rate limit.
export const GROQ_CHAT_MODEL_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 25_000;

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

function toUsage(usage?: OpenAiUsage): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
    total: usage.total_tokens ?? 0,
  };
}

function toBody(params: LlmGenerateParams, stream: boolean) {
  const { model, systemInstruction, contents, temperature, topP, maxOutputTokens } = params;
  const turns =
    typeof contents === "string"
      ? [{ role: "user", content: contents }]
      : contents.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.parts.map((p) => p.text).join("\n"),
        }));

  return {
    model,
    messages: [{ role: "system", content: systemInstruction }, ...turns],
    temperature,
    top_p: topP,
    // gpt-oss reasons before answering; reasoning tokens count against this cap
    max_completion_tokens: maxOutputTokens,
    ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

/** POST to Groq; non-2xx becomes an Error with `status` so classifyLlmError can bucket it. */
async function post(params: LlmGenerateParams, stream: boolean): Promise<Response> {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(toBody(params, stream)),
    // Bounds the wait for the response headers; a stream that started is not cut off
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw Object.assign(new Error(`Groq ${response.status}: ${detail}`), { status: response.status });
  }
  return response;
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<LlmStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        const chunk = JSON.parse(data);
        const text: string | undefined = chunk.choices?.[0]?.delta?.content || undefined;
        // Usage comes on the final chunk (OpenAI style, or Groq's x_groq extension)
        const usage = toUsage(chunk.usage ?? chunk.x_groq?.usage);
        if (text || usage) yield { text, usage };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const groqProvider: LlmProvider = {
  async generate(params) {
    const json = await (await post(params, false)).json();
    return { text: json.choices?.[0]?.message?.content ?? "", usage: toUsage(json.usage) };
  },

  async generateStream(params) {
    const response = await post(params, true);
    if (!response.body) throw Object.assign(new Error("Groq stream has no body"), { status: 502 });
    return readSse(response.body);
  },

  // Groq has no embeddings API: retrieval keeps Gemini embeddings (the index was built with them)
  embed: (text, taskType) => geminiProvider.embed(text, taskType),
};
