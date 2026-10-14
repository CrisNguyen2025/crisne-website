// Workflow DSL v1 (docs/workflow-builder-design.md §3.1).
// A stored workflow is `graph` (what the runtime reads) + `ui` (canvas layout only).
// Ports are not part of the DSL: the server-side node registry derives them from type + config.

export const WORKFLOW_SCHEMA_VERSION = 1;

export const NODE_TYPES = ["input", "rewrite", "rag", "condition", "merge", "llm", "output"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// Node types that call the LLM or embeddings (capped per workflow by the validator)
export const AI_NODE_TYPES: readonly NodeType[] = ["rewrite", "rag", "llm"];

// No regex on purpose: user-supplied patterns are a ReDoS risk
export const CONDITION_OPERATORS = ["contains", "equals", "length_gt"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const MERGE_MODES = ["first_active", "concat_documents", "join_strings"] as const;
export type MergeMode = (typeof MERGE_MODES)[number];

// Branch name reserved for the fallback port of a condition node
export const ELSE_BRANCH = "else";

export interface InputNodeConfig {
  description?: string;
}

export interface RewriteNodeConfig {
  // Template; may only read {{inputs.<port>}} of this node
  instruction: string;
}

export interface RagNodeConfig {
  topK: number;
  minScore?: number;
  // Restrict retrieval to these documents of the project; all documents when omitted
  documentIds?: string[];
}

export interface ConditionBranch {
  name: string;
  operator: ConditionOperator;
  value: string;
}

export interface ConditionNodeConfig {
  // Evaluated in order; the first match wins, otherwise the `else` branch
  branches: ConditionBranch[];
}

export interface MergeNodeConfig {
  mode: MergeMode;
  // Used by join_strings
  separator?: string;
}

export interface LlmNodeConfig {
  // Templates; may only read {{inputs.<port>}} of this node
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export type OutputNodeConfig = Record<string, never>;

export interface NodeConfigByType {
  input: InputNodeConfig;
  rewrite: RewriteNodeConfig;
  rag: RagNodeConfig;
  condition: ConditionNodeConfig;
  merge: MergeNodeConfig;
  llm: LlmNodeConfig;
  output: OutputNodeConfig;
}

export type WorkflowNodeOf<T extends NodeType> = { id: string; type: T; config: NodeConfigByType[T] };
// Discriminated union: narrowing on `type` narrows `config`
export type WorkflowNode = { [T in NodeType]: WorkflowNodeOf<T> }[NodeType];

// Edges are the single source of truth for execution order and data flow
export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
}

export interface WorkflowGraph {
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// Canvas-only state; never read by the runtime and excluded from graphHash
export interface WorkflowUi {
  positions: Record<string, { x: number; y: number }>;
  labels: Record<string, string>;
  viewport: { x: number; y: number; zoom: number };
}

export interface WorkflowDocument {
  graph: WorkflowGraph;
  ui: WorkflowUi;
}
