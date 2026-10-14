import { describe, expect, it } from "vitest";
import { fromFlow, isValidConnection, toFlow } from "@/lib/workflow/canvas-mapping";
import { graphHash } from "@/lib/workflow/graph-hash";
import { SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI } from "@/scripts/seed-sample-workflow";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import type { WorkflowGraph } from "@/lib/workflow/dsl-types";

describe("canvas-mapping", () => {
  it("round-trip toFlow → fromFlow preserves graphHash", () => {
    const originalHash = graphHash(SAMPLE_WORKFLOW_GRAPH);
    const flow = toFlow(SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI);
    const roundTrip = fromFlow(flow.nodes, flow.edges, flow.viewport);

    expect(graphHash(roundTrip.graph)).toBe(originalHash);
    expect(roundTrip.ui.positions["input-1"]).toEqual(SAMPLE_WORKFLOW_UI.positions["input-1"]);
  });

  it("moving a node only changes ui, leaving graph and graphHash identical", () => {
    const originalHash = graphHash(SAMPLE_WORKFLOW_GRAPH);
    const flow = toFlow(SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI);

    // Change node position
    flow.nodes[0].position = { x: 999, y: 888 };

    const roundTrip = fromFlow(flow.nodes, flow.edges, flow.viewport);

    expect(graphHash(roundTrip.graph)).toBe(originalHash);
    expect(roundTrip.ui.positions[flow.nodes[0].id]).toEqual({ x: 999, y: 888 });
  });
});

describe("isValidConnection", () => {
  const sampleNodes = SAMPLE_WORKFLOW_GRAPH.nodes;
  const sampleEdges = SAMPLE_WORKFLOW_GRAPH.edges;

  it("blocks self connections", () => {
    const valid = isValidConnection(
      { source: "input-1", sourceHandle: "query", target: "input-1", targetHandle: "query" },
      sampleNodes,
      sampleEdges
    );
    expect(valid).toBe(false);
  });

  it("blocks type mismatch between ports (text vs documents)", () => {
    // llm-1 output 'text' (type: text) into a documents port or vice versa
    // Let's create a graph with rag node
    const testGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "input-1", type: "input", config: {} },
        { id: "rag-1", type: "rag", config: { topK: 5 } },
        { id: "llm-1", type: "llm", config: { prompt: "hi" } },
        { id: "output-1", type: "output", config: {} },
      ],
      edges: [],
    };

    // rag outputs 'documents' -> connecting 'documents' to llm 'question' (which expects 'text')
    const mismatch = isValidConnection(
      { source: "rag-1", sourceHandle: "documents", target: "llm-1", targetHandle: "question" },
      testGraph.nodes,
      testGraph.edges
    );
    expect(mismatch).toBe(false);

    // connecting text into context (which expects documents)
    const mismatch2 = isValidConnection(
      { source: "input-1", sourceHandle: "query", target: "llm-1", targetHandle: "context" },
      testGraph.nodes,
      testGraph.edges
    );
    expect(mismatch2).toBe(false);

    // matching types: text -> text
    const match = isValidConnection(
      { source: "input-1", sourceHandle: "query", target: "llm-1", targetHandle: "question" },
      testGraph.nodes,
      testGraph.edges
    );
    expect(match).toBe(true);
  });

  it("blocks connecting multiple edges to a single-edge input port", () => {
    // llm-1 question port is allowMultiple: false
    // If it already has an edge, second edge is rejected
    const testGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "input-1", type: "input", config: {} },
        { id: "input-2", type: "input", config: {} },
        { id: "llm-1", type: "llm", config: { prompt: "hi" } },
      ],
      edges: [
        { id: "e1", sourceNodeId: "input-1", sourcePort: "query", targetNodeId: "llm-1", targetPort: "question" },
      ],
    };

    const secondConn = isValidConnection(
      { source: "input-2", sourceHandle: "query", target: "llm-1", targetHandle: "question" },
      testGraph.nodes,
      testGraph.edges
    );
    expect(secondConn).toBe(false);
  });

  it("blocks connections that would form a cycle in the DAG", () => {
    // A -> B -> C -> trying to connect C -> A
    const testGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "A", type: "condition", config: { branches: [{ name: "b1", operator: "contains", value: "1" }] } },
        { id: "B", type: "condition", config: { branches: [{ name: "b2", operator: "contains", value: "2" }] } },
        { id: "C", type: "condition", config: { branches: [{ name: "b3", operator: "contains", value: "3" }] } },
      ],
      edges: [
        { id: "e1", sourceNodeId: "A", sourcePort: "b1", targetNodeId: "B", targetPort: "value" },
        { id: "e2", sourceNodeId: "B", sourcePort: "b2", targetNodeId: "C", targetPort: "value" },
      ],
    };

    // Cycle candidate: C -> A
    const cycle = isValidConnection(
      { source: "C", sourceHandle: "b3", target: "A", targetHandle: "value" },
      testGraph.nodes,
      testGraph.edges
    );
    expect(cycle).toBe(false);
  });
});

describe("canvas-store", () => {
  it("moveNode does not change graphHash", () => {
    const store = useCanvasStore.getState();
    store.initialize(SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI);

    const hashBefore = graphHash(useCanvasStore.getState().graph);

    store.moveNode("input-1", { x: 999, y: 777 });

    const hashAfter = graphHash(useCanvasStore.getState().graph);
    expect(hashAfter).toBe(hashBefore);
    expect(useCanvasStore.getState().ui.positions["input-1"]).toEqual({ x: 999, y: 777 });
  });

  it("removing a condition branch deletes edges originating from that branch", () => {
    const store = useCanvasStore.getState();
    store.initialize(SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI);

    // Initial edges include: condition-1.greeting -> merge-1.items
    expect(
      useCanvasStore.getState().graph.edges.some(
        (e) => e.sourceNodeId === "condition-1" && e.sourcePort === "greeting"
      )
    ).toBe(true);

    // Update condition to remove branch 'greeting', now having branch 'farewell'
    store.updateConfig("condition-1", {
      branches: [{ name: "farewell", operator: "contains", value: "bye" }],
    });

    // The edge originating from 'greeting' should be automatically removed
    expect(
      useCanvasStore.getState().graph.edges.some(
        (e) => e.sourceNodeId === "condition-1" && e.sourcePort === "greeting"
      )
    ).toBe(false);
  });
});
