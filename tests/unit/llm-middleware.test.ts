import { describe, expect, it } from "vitest";
import { wrapProvider, type LlmMiddleware, type LlmProvider } from "@/lib/ai/llm-provider";

const params = {
  model: "gemini-2.5-flash",
  systemInstruction: "",
  contents: "hi",
  temperature: 0,
  maxOutputTokens: 10,
};

function createProvider(log: string[]): LlmProvider {
  return {
    async generate() {
      log.push("provider");
      return { text: "ok" };
    },
    async generateStream() {
      return (async function* () {})();
    },
    async embed() {
      return null;
    },
  };
}

// Records when its generate runs, before and after the wrapped provider
const tracing = (name: string, log: string[]): LlmMiddleware => (next) => ({
  ...next,
  async generate(p) {
    log.push(`${name}:before`);
    const result = await next.generate(p);
    log.push(`${name}:after`);
    return result;
  },
});

describe("wrapProvider", () => {
  it("returns the provider itself when no middleware is given", () => {
    const provider = createProvider([]);
    expect(wrapProvider(provider)).toBe(provider);
  });

  it("applies the first middleware as the outermost layer", async () => {
    const log: string[] = [];
    const wrapped = wrapProvider(createProvider(log), tracing("a", log), tracing("b", log));

    expect(await wrapped.generate(params)).toEqual({ text: "ok" });
    expect(log).toEqual(["a:before", "b:before", "provider", "b:after", "a:after"]);
  });

  it("lets a middleware short-circuit without calling the provider", async () => {
    const log: string[] = [];
    const reject: LlmMiddleware = (next) => ({
      ...next,
      generate: async () => {
        throw new Error("blocked");
      },
    });

    await expect(wrapProvider(createProvider(log), reject).generate(params)).rejects.toThrow("blocked");
    expect(log).toEqual([]);
  });
});
