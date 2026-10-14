import {
  AI_NODE_TYPES,
  CONDITION_OPERATORS,
  ELSE_BRANCH,
  MERGE_MODES,
  NODE_TYPES,
  WORKFLOW_SCHEMA_VERSION,
  type NodeType,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "./dsl-types";
import { resolveNodePorts, type PortDefinition } from "./node-registry";

// Rules from docs/workflow-builder-design.md §3.2. Runs on the server: the input is untrusted JSON.

export const MAX_NODES = 25;
export const MAX_AI_NODES = 10;
export const MAX_TEMPLATE_LENGTH = 8000;
export const MAX_RAG_TOP_K = 20;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BRANCH_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const PLACEHOLDER_PATTERN = /\{\{\s*(.*?)\s*\}\}/g;
const INPUT_REFERENCE_PATTERN = /^inputs\.([A-Za-z0-9_]+)$/;

export type ValidationCode =
  | "INVALID_SHAPE"
  | "TOO_MANY_NODES"
  | "TOO_MANY_AI_NODES"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "EDGE_UNKNOWN_NODE"
  | "CYCLE"
  | "INPUT_COUNT"
  | "OUTPUT_MISSING"
  | "UNREACHABLE_NODE"
  | "UNKNOWN_PORT"
  | "PORT_TYPE_MISMATCH"
  | "TOO_MANY_EDGES"
  | "MERGE_TOO_FEW_INPUTS"
  | "REQUIRED_PORT_UNCONNECTED"
  | "INVALID_BRANCH_NAME"
  | "DUPLICATE_BRANCH_NAME"
  | "CONDITION_NO_OUTGOING_EDGE"
  | "INVALID_TEMPLATE_REFERENCE";

export interface ValidationError {
  code: ValidationCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  // CYCLE: every node on a cycle
  nodeIds?: string[];
  // INVALID_SHAPE: JSON path of the bad value, e.g. "nodes[2].config.topK"
  path?: string;
}

export type ValidationResult = { ok: true; graph: WorkflowGraph } | { ok: false; errors: ValidationError[] };

// ---------- Shape: untrusted JSON → WorkflowGraph ----------

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function checkShape(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: string, message: string) => errors.push({ code: "INVALID_SHAPE", path, message });

  if (!isObject(raw)) {
    fail("", "Graph must be an object.");
    return errors;
  }
  if (raw.schemaVersion !== WORKFLOW_SCHEMA_VERSION) fail("schemaVersion", `schemaVersion must be ${WORKFLOW_SCHEMA_VERSION}.`);
  if (!Array.isArray(raw.nodes)) fail("nodes", "nodes must be an array.");
  if (!Array.isArray(raw.edges)) fail("edges", "edges must be an array.");
  if (errors.length) return errors;

  (raw.nodes as unknown[]).forEach((node, i) => {
    const at = `nodes[${i}]`;
    if (!isObject(node)) return fail(at, "Node must be an object.");
    if (!isString(node.id) || !ID_PATTERN.test(node.id)) fail(`${at}.id`, "Node id must be 1-64 letters, digits, _ or -.");
    if (!NODE_TYPES.includes(node.type as NodeType)) return fail(`${at}.type`, `Unknown node type "${String(node.type)}".`);
    if (!isObject(node.config)) return fail(`${at}.config`, "config must be an object.");
    checkConfig(node.type as NodeType, node.config, `${at}.config`, fail);
  });

  (raw.edges as unknown[]).forEach((edge, i) => {
    const at = `edges[${i}]`;
    if (!isObject(edge)) return fail(at, "Edge must be an object.");
    if (!isString(edge.id) || !ID_PATTERN.test(edge.id)) fail(`${at}.id`, "Edge id must be 1-64 letters, digits, _ or -.");
    for (const key of ["sourceNodeId", "sourcePort", "targetNodeId", "targetPort"] as const) {
      if (!isString(edge[key]) || !edge[key]) fail(`${at}.${key}`, `${key} must be a non-empty string.`);
    }
  });
  return errors;
}

function checkConfig(type: NodeType, config: Raw, at: string, fail: (path: string, message: string) => void) {
  const template = (key: string, required: boolean) => {
    const value = config[key];
    if (value === undefined && !required) return;
    if (!isString(value)) return fail(`${at}.${key}`, `${key} must be a string.`);
    if (value.length > MAX_TEMPLATE_LENGTH) fail(`${at}.${key}`, `${key} is longer than ${MAX_TEMPLATE_LENGTH} characters.`);
  };

  switch (type) {
    case "input":
      if (config.description !== undefined && !isString(config.description)) fail(`${at}.description`, "description must be a string.");
      return;
    case "rewrite":
      return template("instruction", true);
    case "rag":
      if (!Number.isInteger(config.topK) || (config.topK as number) < 1 || (config.topK as number) > MAX_RAG_TOP_K) {
        fail(`${at}.topK`, `topK must be an integer from 1 to ${MAX_RAG_TOP_K}.`);
      }
      if (config.minScore !== undefined && (!isNumber(config.minScore) || config.minScore < 0 || config.minScore > 1)) {
        fail(`${at}.minScore`, "minScore must be a number from 0 to 1.");
      }
      if (config.documentIds !== undefined && (!Array.isArray(config.documentIds) || !config.documentIds.every(isString))) {
        fail(`${at}.documentIds`, "documentIds must be an array of strings.");
      }
      return;
    case "condition":
      if (!Array.isArray(config.branches)) return fail(`${at}.branches`, "branches must be an array.");
      config.branches.forEach((branch, i) => {
        const b = `${at}.branches[${i}]`;
        if (!isObject(branch)) return fail(b, "Branch must be an object.");
        if (!isString(branch.name)) fail(`${b}.name`, "name must be a string.");
        if (!CONDITION_OPERATORS.includes(branch.operator as never)) {
          fail(`${b}.operator`, `operator must be one of ${CONDITION_OPERATORS.join(", ")}.`);
        }
        if (!isString(branch.value)) fail(`${b}.value`, "value must be a string.");
        else if (branch.operator === "length_gt" && !/^\d+$/.test(branch.value)) {
          fail(`${b}.value`, "length_gt needs a whole number.");
        }
      });
      return;
    case "merge":
      if (!MERGE_MODES.includes(config.mode as never)) fail(`${at}.mode`, `mode must be one of ${MERGE_MODES.join(", ")}.`);
      if (config.separator !== undefined && !isString(config.separator)) fail(`${at}.separator`, "separator must be a string.");
      return;
    case "llm":
      template("prompt", true);
      template("system", false);
      if (config.temperature !== undefined && (!isNumber(config.temperature) || config.temperature < 0 || config.temperature > 2)) {
        fail(`${at}.temperature`, "temperature must be a number from 0 to 2.");
      }
      if (
        config.maxOutputTokens !== undefined &&
        (!Number.isInteger(config.maxOutputTokens) || (config.maxOutputTokens as number) < 1)
      ) {
        fail(`${at}.maxOutputTokens`, "maxOutputTokens must be a positive integer.");
      }
      return;
    case "output":
      return;
  }
}

// ---------- Graph rules ----------

/** Nodes on a cycle: Kahn from the sources, then peel sinks off what is left. */
export function findCycleNodes(nodeIds: string[], edges: Pick<WorkflowEdge, "sourceNodeId" | "targetNodeId">[]): string[] {
  const remaining = new Set(nodeIds);
  const peel = (degreeOf: (id: string) => number, neighbours: (id: string) => string[]) => {
    const queue = [...remaining].filter((id) => degreeOf(id) === 0);
    const degree = new Map([...remaining].map((id) => [id, degreeOf(id)]));
    while (queue.length) {
      const id = queue.pop()!;
      remaining.delete(id);
      for (const next of neighbours(id)) {
        if (!remaining.has(next)) continue;
        degree.set(next, degree.get(next)! - 1);
        if (degree.get(next) === 0) queue.push(next);
      }
    }
  };
  const live = () => edges.filter((e) => remaining.has(e.sourceNodeId) && remaining.has(e.targetNodeId));

  // Kahn: drop everything reachable without passing through a cycle
  let current = live();
  peel(
    (id) => current.filter((e) => e.targetNodeId === id).length,
    (id) => current.filter((e) => e.sourceNodeId === id).map((e) => e.targetNodeId)
  );
  // Reverse: drop nodes that only hang off a cycle downstream
  current = live();
  peel(
    (id) => current.filter((e) => e.sourceNodeId === id).length,
    (id) => current.filter((e) => e.targetNodeId === id).map((e) => e.sourceNodeId)
  );
  return nodeIds.filter((id) => remaining.has(id));
}

function reachable(start: string[], next: (id: string) => string[]): Set<string> {
  const seen = new Set(start);
  const stack = [...start];
  while (stack.length) {
    for (const n of next(stack.pop()!)) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

function templatesOf(node: WorkflowNode): [string, string][] {
  if (node.type === "rewrite") return [["instruction", node.config.instruction]];
  if (node.type === "llm") {
    return [["prompt", node.config.prompt], ...(node.config.system ? [["system", node.config.system] as [string, string]] : [])];
  }
  return [];
}

/**
 * Validates untrusted JSON as a WorkflowGraph. Collects every error it can find, so the
 * canvas can mark all problems at once; graph rules only run once the shape is sound.
 */
export function validateWorkflowGraph(raw: unknown): ValidationResult {
  const shapeErrors = checkShape(raw);
  if (shapeErrors.length) return { ok: false, errors: shapeErrors };

  const graph = raw as WorkflowGraph;
  const errors: ValidationError[] = [];

  // 1. Size
  if (graph.nodes.length > MAX_NODES) {
    errors.push({ code: "TOO_MANY_NODES", message: `A workflow can have at most ${MAX_NODES} nodes.` });
  }
  const aiNodes = graph.nodes.filter((n) => AI_NODE_TYPES.includes(n.type)).length;
  if (aiNodes > MAX_AI_NODES) {
    errors.push({ code: "TOO_MANY_AI_NODES", message: `A workflow can have at most ${MAX_AI_NODES} AI nodes (rewrite, rag, llm).` });
  }

  // 2. Unique ids, edges point at existing nodes
  const nodesById = new Map<string, WorkflowNode>();
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      errors.push({ code: "DUPLICATE_NODE_ID", nodeId: node.id, message: `Node id "${node.id}" is used more than once.` });
    } else {
      nodesById.set(node.id, node);
    }
  }
  const edgeIds = new Set<string>();
  const edges: WorkflowEdge[] = [];
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({ code: "DUPLICATE_EDGE_ID", edgeId: edge.id, message: `Edge id "${edge.id}" is used more than once.` });
      continue;
    }
    edgeIds.add(edge.id);
    const missing = [edge.sourceNodeId, edge.targetNodeId].filter((id) => !nodesById.has(id));
    if (missing.length) {
      errors.push({ code: "EDGE_UNKNOWN_NODE", edgeId: edge.id, message: `Edge "${edge.id}" points at unknown node "${missing[0]}".` });
      continue;
    }
    // Later rules only see edges between known nodes
    edges.push(edge);
  }

  // 3. No cycles
  const cycle = findCycleNodes([...nodesById.keys()], edges);
  if (cycle.length) {
    errors.push({ code: "CYCLE", nodeIds: cycle, message: `The workflow has a cycle through: ${cycle.join(", ")}.` });
  }

  // 4. Exactly one input, at least one output, every node on an input → output path
  const inputs = graph.nodes.filter((n) => n.type === "input");
  const outputs = graph.nodes.filter((n) => n.type === "output");
  if (inputs.length !== 1) {
    errors.push({ code: "INPUT_COUNT", message: `A workflow needs exactly one input node (found ${inputs.length}).` });
  }
  if (outputs.length === 0) {
    errors.push({ code: "OUTPUT_MISSING", message: "A workflow needs at least one output node." });
  }
  if (inputs.length === 1 && outputs.length > 0) {
    const fromInput = reachable([inputs[0].id], (id) => edges.filter((e) => e.sourceNodeId === id).map((e) => e.targetNodeId));
    const toOutput = reachable(outputs.map((n) => n.id), (id) => edges.filter((e) => e.targetNodeId === id).map((e) => e.sourceNodeId));
    for (const id of nodesById.keys()) {
      if (!fromInput.has(id) || !toOutput.has(id)) {
        errors.push({
          code: "UNREACHABLE_NODE",
          nodeId: id,
          message: !fromInput.has(id) ? `Node "${id}" cannot be reached from the input.` : `Node "${id}" does not lead to an output.`,
        });
      }
    }
  }

  // 5. Ports exist and types match
  const portsById = new Map([...nodesById].map(([id, node]) => [id, resolveNodePorts(node)]));
  const incoming = new Map<string, WorkflowEdge[]>(); // key: nodeId + port
  const portKey = (nodeId: string, port: string) => `${nodeId}\u0000${port}`;
  for (const edge of edges) {
    const source = portsById.get(edge.sourceNodeId)!.outputs.find((p) => p.name === edge.sourcePort);
    const target = portsById.get(edge.targetNodeId)!.inputs.find((p) => p.name === edge.targetPort);
    if (!source || !target) {
      const [nodeId, port, side] = !source
        ? [edge.sourceNodeId, edge.sourcePort, "output"]
        : [edge.targetNodeId, edge.targetPort, "input"];
      errors.push({ code: "UNKNOWN_PORT", edgeId: edge.id, nodeId, message: `Node "${nodeId}" has no ${side} port "${port}".` });
      continue;
    }
    if (source.type !== target.type) {
      errors.push({
        code: "PORT_TYPE_MISMATCH",
        edgeId: edge.id,
        message: `Edge "${edge.id}" connects ${source.type} to ${target.type}.`,
      });
    }
    const key = portKey(edge.targetNodeId, edge.targetPort);
    incoming.set(key, [...(incoming.get(key) ?? []), edge]);
  }

  for (const [nodeId, node] of nodesById) {
    const ports = portsById.get(nodeId)!;
    const edgesInto = (port: PortDefinition) => incoming.get(portKey(nodeId, port.name)) ?? [];

    for (const port of ports.inputs) {
      const count = edgesInto(port).length;
      // 6. Single-edge ports; merge needs something to merge
      if (!port.allowMultiple && count > 1) {
        errors.push({ code: "TOO_MANY_EDGES", nodeId, message: `Input "${port.name}" of "${nodeId}" accepts one edge (has ${count}).` });
      }
      if (node.type === "merge" && port.name === "items" && count < 2) {
        errors.push({ code: "MERGE_TOO_FEW_INPUTS", nodeId, message: `Merge "${nodeId}" needs at least 2 incoming edges (has ${count}).` });
      }
      // 7. Required ports are connected
      if (port.required && count === 0) {
        errors.push({ code: "REQUIRED_PORT_UNCONNECTED", nodeId, message: `Input "${port.name}" of "${nodeId}" is not connected.` });
      }
    }

    // 8. Condition branches
    if (node.type === "condition") {
      const seen = new Set<string>();
      for (const { name } of node.config.branches) {
        if (!BRANCH_NAME_PATTERN.test(name) || name === ELSE_BRANCH) {
          errors.push({
            code: "INVALID_BRANCH_NAME",
            nodeId,
            message: name === ELSE_BRANCH ? `"${ELSE_BRANCH}" is reserved for the fallback branch.` : `Branch name "${name}" must start with a letter and use letters, digits or _ (max 32).`,
          });
        } else if (seen.has(name)) {
          errors.push({ code: "DUPLICATE_BRANCH_NAME", nodeId, message: `Branch "${name}" is defined more than once.` });
        }
        seen.add(name);
      }
      if (!edges.some((e) => e.sourceNodeId === nodeId)) {
        errors.push({ code: "CONDITION_NO_OUTGOING_EDGE", nodeId, message: `Condition "${nodeId}" has no outgoing edge.` });
      }
    }

    // 9. Templates only read connected inputs of this node
    for (const [field, text] of templatesOf(node)) {
      for (const [, expression] of text.matchAll(PLACEHOLDER_PATTERN)) {
        const port = INPUT_REFERENCE_PATTERN.exec(expression)?.[1];
        const definition = port ? ports.inputs.find((p) => p.name === port) : undefined;
        if (!definition || edgesInto(definition).length === 0) {
          errors.push({
            code: "INVALID_TEMPLATE_REFERENCE",
            nodeId,
            message: !definition
              ? `{{${expression}}} in ${field} of "${nodeId}" is not an input of this node (use {{inputs.<port>}}).`
              : `{{${expression}}} in ${field} of "${nodeId}" reads an input that has no edge.`,
          });
        }
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, graph };
}
