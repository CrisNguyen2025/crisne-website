import { create } from "zustand";
import type {
  ConditionBranch,
  NodeType,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowUi,
} from "./dsl-types";
import { ELSE_BRANCH } from "./dsl-types";
import { validateWorkflowGraph, type ValidationError } from "./dsl-validator";
import { NODE_LABELS } from "./node-registry";
import { isValidConnection, type ConnectionCandidate } from "./canvas-mapping";
import type { RunDetail } from "./run-service";

export interface CanvasState {
  graph: WorkflowGraph;
  ui: WorkflowUi;
  errors: ValidationError[];
  selectedNodeId: string | null;
  lastRun: RunDetail | null;
  saveState: "idle" | "saving" | "saved" | "error";

  initialize: (graph: WorkflowGraph, ui: WorkflowUi, errors?: ValidationError[]) => void;
  selectNode: (nodeId: string | null) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  updateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  connect: (candidate: ConnectionCandidate) => boolean;
  removeElements: (nodeIds: string[], edgeIds: string[]) => void;
  setLastRun: (run: RunDetail | null) => void;
  setSaveState: (state: "idle" | "saving" | "saved" | "error") => void;
  setErrors: (errors: ValidationError[]) => void;
}

function getDefaultConfig(type: NodeType): WorkflowNode["config"] {
  switch (type) {
    case "input":
      return { description: "User input query" };
    case "rewrite":
      return { instruction: "Rewrite this question to be clear and self-contained." };
    case "rag":
      return { topK: 4, minScore: 0.0 };
    case "condition":
      return { branches: [{ name: "greeting", operator: "contains", value: "hello" }] };
    case "merge":
      return { mode: "first_active" };
    case "llm":
      return {
        prompt: "Respond to: {{inputs.question}}",
        system: "You are a helpful assistant.",
        temperature: 0.3,
        maxOutputTokens: 1024,
      };
    case "output":
      return {};
  }
}

function generateNodeId(type: NodeType, existingNodes: WorkflowNode[]): string {
  let counter = 1;
  while (existingNodes.some((n) => n.id === `${type}-${counter}`)) {
    counter++;
  }
  return `${type}-${counter}`;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  graph: { schemaVersion: 1, nodes: [], edges: [] },
  ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
  errors: [],
  selectedNodeId: null,
  lastRun: null,
  saveState: "idle",

  initialize: (graph, ui, initialErrors) => {
    const validation = validateWorkflowGraph(graph);
    set({
      graph,
      ui,
      errors: initialErrors ?? (validation.ok ? [] : validation.errors),
      selectedNodeId: null,
      lastRun: null,
      saveState: "idle",
    });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  addNode: (type, position) => {
    const { graph, ui } = get();
    const id = generateNodeId(type, graph.nodes);
    const config = getDefaultConfig(type);

    const newNode: WorkflowNode = { id, type, config } as WorkflowNode;
    const newGraph: WorkflowGraph = {
      ...graph,
      nodes: [...graph.nodes, newNode],
    };

    const newUi: WorkflowUi = {
      ...ui,
      positions: { ...ui.positions, [id]: position },
      labels: { ...ui.labels, [id]: NODE_LABELS[type] },
    };

    const validation = validateWorkflowGraph(newGraph);
    set({
      graph: newGraph,
      ui: newUi,
      errors: validation.ok ? [] : validation.errors,
      selectedNodeId: id,
    });

    return id;
  },

  updateConfig: (nodeId, partialConfig) => {
    const { graph } = get();
    const targetNode = graph.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const mergedConfig = { ...targetNode.config, ...partialConfig };
    let newEdges = [...graph.edges];

    // If condition branches changed, remove edges pointing to branches that no longer exist
    if (targetNode.type === "condition" && "branches" in mergedConfig) {
      const branches = (mergedConfig as { branches: ConditionBranch[] }).branches ?? [];
      const validPorts = new Set([...branches.map((b) => b.name), ELSE_BRANCH]);

      newEdges = newEdges.filter((e) => {
        if (e.sourceNodeId === nodeId) {
          return validPorts.has(e.sourcePort);
        }
        return true;
      });
    }

    const newNodes = graph.nodes.map((n) =>
      n.id === nodeId ? ({ ...n, config: mergedConfig } as WorkflowNode) : n
    );

    const newGraph: WorkflowGraph = {
      ...graph,
      nodes: newNodes,
      edges: newEdges,
    };

    const validation = validateWorkflowGraph(newGraph);
    set({
      graph: newGraph,
      errors: validation.ok ? [] : validation.errors,
    });
  },

  moveNode: (nodeId, position) => {
    const { ui } = get();
    // Only updates ui, graph remains identical!
    set({
      ui: {
        ...ui,
        positions: {
          ...ui.positions,
          [nodeId]: position,
        },
      },
    });
  },

  setViewport: (viewport) => {
    const { ui } = get();
    set({
      ui: {
        ...ui,
        viewport,
      },
    });
  },

  connect: (candidate) => {
    const { graph } = get();
    const valid = isValidConnection(candidate, graph.nodes, graph.edges);
    if (!valid) return false;

    const edgeId = `e-${candidate.source}-${candidate.sourceHandle ?? "out"}-${candidate.target}-${candidate.targetHandle ?? "in"}`;
    // Deduplicate identical edge
    if (graph.edges.some((e) => e.id === edgeId)) return false;

    const newEdge: WorkflowEdge = {
      id: edgeId,
      sourceNodeId: candidate.source,
      sourcePort: candidate.sourceHandle ?? "default",
      targetNodeId: candidate.target,
      targetPort: candidate.targetHandle ?? "default",
    };

    const newGraph: WorkflowGraph = {
      ...graph,
      edges: [...graph.edges, newEdge],
    };

    const validation = validateWorkflowGraph(newGraph);
    set({
      graph: newGraph,
      errors: validation.ok ? [] : validation.errors,
    });

    return true;
  },

  removeElements: (nodeIds, edgeIds) => {
    const { graph, ui, selectedNodeId } = get();

    // Input node cannot be deleted
    const filteredNodeIds = new Set(
      nodeIds.filter((id) => {
        const node = graph.nodes.find((n) => n.id === id);
        return node && node.type !== "input";
      })
    );

    const targetEdgeIds = new Set(edgeIds);

    // Filter nodes
    const remainingNodes = graph.nodes.filter((n) => !filteredNodeIds.has(n.id));

    // Filter edges: explicitly deleted OR connected to deleted nodes
    const remainingEdges = graph.edges.filter(
      (e) =>
        !targetEdgeIds.has(e.id) &&
        !filteredNodeIds.has(e.sourceNodeId) &&
        !filteredNodeIds.has(e.targetNodeId)
    );

    const newPositions = { ...ui.positions };
    const newLabels = { ...ui.labels };
    for (const id of filteredNodeIds) {
      delete newPositions[id];
      delete newLabels[id];
    }

    const newGraph: WorkflowGraph = {
      ...graph,
      nodes: remainingNodes,
      edges: remainingEdges,
    };

    const newUi: WorkflowUi = {
      ...ui,
      positions: newPositions,
      labels: newLabels,
    };

    const validation = validateWorkflowGraph(newGraph);
    set({
      graph: newGraph,
      ui: newUi,
      errors: validation.ok ? [] : validation.errors,
      selectedNodeId: filteredNodeIds.has(selectedNodeId ?? "") ? null : selectedNodeId,
    });
  },

  setLastRun: (run) => set({ lastRun: run }),
  setSaveState: (saveState) => set({ saveState }),
  setErrors: (errors) => set({ errors }),
}));
