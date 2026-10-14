import { describe, expect, it, vi } from "vitest";
import type { LlmGenerateParams, LlmProvider } from "@/lib/ai/llm-provider";
import type { WorkflowEdge, WorkflowGraph, WorkflowNodeOf } from "@/lib/workflow/dsl-types";
import { validateWorkflowGraph } from "@/lib/workflow/dsl-validator";
import { executeWorkflow, type NodeHandlerContext, type RetrievedDocument } from "@/lib/workflow/dag-executor";
import { createNodeHandlers, WORKFLOW_LLM_MODEL } from "@/lib/workflow/nodes";
import { conditionHandler, matchesBranch } from "@/lib/workflow/nodes/condition";
import { concatDocuments, mergeHandler } from "@/lib/workflow/nodes/merge";
import { formatDocuments, renderTemplate } from "@/lib/workflow/nodes/template";

const context = (runInput: Record<string, string> = {}): NodeHandlerContext => ({
  runInput,
  signal: new AbortController().signal,
});

function fakeLlm(answer = "fake answer") {
  const calls: LlmGenerateParams[] = [];
  const provider: LlmProvider = {
    generate: vi.fn(async (params: LlmGenerateParams) => {
      calls.push(params);
      return { text: answer, usage: { input: 12, output: 3, total: 15 } };
    }),
    generateStream: vi.fn(),
    embed: vi.fn(),
  };
  return { provider, calls };
}

const doc = (id: string, score: number, content = id, heading?: string): RetrievedDocument => ({ id, score, content, heading });

describe("renderTemplate", () => {
  it("fills text inputs and tolerates spaces in placeholders", () => {
    expect(renderTemplate("Q: {{inputs.question}} / {{ inputs.question }}", { question: "why?" })).toBe("Q: why? / why?");
  });

  it("renders documents as numbered sections and missing optional inputs as empty", () => {
    const docs = [doc("a", 0.9, "first", "Intro"), doc("b", 0.5, "second")];
    expect(renderTemplate("{{inputs.context}}|{{inputs.missing}}", { context: docs })).toBe(
      "[1] Intro\nfirst\n\n[2]\nsecond|"
    );
    expect(formatDocuments([])).toBe("");
  });

  it("does not re-expand placeholders found inside input values", () => {
    expect(renderTemplate("{{inputs.q}}", { q: "{{inputs.q}} injected" })).toBe("{{inputs.q}} injected");
  });
});

describe("condition", () => {
  it.each([
    ["contains ignores case", "Hello World", { name: "x", operator: "contains", value: "WORLD" }, true],
    ["contains misses", "Hello", { name: "x", operator: "contains", value: "bye" }, false],
    ["equals ignores case and spaces", "  Yes ", { name: "x", operator: "equals", value: "yes" }, true],
    ["equals is not contains", "yes please", { name: "x", operator: "equals", value: "yes" }, false],
    ["length_gt is strict", "12345", { name: "x", operator: "length_gt", value: "5" }, false],
    ["length_gt passes", "123456", { name: "x", operator: "length_gt", value: "5" }, true],
  ] as const)("%s", (_, value, branch, expected) => {
    expect(matchesBranch(value, branch)).toBe(expected);
  });

  const node: WorkflowNodeOf<"condition"> = {
    id: "c",
    type: "condition",
    config: {
      branches: [
        { name: "greeting", operator: "contains", value: "hello" },
        { name: "long", operator: "length_gt", value: "5" },
      ],
    },
  };

  it("emits only the first matching branch, passing the value through", async () => {
    expect(await conditionHandler(node, { value: "hello there" }, context())).toEqual({ outputs: { greeting: "hello there" } });
    expect(await conditionHandler(node, { value: "goodbye" }, context())).toEqual({ outputs: { long: "goodbye" } });
  });

  it("falls back to else", async () => {
    expect(await conditionHandler(node, { value: "hi" }, context())).toEqual({ outputs: { else: "hi" } });
  });
});

describe("merge", () => {
  const merge = (config: WorkflowNodeOf<"merge">["config"]): WorkflowNodeOf<"merge"> => ({ id: "m", type: "merge", config });

  it("first_active takes the first branch that ran", async () => {
    expect(await mergeHandler(merge({ mode: "first_active" }), { items: ["a", "b"] }, context())).toEqual({
      outputs: { value: "a" },
    });
  });

  it("join_strings joins with the separator (blank line by default)", async () => {
    expect((await mergeHandler(merge({ mode: "join_strings" }), { items: ["a", "b"] }, context())).outputs.value).toBe("a\n\nb");
    expect(
      (await mergeHandler(merge({ mode: "join_strings", separator: " | " }), { items: ["a", "b"] }, context())).outputs.value
    ).toBe("a | b");
  });

  it("concat_documents dedupes by chunk id, keeps the best score, sorts best first", async () => {
    const result = await mergeHandler(
      merge({ mode: "concat_documents" }),
      { items: [[doc("x", 0.4), doc("y", 0.7)], [doc("x", 0.9), doc("z", 0.1)]] },
      context()
    );
    expect(result.outputs.value).toEqual([doc("x", 0.9), doc("y", 0.7), doc("z", 0.1)]);
    expect(concatDocuments([])).toEqual([]);
  });
});

describe("llm", () => {
  const llmNode: WorkflowNodeOf<"llm"> = {
    id: "l",
    type: "llm",
    config: { prompt: "Answer: {{inputs.question}}\n{{inputs.context}}", system: "Reply about {{inputs.question}}" },
  };

  it("renders templates and calls flash-lite with defaults", async () => {
    const { provider, calls } = fakeLlm("42");
    const handlers = createNodeHandlers({ llm: provider });
    const result = await handlers.llm(llmNode, { question: "life", context: [doc("c", 1, "ctx")] }, context());

    expect(calls).toEqual([
      {
        model: WORKFLOW_LLM_MODEL,
        systemInstruction: "Reply about life",
        contents: "Answer: life\n[1]\nctx",
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    ]);
    expect(WORKFLOW_LLM_MODEL).toBe("gemini-2.5-flash-lite");
    expect(result).toEqual({
      outputs: { text: "42" },
      usage: { model: WORKFLOW_LLM_MODEL, inputTokens: 12, outputTokens: 3 },
    });
  });

  it("passes temperature and token limits from config", async () => {
    const { provider, calls } = fakeLlm();
    const node = { ...llmNode, config: { prompt: "{{inputs.question}}", temperature: 0, maxOutputTokens: 64 } };
    await createNodeHandlers({ llm: provider }).llm(node, { question: "q" }, context());
    expect(calls[0]).toMatchObject({ systemInstruction: "", temperature: 0, maxOutputTokens: 64 });
  });

  it("fails on an empty answer", async () => {
    const { provider } = fakeLlm("   ");
    await expect(createNodeHandlers({ llm: provider }).llm(llmNode, { question: "q" }, context())).rejects.toThrow(/empty answer/);
  });
});

describe("input / output / not-yet-available nodes", () => {
  const handlers = createNodeHandlers({ llm: fakeLlm().provider });

  it("input emits the run query and rejects an empty one", async () => {
    const input: WorkflowNodeOf<"input"> = { id: "in", type: "input", config: {} };
    expect(await handlers.input(input, {}, context({ query: "hi" }))).toEqual({ outputs: { query: "hi" } });
    await expect(handlers.input(input, {}, context({ query: "  " }))).rejects.toThrow(/non-empty "query"/);
  });

  it("rewrite and rag validate inputs and execute", async () => {
    await expect(handlers.rag({ id: "r", type: "rag", config: { topK: 3 } }, {}, context())).rejects.toThrow(/valid input "query"/);
    await expect(handlers.rewrite({ id: "w", type: "rewrite", config: { instruction: "" } }, {}, context())).rejects.toThrow(
      /requires an input query/
    );

    const ragResult = await handlers.rag({ id: "r", type: "rag", config: { topK: 3 } }, { query: "hello" }, context());
    expect(ragResult.outputs.documents).toBeDefined();

    const rewriteResult = await handlers.rewrite(
      { id: "w", type: "rewrite", config: { instruction: "Rewrite: {{inputs.query}}" } },
      { query: "hello" },
      context()
    );
    expect(rewriteResult.outputs.query).toBeDefined();
  });
});

describe("reference workflow with real handlers and a fake LLM", () => {
  const edge = (id: string, from: string, fromPort: string, to: string, toPort: string): WorkflowEdge => ({
    id,
    sourceNodeId: from,
    sourcePort: fromPort,
    targetNodeId: to,
    targetPort: toPort,
  });
  // input → condition → (greeting | else) → merge → llm → output
  const graph: WorkflowGraph = {
    schemaVersion: 1,
    nodes: [
      { id: "in", type: "input", config: {} },
      { id: "cond", type: "condition", config: { branches: [{ name: "greeting", operator: "contains", value: "hello" }] } },
      { id: "merge", type: "merge", config: { mode: "join_strings" } },
      { id: "llm", type: "llm", config: { prompt: "Reply to: {{inputs.question}}" } },
      { id: "out", type: "output", config: {} },
    ],
    edges: [
      edge("e1", "in", "query", "cond", "value"),
      edge("e2", "cond", "greeting", "merge", "items"),
      edge("e3", "cond", "else", "merge", "items"),
      edge("e4", "merge", "value", "llm", "question"),
      edge("e5", "llm", "text", "out", "value"),
    ],
  };

  it("is valid and runs end to end", async () => {
    expect(validateWorkflowGraph(graph).ok).toBe(true);
    const { provider, calls } = fakeLlm("Hi back!");

    const result = await executeWorkflow(graph, { query: "Hello Cris" }, { handlers: createNodeHandlers({ llm: provider }) });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.outputs).toEqual({ out: "Hi back!" });
    // Only the greeting branch ran, so join_strings sees one item
    expect(calls[0].contents).toBe("Reply to: Hello Cris");
  });
});
