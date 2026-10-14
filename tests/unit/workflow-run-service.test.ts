import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWorkflow, getRunDetail } from "@/lib/workflow/run-service";
import { createProject, createWorkflow, saveDraft } from "@/lib/workflow/repository";
import type { WorkflowGraph } from "@/lib/workflow/dsl-types";
import { SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI } from "@/scripts/seed-sample-workflow";
import type { LlmProvider } from "@/lib/ai/llm-provider";

describe("run-service", () => {
  const ownerId = "test-owner@example.com";

  it("dry-run sample workflow → SUCCEEDED, has all NodeExecution entries, matching graphHash", async () => {
    const project = await createProject(ownerId, { name: "Test Run Project" });
    const workflow = await createWorkflow(ownerId, project.id, "Sample WF");

    // Save sample graph
    const saveRes = await saveDraft(ownerId, workflow.id, {
      graph: SAMPLE_WORKFLOW_GRAPH,
      ui: SAMPLE_WORKFLOW_UI,
    });

    const result = await runWorkflow({
      ownerId,
      workflowId: workflow.id,
      input: { query: "hello world" },
      dryRun: true,
      trigger: "MANUAL",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.status).toBe("SUCCEEDED");
    expect(result.run.dryRun).toBe(true);
    expect(result.run.graphHash).toBe(saveRes?.draftGraphHash);
    expect(result.run.nodes.length).toBe(5);

    // Verify output from dryRun provider
    const outputVal = result.run.output?.["output-1"];
    expect(typeof outputVal).toBe("string");
    expect(outputVal).toContain("[dry-run]");

    // Verify detail retrieval matches
    const detail = await getRunDetail(ownerId, result.run.id);
    expect(detail).toBeDefined();
    expect(detail?.id).toBe(result.run.id);
    expect(detail?.nodes.length).toBe(5);
  });

  it("propagates SKIPPED status to unreached branch nodes", async () => {
    const project = await createProject(ownerId, { name: "Branch Project" });
    const workflow = await createWorkflow(ownerId, project.id, "Branch WF");

    // Graph with 2 distinct branch LLM nodes:
    // input -> condition(branchA: contains "A")
    //   -> branchA -> llm_A -> merge -> output
    //   -> else    -> llm_B -> merge -> output
    const branchingGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "input-1", type: "input", config: {} },
        {
          id: "cond-1",
          type: "condition",
          config: { branches: [{ name: "branchA", operator: "contains", value: "hello" }] },
        },
        { id: "llm-A", type: "llm", config: { prompt: "Branch A: {{inputs.question}}" } },
        { id: "llm-B", type: "llm", config: { prompt: "Branch B: {{inputs.question}}" } },
        { id: "merge-1", type: "merge", config: { mode: "first_active" } },
        { id: "output-1", type: "output", config: {} },
      ],
      edges: [
        { id: "e1", sourceNodeId: "input-1", sourcePort: "query", targetNodeId: "cond-1", targetPort: "value" },
        { id: "e2", sourceNodeId: "cond-1", sourcePort: "branchA", targetNodeId: "llm-A", targetPort: "question" },
        { id: "e3", sourceNodeId: "cond-1", sourcePort: "else", targetNodeId: "llm-B", targetPort: "question" },
        { id: "e4", sourceNodeId: "llm-A", sourcePort: "text", targetNodeId: "merge-1", targetPort: "items" },
        { id: "e5", sourceNodeId: "llm-B", sourcePort: "text", targetNodeId: "merge-1", targetPort: "items" },
        { id: "e6", sourceNodeId: "merge-1", sourcePort: "value", targetNodeId: "output-1", targetPort: "value" },
      ],
    };

    await saveDraft(ownerId, workflow.id, {
      graph: branchingGraph,
      ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    });

    // Query "hello" triggers branchA -> llm-A runs, llm-B is SKIPPED
    const result = await runWorkflow({
      ownerId,
      workflowId: workflow.id,
      input: { query: "hello" },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.status).toBe("SUCCEEDED");

    const nodeA = result.run.nodes.find((n) => n.nodeId === "llm-A");
    const nodeB = result.run.nodes.find((n) => n.nodeId === "llm-B");

    expect(nodeA?.status).toBe("SUCCEEDED");
    expect(nodeB?.status).toBe("SKIPPED");
  });

  it("node failure → run FAILED and subsequent nodes CANCELLED", async () => {
    const project = await createProject(ownerId, { name: "Fail Project" });
    const workflow = await createWorkflow(ownerId, project.id, "Fail WF");

    const failingGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "input-1", type: "input", config: {} },
        { id: "llm-1", type: "llm", config: { prompt: "hello" } },
        { id: "output-1", type: "output", config: {} },
      ],
      edges: [
        { id: "e1", sourceNodeId: "input-1", sourcePort: "query", targetNodeId: "llm-1", targetPort: "question" },
        { id: "e2", sourceNodeId: "llm-1", sourcePort: "text", targetNodeId: "output-1", targetPort: "value" },
      ],
    };

    await saveDraft(ownerId, workflow.id, {
      graph: failingGraph,
      ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    });

    const failingProvider: LlmProvider = {
      generate: async () => {
        throw new Error("Simulated provider failure");
      },
      generateStream: async () => {
        throw new Error("Simulated stream failure");
      },
      embed: async () => null,
    };

    const result = await runWorkflow({
      ownerId,
      workflowId: workflow.id,
      input: { query: "test" },
      dryRun: false,
      llmProvider: failingProvider,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.status).toBe("FAILED");
    expect(result.run.error).toContain("Simulated provider failure");

    const llmNode = result.run.nodes.find((n) => n.nodeId === "llm-1");
    const outputNode = result.run.nodes.find((n) => n.nodeId === "output-1");

    expect(llmNode?.status).toBe("FAILED");
    expect(llmNode?.error).toContain("Simulated provider failure");
    expect(outputNode?.status).toBe("CANCELLED");
  });

  it("invalid graph → does not create a run and returns validation errors", async () => {
    const project = await createProject(ownerId, { name: "Invalid Project" });
    const workflow = await createWorkflow(ownerId, project.id, "Invalid WF");

    // Cyclic graph
    const invalidGraph = {
      schemaVersion: 1,
      nodes: [
        { id: "node-1", type: "condition", config: { branches: [{ name: "b1", operator: "contains", value: "x" }] } },
      ],
      edges: [
        { id: "cycle", sourceNodeId: "node-1", sourcePort: "b1", targetNodeId: "node-1", targetPort: "value" },
      ],
    };

    await saveDraft(ownerId, workflow.id, {
      graph: invalidGraph,
      ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    });

    const countBefore = await prisma.workflowRun.count({ where: { workflowId: workflow.id } });

    const result = await runWorkflow({
      ownerId,
      workflowId: workflow.id,
      input: { query: "hello" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors?.length).toBeGreaterThan(0);
    }

    const countAfter = await prisma.workflowRun.count({ where: { workflowId: workflow.id } });
    expect(countAfter).toBe(countBefore);
  });
});
