import { describe, expect, it } from "vitest";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow/dsl-types";
import { findCycleNodes, MAX_AI_NODES, MAX_NODES, validateWorkflowGraph, type ValidationCode } from "@/lib/workflow/dsl-validator";

const edge = (id: string, from: string, fromPort: string, to: string, toPort: string): WorkflowEdge => ({
  id,
  sourceNodeId: from,
  sourcePort: fromPort,
  targetNodeId: to,
  targetPort: toPort,
});

// input → condition → (long | else) → merge → llm → output: the phase 1 reference workflow
const sample = (): WorkflowGraph => ({
  schemaVersion: 1,
  nodes: [
    { id: "in", type: "input", config: {} },
    { id: "cond", type: "condition", config: { branches: [{ name: "long", operator: "length_gt", value: "200" }] } },
    { id: "short", type: "rewrite", config: { instruction: "Expand: {{inputs.query}}" } },
    { id: "merge", type: "merge", config: { mode: "first_active" } },
    { id: "llm", type: "llm", config: { prompt: "Answer {{ inputs.question }}", system: "Be brief." } },
    { id: "out", type: "output", config: {} },
  ],
  edges: [
    edge("e1", "in", "query", "cond", "value"),
    edge("e2", "cond", "long", "merge", "items"),
    edge("e3", "cond", "else", "short", "query"),
    edge("e4", "short", "query", "merge", "items"),
    edge("e5", "merge", "value", "llm", "question"),
    edge("e6", "llm", "text", "out", "value"),
  ],
});

const codesOf = (raw: unknown): ValidationCode[] => {
  const result = validateWorkflowGraph(raw);
  return result.ok ? [] : result.errors.map((e) => e.code);
};
const errorsOf = (raw: unknown) => {
  const result = validateWorkflowGraph(raw);
  return result.ok ? [] : result.errors;
};
const node = (g: WorkflowGraph, id: string) => g.nodes.find((n) => n.id === id)!;

describe("validateWorkflowGraph — valid graphs", () => {
  it("accepts the reference workflow and returns the typed graph", () => {
    const result = validateWorkflowGraph(sample());
    expect(result).toEqual({ ok: true, graph: sample() });
  });

  it("accepts rag documents feeding an llm as optional context", () => {
    const g: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "in", type: "input", config: {} },
        { id: "rag", type: "rag", config: { topK: 4, minScore: 0.3 } },
        { id: "llm", type: "llm", config: { prompt: "{{inputs.question}}\n{{inputs.context}}" } },
        { id: "out", type: "output", config: {} },
      ],
      edges: [
        edge("a", "in", "query", "rag", "query"),
        edge("b", "in", "query", "llm", "question"),
        edge("c", "rag", "documents", "llm", "context"),
        edge("d", "llm", "text", "out", "value"),
      ],
    };
    expect(codesOf(g)).toEqual([]);
  });
});

describe("shape (untrusted JSON)", () => {
  it.each([
    ["not an object", null, ""],
    ["wrong schema version", { ...sample(), schemaVersion: 2 }, "schemaVersion"],
    ["nodes not an array", { ...sample(), nodes: {} }, "nodes"],
    ["unknown node type", { ...sample(), nodes: [{ id: "x", type: "http", config: {} }] }, "nodes[0].type"],
    ["bad node id", { ...sample(), nodes: [{ id: "a b", type: "input", config: {} }] }, "nodes[0].id"],
    ["missing config", { ...sample(), nodes: [{ id: "x", type: "input" }] }, "nodes[0].config"],
    ["rag topK out of range", { ...sample(), nodes: [{ id: "x", type: "rag", config: { topK: 0 } }] }, "nodes[0].config.topK"],
    ["regex operator", { ...sample(), nodes: [{ id: "x", type: "condition", config: { branches: [{ name: "a", operator: "regex", value: ".*" }] } }] }, "nodes[0].config.branches[0].operator"],
    ["length_gt with text", { ...sample(), nodes: [{ id: "x", type: "condition", config: { branches: [{ name: "a", operator: "length_gt", value: "ten" }] } }] }, "nodes[0].config.branches[0].value"],
    ["unknown merge mode", { ...sample(), nodes: [{ id: "x", type: "merge", config: { mode: "zip" } }] }, "nodes[0].config.mode"],
    ["llm prompt not a string", { ...sample(), nodes: [{ id: "x", type: "llm", config: { prompt: 42 } }] }, "nodes[0].config.prompt"],
    ["llm temperature too high", { ...sample(), nodes: [{ id: "x", type: "llm", config: { prompt: "", temperature: 3 } }] }, "nodes[0].config.temperature"],
    ["edge missing a port", { ...sample(), edges: [{ id: "e", sourceNodeId: "in", targetNodeId: "out", targetPort: "value" }] }, "edges[0].sourcePort"],
  ])("rejects %s", (_, raw, path) => {
    const errors = errorsOf(raw);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.code === "INVALID_SHAPE")).toBe(true);
    expect(errors.map((e) => e.path)).toContain(path);
  });
});

describe("rule 1 — size limits", () => {
  it("rejects more than 25 nodes", () => {
    const g = sample();
    for (let i = g.nodes.length; i <= MAX_NODES; i++) g.nodes.push({ id: `extra${i}`, type: "output", config: {} });
    expect(g.nodes.length).toBe(MAX_NODES + 1);
    expect(codesOf(g)).toContain("TOO_MANY_NODES");
  });

  it("rejects more than 10 AI nodes", () => {
    const g = sample();
    for (let i = 0; i < MAX_AI_NODES; i++) g.nodes.push({ id: `ai${i}`, type: "llm", config: { prompt: "" } });
    expect(codesOf(g)).toContain("TOO_MANY_AI_NODES");
    expect(codesOf(sample())).not.toContain("TOO_MANY_AI_NODES");
  });
});

describe("rule 2 — ids and edge endpoints", () => {
  it("rejects duplicate node and edge ids", () => {
    const g = sample();
    g.nodes.push({ id: "out", type: "output", config: {} });
    g.edges.push(edge("e1", "in", "query", "cond", "value"));
    expect(codesOf(g)).toEqual(expect.arrayContaining(["DUPLICATE_NODE_ID", "DUPLICATE_EDGE_ID"]));
  });

  it("rejects edges to unknown nodes", () => {
    const g = sample();
    g.edges.push(edge("ghost", "llm", "text", "nowhere", "value"));
    const errors = errorsOf(g);
    expect(errors).toContainEqual(expect.objectContaining({ code: "EDGE_UNKNOWN_NODE", edgeId: "ghost" }));
  });
});

describe("rule 3 — no cycles", () => {
  it("reports exactly the nodes on the cycle", () => {
    const g = sample();
    // short → cond closes a loop: cond → short → cond
    g.edges.push(edge("back", "short", "query", "cond", "value"));
    const cycle = errorsOf(g).find((e) => e.code === "CYCLE");
    expect(cycle?.nodeIds?.sort()).toEqual(["cond", "short"]);
  });

  it("findCycleNodes ignores nodes upstream and downstream of the cycle", () => {
    const edges = [
      { sourceNodeId: "a", targetNodeId: "b" },
      { sourceNodeId: "b", targetNodeId: "c" },
      { sourceNodeId: "c", targetNodeId: "b" },
      { sourceNodeId: "c", targetNodeId: "d" },
    ];
    expect(findCycleNodes(["a", "b", "c", "d"], edges)).toEqual(["b", "c"]);
    expect(findCycleNodes(["a", "b"], [{ sourceNodeId: "a", targetNodeId: "b" }])).toEqual([]);
  });
});

describe("rule 4 — one input, an output, every node on a path", () => {
  it("requires exactly one input and at least one output", () => {
    const g = sample();
    g.nodes.push({ id: "in2", type: "input", config: {} });
    expect(codesOf(g)).toContain("INPUT_COUNT");

    const noOutput = sample();
    noOutput.nodes = noOutput.nodes.filter((n) => n.type !== "output");
    noOutput.edges = noOutput.edges.filter((e) => e.targetNodeId !== "out");
    expect(codesOf(noOutput)).toContain("OUTPUT_MISSING");
  });

  it("flags nodes off the input → output path", () => {
    const g = sample();
    g.nodes.push({ id: "island", type: "llm", config: { prompt: "" } });
    g.nodes.push({ id: "deadEnd", type: "rag", config: { topK: 2 } });
    g.edges.push(edge("de", "in", "query", "deadEnd", "query"));
    const unreachable = errorsOf(g).filter((e) => e.code === "UNREACHABLE_NODE");
    expect(unreachable.map((e) => e.nodeId).sort()).toEqual(["deadEnd", "island"]);
  });
});

describe("rule 5 — ports exist and types match", () => {
  it("rejects unknown ports on either end", () => {
    const g = sample();
    g.edges[0] = edge("e1", "in", "nope", "cond", "value");
    g.edges[5] = edge("e6", "llm", "text", "out", "result");
    const unknown = errorsOf(g).filter((e) => e.code === "UNKNOWN_PORT");
    expect(unknown.map((e) => e.edgeId)).toEqual(["e1", "e6"]);
  });

  it("rejects connecting documents to a text input", () => {
    const g = sample();
    g.nodes.push({ id: "rag", type: "rag", config: { topK: 3 } });
    g.edges.push(edge("r1", "in", "query", "rag", "query"));
    g.edges[5] = edge("e6", "rag", "documents", "out", "value");
    expect(errorsOf(g)).toContainEqual(expect.objectContaining({ code: "PORT_TYPE_MISMATCH", edgeId: "e6" }));
  });
});

describe("rule 6 — edge counts per port", () => {
  it("allows one edge into a single port", () => {
    const g = sample();
    g.edges.push(edge("dup", "in", "query", "llm", "question"));
    expect(errorsOf(g)).toContainEqual(expect.objectContaining({ code: "TOO_MANY_EDGES", nodeId: "llm" }));
  });

  it("requires at least two edges into merge.items", () => {
    const g = sample();
    g.edges = g.edges.filter((e) => e.id !== "e4");
    expect(errorsOf(g)).toContainEqual(expect.objectContaining({ code: "MERGE_TOO_FEW_INPUTS", nodeId: "merge" }));
  });
});

describe("rule 7 — required ports", () => {
  it("rejects an unconnected required input, but not an optional one", () => {
    const g = sample();
    g.edges = g.edges.filter((e) => e.id !== "e5");
    // llm.question lost its edge; llm.context was never connected and is optional
    const required = errorsOf(g).filter((e) => e.code === "REQUIRED_PORT_UNCONNECTED");
    expect(required.map((e) => [e.nodeId, e.message.includes("question")])).toEqual([["llm", true]]);
  });
});

describe("rule 8 — condition branches", () => {
  it.each([
    ["else", "INVALID_BRANCH_NAME"],
    ["1st", "INVALID_BRANCH_NAME"],
    ["has space", "INVALID_BRANCH_NAME"],
  ] as const)("rejects branch name %j", (name, code) => {
    const g = sample();
    const cond = node(g, "cond") as Extract<WorkflowNode, { type: "condition" }>;
    cond.config.branches.push({ name, operator: "contains", value: "x" });
    expect(codesOf(g)).toContain(code);
  });

  it("rejects duplicate branch names", () => {
    const g = sample();
    const cond = node(g, "cond") as Extract<WorkflowNode, { type: "condition" }>;
    cond.config.branches.push({ name: "long", operator: "equals", value: "x" });
    expect(codesOf(g)).toContain("DUPLICATE_BRANCH_NAME");
  });

  it("requires at least one outgoing edge", () => {
    const g: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "in", type: "input", config: {} },
        { id: "cond", type: "condition", config: { branches: [] } },
        { id: "out", type: "output", config: {} },
      ],
      edges: [edge("a", "in", "query", "cond", "value"), edge("b", "in", "query", "out", "value")],
    };
    expect(errorsOf(g)).toContainEqual(expect.objectContaining({ code: "CONDITION_NO_OUTGOING_EDGE", nodeId: "cond" }));
  });
});

describe("rule 9 — templates read only connected inputs of their node", () => {
  const withPrompt = (prompt: string) => {
    const g = sample();
    (node(g, "llm") as Extract<WorkflowNode, { type: "llm" }>).config.prompt = prompt;
    return g;
  };

  it.each([
    ["an unknown port", "{{inputs.answer}}"],
    ["another node's output", "{{nodes.short.query}}"],
    ["a bare variable", "{{question}}"],
    ["an output port of this node", "{{inputs.text}}"],
  ])("rejects %s", (_, prompt) => {
    expect(errorsOf(withPrompt(prompt))).toContainEqual(
      expect.objectContaining({ code: "INVALID_TEMPLATE_REFERENCE", nodeId: "llm" })
    );
  });

  it("rejects an input port that has no edge", () => {
    const errors = errorsOf(withPrompt("{{inputs.question}} {{inputs.context}}"));
    expect(errors).toEqual([
      expect.objectContaining({ code: "INVALID_TEMPLATE_REFERENCE", message: expect.stringContaining("has no edge") }),
    ]);
  });

  it("checks the system prompt and rewrite instructions too", () => {
    const g = sample();
    (node(g, "llm") as Extract<WorkflowNode, { type: "llm" }>).config.system = "{{inputs.nope}}";
    (node(g, "short") as Extract<WorkflowNode, { type: "rewrite" }>).config.instruction = "{{inputs.question}}";
    expect(errorsOf(g).map((e) => [e.code, e.nodeId])).toEqual([
      ["INVALID_TEMPLATE_REFERENCE", "short"],
      ["INVALID_TEMPLATE_REFERENCE", "llm"],
    ]);
  });
});

describe("error collection", () => {
  it("reports several problems in one pass", () => {
    const g = sample();
    g.edges = g.edges.filter((e) => e.id !== "e5");
    g.nodes.push({ id: "in2", type: "input", config: {} });
    expect(new Set(codesOf(g))).toEqual(new Set(["INPUT_COUNT", "REQUIRED_PORT_UNCONNECTED", "INVALID_TEMPLATE_REFERENCE"]));
  });
});
