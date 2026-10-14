import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  NodeType,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowUi,
} from "./dsl-types";
import { resolveNodePorts } from "./node-registry";

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  config: WorkflowNode["config"];
}

export type CanvasFlowNode = Node<WorkflowNodeData>;
export type CanvasFlowEdge = Edge;

export interface FlowRepresentation {
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
  viewport: Viewport;
}

/**
 * Converts a backend DSL graph and UI layout into React Flow nodes and edges.
 */
export function toFlow(graph: WorkflowGraph, ui: WorkflowUi): FlowRepresentation {
  const flowNodes: CanvasFlowNode[] = graph.nodes.map((node) => {
    const position = ui.positions[node.id] ?? { x: 100, y: 100 };
    const label = ui.labels[node.id] ?? node.id;

    return {
      id: node.id,
      type: node.type,
      position,
      data: {
        label,
        nodeType: node.type,
        config: node.config,
      },
    };
  });

  const flowEdges: CanvasFlowEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePort,
    target: edge.targetNodeId,
    targetHandle: edge.targetPort,
  }));

  const viewport = ui.viewport ?? { x: 0, y: 0, zoom: 1 };

  return {
    nodes: flowNodes,
    edges: flowEdges,
    viewport,
  };
}

/**
 * Reconstructs the backend DSL graph and UI layout from React Flow nodes and edges.
 */
export function fromFlow(
  flowNodes: CanvasFlowNode[],
  flowEdges: CanvasFlowEdge[],
  viewport: Viewport
): { graph: WorkflowGraph; ui: WorkflowUi } {
  const graphNodes = flowNodes.map((fn) => ({
    id: fn.id,
    type: (fn.data?.nodeType ?? fn.type) as NodeType,
    config: (fn.data?.config ?? {}) as WorkflowNode["config"],
  })) as WorkflowNode[];

  const graphEdges: WorkflowEdge[] = flowEdges.map((fe) => ({
    id: fe.id,
    sourceNodeId: fe.source,
    sourcePort: fe.sourceHandle ?? "default",
    targetNodeId: fe.target,
    targetPort: fe.targetHandle ?? "default",
  }));

  const positions: Record<string, { x: number; y: number }> = {};
  const labels: Record<string, string> = {};

  for (const fn of flowNodes) {
    positions[fn.id] = { x: fn.position.x, y: fn.position.y };
    if (fn.data?.label) {
      labels[fn.id] = fn.data.label;
    }
  }

  const graph: WorkflowGraph = {
    schemaVersion: 1,
    nodes: graphNodes,
    edges: graphEdges,
  };

  const ui: WorkflowUi = {
    positions,
    labels,
    viewport,
  };

  return { graph, ui };
}

export interface ConnectionCandidate {
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}

/**
 * Validates a proposed connection before adding an edge.
 * Prevents:
 * 1. Self connections (source === target)
 * 2. Missing handles or unknown ports
 * 3. Type mismatches between source output and target input
 * 4. Exceeding single-edge capacity on target ports
 * 5. Creating cycles in the DAG
 */
export function isValidConnection(
  connection: ConnectionCandidate,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): boolean {
  const { source, sourceHandle, target, targetHandle } = connection;
  if (!source || !target || source === target) return false;

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  if (!sourceNode || !targetNode) return false;

  const sourcePorts = resolveNodePorts(sourceNode);
  const targetPorts = resolveNodePorts(targetNode);

  const outPort = sourcePorts.outputs.find((p) => p.name === sourceHandle);
  const inPort = targetPorts.inputs.find((p) => p.name === targetHandle);
  if (!outPort || !inPort) return false;

  // 1. Port types must match
  if (outPort.type !== inPort.type) return false;

  // 2. Target port allowMultiple check
  if (!inPort.allowMultiple) {
    const existingEdgesIntoPort = edges.filter(
      (e) => e.targetNodeId === target && e.targetPort === inPort.name
    );
    if (existingEdgesIntoPort.length >= 1) {
      return false;
    }
  }

  // 3. Cycle check: does a path already exist from target to source?
  const visited = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return false; // Cycle detected
    if (!visited.has(current)) {
      visited.add(current);
      for (const e of edges) {
        if (e.sourceNodeId === current && !visited.has(e.targetNodeId)) {
          queue.push(e.targetNodeId);
        }
      }
    }
  }

  return true;
}
