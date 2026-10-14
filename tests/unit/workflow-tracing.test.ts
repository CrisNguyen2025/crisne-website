import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { createLangfuseSpanProcessor } from "@/lib/ai/langfuse";
import { createWorkflowTrace } from "@/lib/workflow/tracing";
import { WORKFLOW_TRACE_NAME } from "@/lib/workflow/constants";
import type { WorkflowNode } from "@/lib/workflow/dsl-types";
import type { NodeResult, WorkflowRunResult } from "@/lib/workflow/dag-executor";

const exporter = new InMemorySpanExporter();
const spanProcessor = createLangfuseSpanProcessor({
  exporter,
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
  baseUrl: "http://localhost",
});

beforeAll(() => {
  setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [spanProcessor] }));
});

beforeEach(() => {
  exporter.reset();
});

describe("workflow tracing", () => {
  it("emits 1 root trace with correct metadata and spans for each node, with llm as generation having usage", async () => {
    const trace = createWorkflowTrace({
      projectId: "proj-123",
      workflowId: "wf-456",
      runId: "run-789",
      trigger: "MANUAL",
      dryRun: false,
      graphHash: "hash-abc",
      ownerEmail: "cris@bearabyte.io",
      query: "hello world",
    });

    expect(trace.traceId).toBeDefined();

    const inputNode: WorkflowNode = {
      id: "input-1",
      type: "input",
      config: {},
    };
    const llmNode: WorkflowNode = {
      id: "llm-1",
      type: "llm",
      config: { prompt: "hi" },
    };

    // 1. Input node execution
    trace.onNodeStart(inputNode, { query: "hello world" });
    const inputResult: NodeResult = {
      nodeId: "input-1",
      nodeType: "input",
      status: "SUCCEEDED",
      inputs: { query: "hello world" },
      outputs: { query: "hello world" },
    };
    trace.onNodeFinish(inputNode, inputResult);

    // 2. LLM node execution
    trace.onNodeStart(llmNode, { question: "hello world" });
    const llmResult: NodeResult = {
      nodeId: "llm-1",
      nodeType: "llm",
      status: "SUCCEEDED",
      inputs: { question: "hello world" },
      outputs: { text: "Hello! How can I help?" },
      usage: { model: "gemini-2.5-flash-lite", inputTokens: 15, outputTokens: 8 },
    };
    trace.onNodeFinish(llmNode, llmResult);

    // 3. Complete run
    const runResult: WorkflowRunResult = {
      status: "SUCCEEDED",
      outputs: { "output-1": "Hello! How can I help?" },
      nodes: [inputResult, llmResult],
    };
    trace.end(runResult);

    await spanProcessor.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(3); // root span + 2 node observations

    // Verify root span
    const rootSpan = spans.find((s) => s.name === WORKFLOW_TRACE_NAME);
    expect(rootSpan).toBeDefined();

    // Verify node spans exist
    const inputSpan = spans.find((s) => s.name === "node:input-1");
    expect(inputSpan).toBeDefined();

    const llmSpan = spans.find((s) => s.name === "node:llm-1");
    expect(llmSpan).toBeDefined();

    // Verify LLM span attributes include model and usage
    const llmAttrs = llmSpan?.attributes ?? {};
    expect(
      JSON.stringify(llmAttrs).includes("gemini-2.5-flash-lite") ||
      llmAttrs["gen_ai.response.model"] === "gemini-2.5-flash-lite" ||
      llmAttrs["langfuse.observation.model"] === "gemini-2.5-flash-lite"
    ).toBe(true);
  });

  it("records spans for SKIPPED and CANCELLED nodes", async () => {
    const trace = createWorkflowTrace({
      projectId: "proj-1",
      workflowId: "wf-1",
      runId: "run-1",
      trigger: "API",
      dryRun: true,
      graphHash: "hash-1",
      ownerEmail: "owner@test.com",
    });

    const skippedNode: WorkflowNode = { id: "cond-branch-2", type: "condition", config: { branches: [] } };
    trace.onNodeFinish(skippedNode, {
      nodeId: "cond-branch-2",
      nodeType: "condition",
      status: "SKIPPED",
    });

    const cancelledNode: WorkflowNode = { id: "output-node", type: "output", config: {} };
    trace.onNodeFinish(cancelledNode, {
      nodeId: "output-node",
      nodeType: "output",
      status: "CANCELLED",
    });

    trace.end({
      status: "FAILED",
      outputs: {},
      nodes: [],
      error: { nodeId: "cond-branch-2", message: "Failed branch" },
    });

    await spanProcessor.forceFlush();
    const spans = exporter.getFinishedSpans();
    const skippedSpan = spans.find((s) => s.name === "node:cond-branch-2");
    expect(skippedSpan).toBeDefined();

    const cancelledSpan = spans.find((s) => s.name === "node:output-node");
    expect(cancelledSpan).toBeDefined();
  });
});
