import {
  ELSE_BRANCH,
  type MergeMode,
  type NodeType,
  type WorkflowNode,
} from "./dsl-types";

// Ports are owned by the server: the DSL never stores them, so a client cannot invent one.
export const PORT_TYPES = ["text", "documents"] as const;
export type PortType = (typeof PORT_TYPES)[number];

export interface PortDefinition {
  name: string;
  type: PortType;
  // Inputs only: the node is skipped unless this port receives an ACTIVE edge
  required: boolean;
  // Inputs only: more than one edge may target this port (outputs always fan out)
  allowMultiple: boolean;
}

export interface NodePorts {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

const input = (name: string, type: PortType, options: Partial<Pick<PortDefinition, "required" | "allowMultiple">> = {}) => ({
  name,
  type,
  required: options.required ?? true,
  allowMultiple: options.allowMultiple ?? false,
});
const output = (name: string, type: PortType): PortDefinition => ({ name, type, required: false, allowMultiple: false });

const MERGE_PORT_TYPE: Record<MergeMode, PortType> = {
  first_active: "text",
  join_strings: "text",
  concat_documents: "documents",
};

/** Ports of a node, derived from its type and config (condition branches, merge mode). */
export function resolveNodePorts(node: WorkflowNode): NodePorts {
  switch (node.type) {
    case "input":
      return { inputs: [], outputs: [output("query", "text")] };
    case "rewrite":
      return { inputs: [input("query", "text")], outputs: [output("query", "text")] };
    case "rag":
      return { inputs: [input("query", "text")], outputs: [output("documents", "documents")] };
    case "condition":
      // Branches pass the input value through unchanged; names are checked by the validator
      return {
        inputs: [input("value", "text")],
        outputs: [...node.config.branches.map((b) => output(b.name, "text")), output(ELSE_BRANCH, "text")],
      };
    case "merge": {
      const type = MERGE_PORT_TYPE[node.config.mode];
      return { inputs: [input("items", type, { allowMultiple: true })], outputs: [output("value", type)] };
    }
    case "llm":
      return {
        inputs: [input("question", "text"), input("context", "documents", { required: false })],
        outputs: [output("text", "text")],
      };
    case "output":
      return { inputs: [input("value", "text")], outputs: [] };
  }
}

export const findInputPort = (node: WorkflowNode, name: string) =>
  resolveNodePorts(node).inputs.find((port) => port.name === name);

export const findOutputPort = (node: WorkflowNode, name: string) =>
  resolveNodePorts(node).outputs.find((port) => port.name === name);

// Shown in the canvas palette and validation messages
export const NODE_LABELS: Record<NodeType, string> = {
  input: "Input",
  rewrite: "Rewrite query",
  rag: "Knowledge base",
  condition: "Condition",
  merge: "Merge",
  llm: "LLM",
  output: "Output",
};
