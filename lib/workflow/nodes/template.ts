import type { NodeInputs, PortValue, RetrievedDocument } from "../dag-executor";

const PLACEHOLDER = /\{\{\s*inputs\.([A-Za-z0-9_]+)\s*\}\}/g;

/** Documents as numbered sections, the shape the LLM sees as context. */
export function formatDocuments(documents: RetrievedDocument[]): string {
  return documents
    .map((doc, i) => [`[${i + 1}]${doc.heading ? ` ${doc.heading}` : ""}`, doc.content].join("\n"))
    .join("\n\n");
}

function toText(value: PortValue | PortValue[] | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  // A documents port carries RetrievedDocument[]; a multi-edge port a list of values
  if (value.every((item): item is RetrievedDocument => typeof item === "object" && !Array.isArray(item))) {
    return formatDocuments(value);
  }
  return (value as PortValue[]).map(toText).join("\n\n");
}

/**
 * Fills {{inputs.<port>}} from this node's inputs. The validator already rejected references
 * to ports that do not exist or have no edge; an optional port that was skipped renders empty.
 */
export function renderTemplate(template: string, inputs: NodeInputs): string {
  return template.replace(PLACEHOLDER, (_, port: string) => toText(inputs[port]));
}
