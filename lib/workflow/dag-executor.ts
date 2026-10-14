import type { NodeType, WorkflowGraph, WorkflowNode, WorkflowNodeOf } from "./dsl-types";
import { resolveNodePorts } from "./node-registry";

// Execution semantics from docs/workflow-builder-design.md §3.3.
// Pure: no Next.js, DB or Langfuse imports. Callers persist and trace through the hooks.

export interface RetrievedDocument {
  id: string;
  content: string;
  score: number;
  documentId?: string;
  heading?: string;
}

// What travels along an edge: a text port carries a string, a documents port a list
export type PortValue = string | RetrievedDocument[];

export type NodeInputs = Record<string, PortValue | PortValue[] | undefined>;

export interface NodeUsage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface NodeHandlerResult {
  // Ports missing from this object emit SKIPPED (a condition returns only the chosen branch)
  outputs: Record<string, PortValue>;
  usage?: NodeUsage;
}

export interface NodeHandlerContext {
  runInput: Record<string, string>;
  // Aborted when the node times out; handlers that support it can stop early
  signal: AbortSignal;
}

export type NodeHandler<T extends NodeType = NodeType> = (
  node: WorkflowNodeOf<T>,
  inputs: NodeInputs,
  context: NodeHandlerContext
) => Promise<NodeHandlerResult>;

export type NodeHandlers = { [T in NodeType]: NodeHandler<T> };

export type NodeStatus = "SUCCEEDED" | "SKIPPED" | "FAILED" | "CANCELLED";
export type RunStatus = "SUCCEEDED" | "FAILED";

export interface NodeResult {
  nodeId: string;
  nodeType: NodeType;
  status: NodeStatus;
  inputs?: NodeInputs;
  outputs?: Record<string, PortValue>;
  usage?: NodeUsage;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
}

export interface ExecuteWorkflowDeps {
  handlers: NodeHandlers;
  // Per-node timeout; v1 stops waiting but cannot cancel the provider request (phase 4)
  nodeTimeoutMs?: number;
  onNodeStart?: (node: WorkflowNode, inputs: NodeInputs) => void | Promise<void>;
  onNodeFinish?: (node: WorkflowNode, result: NodeResult) => void | Promise<void>;
  now?: () => Date;
}

export interface WorkflowRunResult {
  status: RunStatus;
  // Keyed by output node id; outputs on a skipped branch are absent
  outputs: Record<string, PortValue>;
  // In execution order
  nodes: NodeResult[];
  error?: { nodeId: string; message: string };
}

export const DEFAULT_NODE_TIMEOUT_MS = 60_000;

export class NodeTimeoutError extends Error {
  constructor(nodeId: string, timeoutMs: number) {
    super(`Node "${nodeId}" timed out after ${timeoutMs} ms.`);
    this.name = "NodeTimeoutError";
  }
}

type EdgeState = { state: "PENDING" } | { state: "SKIPPED" } | { state: "ACTIVE"; value: PortValue };

/** Topological order (Kahn), ties broken by the order nodes appear in the graph. */
export function topologicalOrder(graph: WorkflowGraph): WorkflowNode[] {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indegree.set(e.targetNodeId, (indegree.get(e.targetNodeId) ?? 0) + 1);
  const ready = graph.nodes.filter((n) => indegree.get(n.id) === 0);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const order: WorkflowNode[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    order.push(node);
    for (const e of graph.edges.filter((edge) => edge.sourceNodeId === node.id)) {
      indegree.set(e.targetNodeId, indegree.get(e.targetNodeId)! - 1);
      if (indegree.get(e.targetNodeId) === 0) ready.push(byId.get(e.targetNodeId)!);
    }
  }
  if (order.length !== graph.nodes.length) throw new Error("Graph has a cycle; validate it before executing.");
  return order;
}

async function withTimeout<T>(nodeId: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new NodeTimeoutError(nodeId, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs a validated graph. Nodes run one at a time in topological order, so by the time a
 * node is reached every incoming edge is ACTIVE or SKIPPED:
 * - a node runs when each required input has at least one ACTIVE edge, otherwise it is
 *   SKIPPED and every outgoing edge becomes SKIPPED;
 * - an output port the handler leaves out is SKIPPED (how a condition picks its branch);
 * - the first failure stops the run: that node is FAILED, the ones not yet run CANCELLED.
 */
export async function executeWorkflow(
  graph: WorkflowGraph,
  runInput: Record<string, string>,
  deps: ExecuteWorkflowDeps
): Promise<WorkflowRunResult> {
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.nodeTimeoutMs ?? DEFAULT_NODE_TIMEOUT_MS;
  const edgeStates = new Map<string, EdgeState>(graph.edges.map((e) => [e.id, { state: "PENDING" }]));
  const incoming = (nodeId: string) => graph.edges.filter((e) => e.targetNodeId === nodeId);
  const outgoing = (nodeId: string) => graph.edges.filter((e) => e.sourceNodeId === nodeId);

  const results: NodeResult[] = [];
  const outputs: Record<string, PortValue> = {};
  let failure: WorkflowRunResult["error"];

  const finish = async (node: WorkflowNode, result: NodeResult) => {
    results.push(result);
    await deps.onNodeFinish?.(node, result);
  };
  const skipOutgoing = (nodeId: string) => outgoing(nodeId).forEach((e) => edgeStates.set(e.id, { state: "SKIPPED" }));

  for (const node of topologicalOrder(graph)) {
    if (failure) {
      await finish(node, { nodeId: node.id, nodeType: node.type, status: "CANCELLED" });
      continue;
    }

    const ports = resolveNodePorts(node);
    const activeInto = (port: string) =>
      incoming(node.id)
        .filter((e) => e.targetPort === port)
        .map((e) => edgeStates.get(e.id)!)
        .filter((s): s is Extract<EdgeState, { state: "ACTIVE" }> => s.state === "ACTIVE");

    if (ports.inputs.some((port) => port.required && activeInto(port.name).length === 0)) {
      skipOutgoing(node.id);
      await finish(node, { nodeId: node.id, nodeType: node.type, status: "SKIPPED" });
      continue;
    }

    const inputs: NodeInputs = {};
    for (const port of ports.inputs) {
      const values = activeInto(port.name).map((s) => s.value);
      // Multi-edge ports always get a list (merge sees only the branches that ran)
      inputs[port.name] = port.allowMultiple ? values : values[0];
    }

    const startedAt = now();
    await deps.onNodeStart?.(node, inputs);
    try {
      const handler = deps.handlers[node.type] as NodeHandler;
      const result = await withTimeout(node.id, timeoutMs, (signal) => handler(node, inputs, { runInput, signal }));
      for (const edge of outgoing(node.id)) {
        const value = result.outputs[edge.sourcePort];
        edgeStates.set(edge.id, value === undefined ? { state: "SKIPPED" } : { state: "ACTIVE", value });
      }
      if (node.type === "output" && inputs.value !== undefined) outputs[node.id] = inputs.value as PortValue;

      const finishedAt = now();
      await finish(node, {
        nodeId: node.id,
        nodeType: node.type,
        status: "SUCCEEDED",
        inputs,
        outputs: result.outputs,
        usage: result.usage,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failure = { nodeId: node.id, message };
      skipOutgoing(node.id);
      const finishedAt = now();
      await finish(node, {
        nodeId: node.id,
        nodeType: node.type,
        status: "FAILED",
        inputs,
        error: message,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
    }
  }

  return failure
    ? { status: "FAILED", outputs, nodes: results, error: failure }
    : { status: "SUCCEEDED", outputs, nodes: results };
}
