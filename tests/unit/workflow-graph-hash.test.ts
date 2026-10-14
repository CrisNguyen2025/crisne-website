import { describe, expect, it } from "vitest";
import type { WorkflowDocument, WorkflowGraph } from "@/lib/workflow/dsl-types";
import { canonicalizeGraph, graphHash } from "@/lib/workflow/graph-hash";

const graph = (): WorkflowGraph => ({
  schemaVersion: 1,
  nodes: [
    { id: "in", type: "input", config: {} },
    {
      id: "cond",
      type: "condition",
      config: {
        branches: [
          { name: "short", operator: "length_gt", value: "200" },
          { name: "greeting", operator: "contains", value: "hello" },
        ],
      },
    },
    { id: "llm", type: "llm", config: { prompt: "Answer: {{inputs.question}}", temperature: 0.2 } },
    { id: "out", type: "output", config: {} },
  ],
  edges: [
    { id: "e1", sourceNodeId: "in", sourcePort: "query", targetNodeId: "cond", targetPort: "value" },
    { id: "e2", sourceNodeId: "cond", sourcePort: "else", targetNodeId: "llm", targetPort: "question" },
    { id: "e3", sourceNodeId: "llm", sourcePort: "text", targetNodeId: "out", targetPort: "value" },
  ],
});

describe("graphHash", () => {
  it("is a sha256 hex digest", () => {
    expect(graphHash(graph())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores canvas layout: moving nodes or the viewport keeps the hash", () => {
    const before: WorkflowDocument = {
      graph: graph(),
      ui: { positions: { in: { x: 0, y: 0 } }, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    };
    const after: WorkflowDocument = {
      graph: graph(),
      ui: { positions: { in: { x: 480, y: 120 } }, labels: { in: "Question" }, viewport: { x: 50, y: -20, zoom: 0.6 } },
    };
    expect(graphHash(after.graph)).toBe(graphHash(before.graph));
  });

  it("ignores object key order and node/edge array order", () => {
    const g = graph();
    const shuffled: WorkflowGraph = {
      edges: [...g.edges].reverse().map((e) => ({
        targetPort: e.targetPort,
        targetNodeId: e.targetNodeId,
        sourcePort: e.sourcePort,
        sourceNodeId: e.sourceNodeId,
        id: e.id,
      })),
      nodes: [...g.nodes].reverse(),
      schemaVersion: 1,
    };
    expect(canonicalizeGraph(shuffled)).toBe(canonicalizeGraph(g));
    expect(graphHash(shuffled)).toBe(graphHash(g));
  });

  it("treats undefined config fields as absent", () => {
    const g = graph();
    const withUndefined = structuredClone(g);
    const llm = withUndefined.nodes.find((n) => n.type === "llm")!;
    if (llm.type === "llm") llm.config.system = undefined;
    expect(graphHash(withUndefined)).toBe(graphHash(g));
  });

  it("changes when semantics change", () => {
    const base = graphHash(graph());

    const prompt = graph();
    const llm = prompt.nodes.find((n) => n.type === "llm")!;
    if (llm.type === "llm") llm.config.prompt = "Summarize: {{inputs.question}}";
    expect(graphHash(prompt)).not.toBe(base);

    const rewired = graph();
    rewired.edges[1] = { ...rewired.edges[1], sourcePort: "short" };
    expect(graphHash(rewired)).not.toBe(base);

    // Branch order decides which branch wins, so it is part of the hash
    const reordered = graph();
    const cond = reordered.nodes.find((n) => n.type === "condition")!;
    if (cond.type === "condition") cond.config.branches.reverse();
    expect(graphHash(reordered)).not.toBe(base);
  });
});
