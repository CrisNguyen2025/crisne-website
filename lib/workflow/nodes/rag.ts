import type { NodeHandler, RetrievedDocument } from "../dag-executor";

export type RetrieveFunction = (params: {
  projectId: string;
  query: string;
  topK: number;
  minScore?: number;
  documentIds?: string[];
}) => Promise<RetrievedDocument[]>;

export interface RagHandlerOptions {
  projectId: string;
  retrieve: RetrieveFunction;
}

export function createDryRunRetrieve(): RetrieveFunction {
  return async ({ query }) => [
    {
      id: "dry-run-chunk-1",
      documentId: "dry-run-doc-1",
      heading: "Knowledge Base (Dry Run)",
      content: `[dry-run] Sample relevant knowledge content for query: "${query}"`,
      score: 0.95,
    },
  ];
}

export function createRagHandler(options: RagHandlerOptions): NodeHandler<"rag"> {
  return async (node, inputs) => {
    const rawQuery = inputs.query;
    if (typeof rawQuery !== "string" || !rawQuery.trim()) {
      throw new Error(`RAG node "${node.id}" requires a valid input "query".`);
    }

    const documents = await options.retrieve({
      projectId: options.projectId,
      query: rawQuery,
      topK: node.config.topK,
      minScore: node.config.minScore,
      documentIds: node.config.documentIds,
    });

    return {
      outputs: { documents },
    };
  };
}
