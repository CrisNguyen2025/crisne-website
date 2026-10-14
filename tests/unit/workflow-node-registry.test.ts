import { describe, expect, it } from "vitest";
import { NODE_TYPES, type WorkflowNode } from "@/lib/workflow/dsl-types";
import { findInputPort, findOutputPort, NODE_LABELS, resolveNodePorts } from "@/lib/workflow/node-registry";

const names = (ports: { name: string }[]) => ports.map((p) => p.name);

describe("resolveNodePorts", () => {
  it("input has one text output and no inputs", () => {
    const ports = resolveNodePorts({ id: "n", type: "input", config: {} });
    expect(ports.inputs).toEqual([]);
    expect(ports.outputs).toEqual([{ name: "query", type: "text", required: false, allowMultiple: false }]);
  });

  it("rewrite and rag take a required query", () => {
    const rewrite = resolveNodePorts({ id: "n", type: "rewrite", config: { instruction: "x" } });
    expect(rewrite.inputs).toEqual([{ name: "query", type: "text", required: true, allowMultiple: false }]);
    expect(rewrite.outputs.map((p) => [p.name, p.type])).toEqual([["query", "text"]]);

    const rag = resolveNodePorts({ id: "n", type: "rag", config: { topK: 4 } });
    expect(names(rag.inputs)).toEqual(["query"]);
    expect(rag.outputs.map((p) => [p.name, p.type])).toEqual([["documents", "documents"]]);
  });

  it("condition exposes one output per branch, in order, plus else", () => {
    const ports = resolveNodePorts({
      id: "n",
      type: "condition",
      config: {
        branches: [
          { name: "long", operator: "length_gt", value: "200" },
          { name: "greeting", operator: "contains", value: "hi" },
        ],
      },
    });
    expect(names(ports.inputs)).toEqual(["value"]);
    expect(names(ports.outputs)).toEqual(["long", "greeting", "else"]);
    expect(ports.outputs.every((p) => p.type === "text")).toBe(true);
  });

  it("merge port types follow the mode and accept many edges", () => {
    const merge = (mode: "first_active" | "concat_documents" | "join_strings") =>
      resolveNodePorts({ id: "n", type: "merge", config: { mode } });

    expect(merge("concat_documents").inputs).toEqual([
      { name: "items", type: "documents", required: true, allowMultiple: true },
    ]);
    expect(merge("concat_documents").outputs[0].type).toBe("documents");
    expect(merge("join_strings").outputs[0].type).toBe("text");
    expect(merge("first_active").inputs[0].type).toBe("text");
  });

  it("llm requires a question and takes optional documents as context", () => {
    const ports = resolveNodePorts({ id: "n", type: "llm", config: { prompt: "{{inputs.question}}" } });
    expect(ports.inputs.map((p) => [p.name, p.type, p.required])).toEqual([
      ["question", "text", true],
      ["context", "documents", false],
    ]);
    expect(names(ports.outputs)).toEqual(["text"]);
  });

  it("output has one required input and no outputs", () => {
    const ports = resolveNodePorts({ id: "n", type: "output", config: {} });
    expect(names(ports.inputs)).toEqual(["value"]);
    expect(ports.outputs).toEqual([]);
  });

  it("covers every node type with a label", () => {
    const samples: WorkflowNode[] = [
      { id: "1", type: "input", config: {} },
      { id: "2", type: "rewrite", config: { instruction: "" } },
      { id: "3", type: "rag", config: { topK: 4 } },
      { id: "4", type: "condition", config: { branches: [] } },
      { id: "5", type: "merge", config: { mode: "first_active" } },
      { id: "6", type: "llm", config: { prompt: "" } },
      { id: "7", type: "output", config: {} },
    ];
    expect(samples.map((n) => n.type)).toEqual([...NODE_TYPES]);
    for (const node of samples) {
      expect(() => resolveNodePorts(node)).not.toThrow();
      expect(NODE_LABELS[node.type]).toBeTruthy();
    }
  });
});

describe("port lookup", () => {
  const llm: WorkflowNode = { id: "n", type: "llm", config: { prompt: "" } };

  it("finds ports by name and direction", () => {
    expect(findInputPort(llm, "context")?.type).toBe("documents");
    expect(findOutputPort(llm, "text")?.type).toBe("text");
  });

  it("returns undefined for unknown or wrong-direction ports", () => {
    expect(findInputPort(llm, "text")).toBeUndefined();
    expect(findOutputPort(llm, "question")).toBeUndefined();
    expect(findInputPort(llm, "nope")).toBeUndefined();
  });
});
