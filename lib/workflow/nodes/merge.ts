import type { NodeHandler, PortValue, RetrievedDocument } from "../dag-executor";

export const DEFAULT_JOIN_SEPARATOR = "\n\n";

/** Union of document lists: one entry per chunk id (best score kept), best first. */
export function concatDocuments(lists: RetrievedDocument[][]): RetrievedDocument[] {
  const byId = new Map<string, RetrievedDocument>();
  for (const doc of lists.flat()) {
    const existing = byId.get(doc.id);
    if (!existing || doc.score > existing.score) byId.set(doc.id, doc);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

// The executor passes only the branches that ran, in edge order
export const mergeHandler: NodeHandler<"merge"> = async (node, inputs) => {
  const items = inputs.items as PortValue[];
  switch (node.config.mode) {
    case "first_active":
      return { outputs: { value: items[0] } };
    case "join_strings":
      return { outputs: { value: (items as string[]).join(node.config.separator ?? DEFAULT_JOIN_SEPARATOR) } };
    case "concat_documents":
      return { outputs: { value: concatDocuments(items as RetrievedDocument[][]) } };
  }
};
