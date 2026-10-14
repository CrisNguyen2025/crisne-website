import type { LlmProvider } from "@/lib/ai/llm-provider";
import type { NodeHandler } from "../dag-executor";
import { renderTemplate } from "./template";

export const DEFAULT_LLM_TEMPERATURE = 0.3;
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export function createLlmHandler(llm: LlmProvider, model: string): NodeHandler<"llm"> {
  return async (node, inputs) => {
    const { text, usage } = await llm.generate({
      model,
      systemInstruction: node.config.system ? renderTemplate(node.config.system, inputs) : "",
      contents: renderTemplate(node.config.prompt, inputs),
      temperature: node.config.temperature ?? DEFAULT_LLM_TEMPERATURE,
      maxOutputTokens: node.config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    });
    if (!text.trim()) throw new Error(`LLM node "${node.id}" returned an empty answer.`);
    return {
      outputs: { text },
      usage: { model, inputTokens: usage?.input, outputTokens: usage?.output },
    };
  };
}
