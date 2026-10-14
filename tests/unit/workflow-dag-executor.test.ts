import { describe, expect, it, vi } from "vitest";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow/dsl-types";
import { validateWorkflowGraph } from "@/lib/workflow/dsl-validator";
import {
  executeWorkflow,
  topologicalOrder,
  type NodeHandlers,
  type NodeResult,
  type RetrievedDocument,
} from "@/lib/workflow/dag-executor";

const edge = (id: string, from: string, fromPort: string, to: string, toPort: string): WorkflowEdge => ({
  id,
  sourceNodeId: from,
  sourcePort: fromPort,
  targetNodeId: to,
  targetPort: toPort,
});

// Fake handlers: deterministic, no LLM
const fakeHandlers = (overrides: Partial<NodeHandlers> = {}): NodeHandlers => ({
  input: async (_, __, { runInput }) => ({ outputs: { query: runInput.query } }),
  rewrite: async (node, inputs) => ({ outputs: { query: `${node.id}(${inputs.query})` } }),
  rag: async (_, inputs) => ({
    outputs: { documents: [{ id: "c1", content: `doc for ${inputs.query}`, score: 0.9 }] },
  }),
  condition: async (node, inputs) => {
    const value = inputs.value as string;
    const match = node.config.branches.find((b) =>
      b.operator === "length_gt" ? value.length > Number(b.value) : b.operator === "contains" ? value.includes(b.value) : value === b.value
    );
    return { outputs: { [match?.name ?? "else"]: value } };
  },
  merge: async (_, inputs) => ({ outputs: { value: (inputs.items as string[])[0] } }),
  llm: async (_, inputs) => ({
    outputs: { text: `answer(${inputs.question})` },
    usage: { model: "fake", inputTokens: 10, outputTokens: 5 },
  }),
  output: async () => ({ outputs: {} }),
  ...overrides,
});

// input → condition → long: merge directly | else: rewrite → merge → llm → output
const branching = (): WorkflowGraph => ({
  schemaVersion: 1,
  nodes: [
    { id: "in", type: "input", config: {} },
    { id: "cond", type: "condition", config: { branches: [{ name: "long", operator: "length_gt", value: "10" }] } },
    { id: "expand", type: "rewrite", config: { instruction: "{{inputs.query}}" } },
    { id: "merge", type: "merge", config: { mode: "first_active" } },
    { id: "llm", type: "llm", config: { prompt: "{{inputs.question}}" } },
    { id: "out", type: "output", config: {} },
  ],
  edges: [
    edge("e1", "in", "query", "cond", "value"),
    edge("e2", "cond", "long", "merge", "items"),
    edge("e3", "cond", "else", "expand", "query"),
    edge("e4", "expand", "query", "merge", "items"),
    edge("e5", "merge", "value", "llm", "question"),
    edge("e6", "llm", "text", "out", "value"),
  ],
});

const statusById = (nodes: NodeResult[]) => Object.fromEntries(nodes.map((n) => [n.nodeId, n.status]));

describe("executeWorkflow — branching", () => {
  it("fixtures are valid graphs", () => {
    expect(validateWorkflowGraph(branching()).ok).toBe(true);
    expect(validateWorkflowGraph(allSkippedMerge()).ok).toBe(true);
  });

  it("takes the matching branch and skips the other", async () => {
    const result = await executeWorkflow(branching(), { query: "a long question here" }, { handlers: fakeHandlers() });

    expect(result.status).toBe("SUCCEEDED");
    expect(statusById(result.nodes)).toEqual({
      in: "SUCCEEDED",
      cond: "SUCCEEDED",
      expand: "SKIPPED",
      merge: "SUCCEEDED",
      llm: "SUCCEEDED",
      out: "SUCCEEDED",
    });
    expect(result.outputs).toEqual({ out: "answer(a long question here)" });
  });

  it("falls through to else, and merge runs with only the active branch", async () => {
    const merge = vi.fn(fakeHandlers().merge);
    const result = await executeWorkflow(branching(), { query: "short" }, { handlers: fakeHandlers({ merge }) });

    expect(statusById(result.nodes)).toMatchObject({ expand: "SUCCEEDED", merge: "SUCCEEDED" });
    // The skipped `long` edge is not passed in
    expect(merge.mock.calls[0][1]).toEqual({ items: ["expand(short)"] });
    expect(result.outputs).toEqual({ out: "answer(expand(short))" });
  });

  it("records inputs, outputs, usage and timing of each node", async () => {
    let t = 0;
    const result = await executeWorkflow(branching(), { query: "short" }, {
      handlers: fakeHandlers(),
      now: () => new Date((t += 5)),
    });
    const llm = result.nodes.find((n) => n.nodeId === "llm")!;
    expect(llm).toMatchObject({
      inputs: { question: "expand(short)", context: undefined },
      outputs: { text: "answer(expand(short))" },
      usage: { model: "fake", inputTokens: 10, outputTokens: 5 },
      durationMs: 5,
    });
    expect(result.nodes.find((n) => n.nodeId === "expand")!.startedAt).toBeInstanceOf(Date);
  });
});

// cond.long feeds both rewrites into merge; else goes straight to a second output
function allSkippedMerge(): WorkflowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      { id: "in", type: "input", config: {} },
      { id: "cond", type: "condition", config: { branches: [{ name: "long", operator: "length_gt", value: "10" }] } },
      { id: "a", type: "rewrite", config: { instruction: "{{inputs.query}}" } },
      { id: "b", type: "rewrite", config: { instruction: "{{inputs.query}}" } },
      { id: "merge", type: "merge", config: { mode: "first_active" } },
      { id: "llm", type: "llm", config: { prompt: "{{inputs.question}}" } },
      { id: "outLong", type: "output", config: {} },
      { id: "outShort", type: "output", config: {} },
    ],
    edges: [
      edge("e1", "in", "query", "cond", "value"),
      edge("e2", "cond", "long", "a", "query"),
      edge("e3", "cond", "long", "b", "query"),
      edge("e4", "a", "query", "merge", "items"),
      edge("e5", "b", "query", "merge", "items"),
      edge("e6", "merge", "value", "llm", "question"),
      edge("e7", "llm", "text", "outLong", "value"),
      edge("e8", "cond", "else", "outShort", "value"),
    ],
  };
}

describe("executeWorkflow — SKIPPED propagation", () => {
  it("skips a merge whose every incoming edge is skipped, and everything after it", async () => {
    const llm = vi.fn(fakeHandlers().llm);
    const result = await executeWorkflow(allSkippedMerge(), { query: "hi" }, { handlers: fakeHandlers({ llm }) });

    expect(result.status).toBe("SUCCEEDED");
    expect(statusById(result.nodes)).toEqual({
      in: "SUCCEEDED",
      cond: "SUCCEEDED",
      a: "SKIPPED",
      b: "SKIPPED",
      merge: "SKIPPED",
      llm: "SKIPPED",
      outLong: "SKIPPED",
      outShort: "SUCCEEDED",
    });
    expect(llm).not.toHaveBeenCalled();
    expect(result.outputs).toEqual({ outShort: "hi" });
  });

  it("passes every active edge of a multi-edge port, in edge order", async () => {
    const merge = vi.fn(fakeHandlers().merge);
    await executeWorkflow(allSkippedMerge(), { query: "a long question here" }, { handlers: fakeHandlers({ merge }) });
    expect(merge.mock.calls[0][1]).toEqual({ items: ["a(a long question here)", "b(a long question here)"] });
  });
});

describe("executeWorkflow — failures", () => {
  it("stops the run at the first failing node", async () => {
    const llm = vi.fn(async () => {
      throw new Error("model exploded");
    });
    const output = vi.fn(fakeHandlers().output);
    const result = await executeWorkflow(branching(), { query: "short" }, { handlers: fakeHandlers({ llm, output }) });

    expect(result.status).toBe("FAILED");
    expect(result.error).toEqual({ nodeId: "llm", message: "model exploded" });
    expect(statusById(result.nodes)).toMatchObject({ merge: "SUCCEEDED", llm: "FAILED", out: "CANCELLED" });
    expect(result.nodes.find((n) => n.nodeId === "llm")!.error).toBe("model exploded");
    expect(output).not.toHaveBeenCalled();
    expect(result.outputs).toEqual({});
  });

  it("fails a node that exceeds its timeout and aborts its signal", async () => {
    let aborted = false;
    const rewrite = vi.fn(
      (_node: WorkflowNode, _inputs: unknown, { signal }: { signal: AbortSignal }) =>
        new Promise<never>(() => signal.addEventListener("abort", () => (aborted = true)))
    );
    const result = await executeWorkflow(branching(), { query: "short" }, {
      handlers: fakeHandlers({ rewrite }),
      nodeTimeoutMs: 20,
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toEqual({ nodeId: "expand", message: 'Node "expand" timed out after 20 ms.' });
    expect(aborted).toBe(true);
    expect(statusById(result.nodes)).toMatchObject({ merge: "CANCELLED", llm: "CANCELLED", out: "CANCELLED" });
  });
});

describe("executeWorkflow — hooks", () => {
  it("reports start for nodes that run and finish for every node, in order", async () => {
    const events: string[] = [];
    await executeWorkflow(branching(), { query: "a long question here" }, {
      handlers: fakeHandlers(),
      onNodeStart: (node) => void events.push(`start:${node.id}`),
      onNodeFinish: (node, result) => void events.push(`${result.status}:${node.id}`),
    });
    expect(events).toEqual([
      "start:in",
      "SUCCEEDED:in",
      "start:cond",
      "SUCCEEDED:cond",
      "SKIPPED:expand",
      "start:merge",
      "SUCCEEDED:merge",
      "start:llm",
      "SUCCEEDED:llm",
      "start:out",
      "SUCCEEDED:out",
    ]);
  });
});

describe("executeWorkflow — documents", () => {
  it("passes documents through to an optional llm context port", async () => {
    const llm = vi.fn(fakeHandlers().llm);
    const graph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "in", type: "input", config: {} },
        { id: "rag", type: "rag", config: { topK: 4 } },
        { id: "llm", type: "llm", config: { prompt: "{{inputs.question}} {{inputs.context}}" } },
        { id: "out", type: "output", config: {} },
      ],
      edges: [
        edge("a", "in", "query", "rag", "query"),
        edge("b", "in", "query", "llm", "question"),
        edge("c", "rag", "documents", "llm", "context"),
        edge("d", "llm", "text", "out", "value"),
      ],
    };
    await executeWorkflow(graph, { query: "q" }, { handlers: fakeHandlers({ llm }) });
    const context = llm.mock.calls[0][1].context as RetrievedDocument[];
    expect(context).toEqual([{ id: "c1", content: "doc for q", score: 0.9 }]);
  });
});

describe("topologicalOrder", () => {
  it("orders by dependencies and keeps graph order for ties", () => {
    expect(topologicalOrder(branching()).map((n) => n.id)).toEqual(["in", "cond", "expand", "merge", "llm", "out"]);
  });

  it("refuses a cyclic graph", () => {
    const g = branching();
    g.edges.push(edge("back", "llm", "text", "cond", "value"));
    expect(() => topologicalOrder(g)).toThrow(/cycle/);
  });
});
