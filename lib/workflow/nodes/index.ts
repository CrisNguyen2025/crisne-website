import { FALLBACK_CHAT_MODEL, geminiProvider } from "@/lib/ai/gemini";
import type { LlmProvider } from "@/lib/ai/llm-provider";
import type { NodeHandler, NodeHandlers } from "../dag-executor";
import { conditionHandler } from "./condition";
import { createLlmHandler } from "./llm";
import { mergeHandler } from "./merge";
import { createRewriteHandler } from "./rewrite";
import { createDryRunRetrieve, createRagHandler, type RetrieveFunction } from "./rag";
import { retrieve as defaultRetrieve } from "../kb/retrieval";

// Builder AI nodes stay on flash-lite so the portfolio chatbot keeps its flash quota
export const WORKFLOW_LLM_MODEL = FALLBACK_CHAT_MODEL;

export interface NodeHandlerOptions {
  // Injected rather than set globally: a dry run must not swap the chatbot's provider
  llm?: LlmProvider;
  model?: string;
  projectId?: string;
  retrieve?: RetrieveFunction;
}

const inputHandler: NodeHandler<"input"> = async (node, _, { runInput }) => {
  const query = runInput.query;
  if (typeof query !== "string" || !query.trim()) throw new Error(`Input node "${node.id}" needs a non-empty "query".`);
  return { outputs: { query } };
};

// The executor collects the value; nothing flows further
const outputHandler: NodeHandler<"output"> = async () => ({ outputs: {} });

export function createNodeHandlers({
  llm = geminiProvider,
  model = WORKFLOW_LLM_MODEL,
  projectId = "",
  retrieve,
}: NodeHandlerOptions = {}): NodeHandlers {
  const activeRetrieve: RetrieveFunction =
    retrieve ??
    (projectId
      ? (params) => defaultRetrieve({ ...params, llm })
      : createDryRunRetrieve());

  return {
    input: inputHandler,
    condition: conditionHandler,
    merge: mergeHandler,
    llm: createLlmHandler(llm, model),
    output: outputHandler,
    rewrite: createRewriteHandler(llm, model),
    rag: createRagHandler({ projectId, retrieve: activeRetrieve }),
  };
}
