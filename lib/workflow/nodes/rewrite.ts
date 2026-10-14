import type { LlmProvider } from "@/lib/ai/llm-provider";
import type { NodeHandler } from "../dag-executor";
import { renderTemplate } from "./template";

export function createRewriteHandler(llm: LlmProvider, model: string): NodeHandler<"rewrite"> {
  return async (node, inputs) => {
    const rawQuery = inputs.query;
    if (typeof rawQuery !== "string" || !rawQuery.trim()) {
      throw new Error(`Rewrite node "${node.id}" requires an input query.`);
    }

    const renderedInstruction = renderTemplate(node.config.instruction, inputs);
    const systemInstruction =
      "You are a search query rewriting specialist. Rewrite the input query following the instruction provided. Return ONLY the rewritten query text, with no explanation, markdown, intro, or surrounding quotes.";

    const contents = `Original Query: ${rawQuery}\nInstruction: ${renderedInstruction}`;

    const { text, usage } = await llm.generate({
      model,
      systemInstruction,
      contents,
      temperature: 0.1,
      maxOutputTokens: 256,
    });

    const rewrittenQuery = text.trim();
    if (!rewrittenQuery) {
      throw new Error(`Rewrite node "${node.id}" produced an empty query.`);
    }

    return {
      outputs: { query: rewrittenQuery },
      usage: { model, inputTokens: usage?.input, outputTokens: usage?.output },
    };
  };
}
