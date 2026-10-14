import { prisma } from "@/lib/prisma";
import { geminiProvider } from "@/lib/ai/gemini";
import type { LlmProvider } from "@/lib/ai/llm-provider";
import {
  executeWorkflow,
  type NodeInputs,
  type NodeResult,
  type PortValue,
  type WorkflowRunResult,
} from "./dag-executor";
import type { WorkflowNode } from "./dsl-types";
import { validateWorkflowGraph, type ValidationError } from "./dsl-validator";
import { createNodeHandlers } from "./nodes";
import { createDryRunRetrieve } from "./nodes/rag";
import { dryRunProvider } from "./dry-run-provider";
import { withQuota } from "./quota";
import {
  createWorkflowTrace,
  truncateJsonString,
} from "./tracing";
import { MAX_JSON_FIELD_LENGTH_BYTES } from "./constants";

export type RunSummary = {
  id: string;
  status: string;
  dryRun: boolean;
  graphHash: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  error?: string | null;
};

export type RunNodeDetail = {
  nodeId: string;
  nodeType: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
};

export type RunDetail = RunSummary & {
  input: { query: string };
  output: Record<string, PortValue> | null;
  traceId: string | null;
  nodes: RunNodeDetail[];
};

export interface RunWorkflowOptions {
  ownerId: string;
  workflowId: string;
  input: { query: string };
  dryRun?: boolean;
  trigger?: "MANUAL" | "API";
  versionId?: string;
  llmProvider?: LlmProvider;
  quotaLimit?: number;
}

export type RunWorkflowResult =
  | { ok: true; run: RunDetail }
  | { ok: false; notFound?: boolean; validationErrors?: ValidationError[]; message?: string };

export async function runWorkflow(options: RunWorkflowOptions): Promise<RunWorkflowResult> {
  const { ownerId, workflowId, input, dryRun = false, trigger = "MANUAL", versionId } = options;

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ownerId },
  });
  if (!workflow) {
    return { ok: false, notFound: true, message: `Workflow "${workflowId}" not found for owner.` };
  }

  // Determine graph to run (versioned or draft)
  let rawGraph: unknown;
  let targetGraphHash = workflow.draftGraphHash;
  let targetGraphSnapshot = workflow.draftGraph;

  if (versionId) {
    const version = await prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId },
    });
    if (!version) {
      return { ok: false, notFound: true, message: `WorkflowVersion "${versionId}" not found.` };
    }
    try {
      rawGraph = JSON.parse(version.graph);
      targetGraphHash = version.graphHash;
      targetGraphSnapshot = version.graph;
    } catch {
      return {
        ok: false,
        validationErrors: [{ code: "INVALID_SHAPE", message: "Version graph is not valid JSON." }],
      };
    }
  } else {
    try {
      rawGraph = JSON.parse(workflow.draftGraph);
    } catch {
      return {
        ok: false,
        validationErrors: [{ code: "INVALID_SHAPE", message: "Draft graph is not valid JSON." }],
      };
    }
  }

  const validation = validateWorkflowGraph(rawGraph);
  if (!validation.ok) {
    return {
      ok: false,
      validationErrors: validation.errors,
    };
  }
  const graph = validation.graph;

  const run = await prisma.workflowRun.create({
    data: {
      projectId: workflow.projectId,
      ownerId,
      workflowId,
      workflowVersionId: versionId ?? null,
      graphSnapshot: targetGraphSnapshot,
      graphHash: targetGraphHash,
      status: "RUNNING",
      trigger,
      dryRun: Boolean(dryRun),
      input: JSON.stringify(input),
      startedAt: new Date(),
    },
  });

  const activeLlmProvider = dryRun
    ? dryRunProvider
    : withQuota(options.llmProvider ?? geminiProvider, { limit: options.quotaLimit });

  const handlers = createNodeHandlers({
    llm: activeLlmProvider,
    projectId: workflow.projectId,
    retrieve: dryRun ? createDryRunRetrieve() : undefined,
  });

  const trace = createWorkflowTrace({
    projectId: workflow.projectId,
    workflowId: workflow.id,
    runId: run.id,
    trigger,
    dryRun: Boolean(dryRun),
    graphHash: targetGraphHash,
    ownerEmail: ownerId,
    query: input.query,
  });

  const executedNodes: NodeResult[] = [];

  const onNodeStart = (node: WorkflowNode, inputs: NodeInputs) => {
    trace.onNodeStart(node, inputs);
  };

  const onNodeFinish = async (node: WorkflowNode, result: NodeResult) => {
    executedNodes.push(result);
    trace.onNodeFinish(node, result);

    const inputJson = result.inputs ? truncateJsonString(result.inputs, MAX_JSON_FIELD_LENGTH_BYTES) : null;
    const outputJson = result.outputs ? truncateJsonString(result.outputs, MAX_JSON_FIELD_LENGTH_BYTES) : null;

    await prisma.nodeExecution.create({
      data: {
        runId: run.id,
        nodeId: node.id,
        nodeType: node.type,
        status: result.status,
        input: inputJson,
        output: outputJson,
        error: result.error ? result.error.slice(0, 5000) : null,
        model: result.usage?.model ?? null,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        startedAt: result.startedAt ?? null,
        finishedAt: result.finishedAt ?? null,
        durationMs: result.durationMs ?? null,
      },
    });
  };

  let execResult: WorkflowRunResult;
  try {
    execResult = await executeWorkflow(graph, input, {
      handlers,
      onNodeStart,
      onNodeFinish,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    execResult = {
      status: "FAILED",
      outputs: {},
      nodes: executedNodes,
      error: { nodeId: "workflow", message },
    };
  }

  trace.end(execResult);

  const finishedAt = new Date();
  const runError = execResult.status === "FAILED" ? (execResult.error?.message ?? "Execution failed") : null;

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: execResult.status,
      output: execResult.outputs ? JSON.stringify(execResult.outputs) : null,
      error: runError,
      traceId: trace.traceId,
      finishedAt,
    },
  });

  const runDetail: RunDetail = {
    id: run.id,
    status: execResult.status,
    dryRun: Boolean(dryRun),
    graphHash: targetGraphHash,
    startedAt: run.startedAt,
    finishedAt,
    error: runError,
    input,
    output: execResult.outputs ?? null,
    traceId: trace.traceId,
    nodes: executedNodes.map((n) => ({
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      status: n.status,
      input: n.inputs ?? null,
      output: n.outputs ?? null,
      error: n.error ?? null,
      model: n.usage?.model ?? null,
      inputTokens: n.usage?.inputTokens ?? null,
      outputTokens: n.usage?.outputTokens ?? null,
      durationMs: n.durationMs ?? null,
    })),
  };

  return { ok: true, run: runDetail };
}

export async function listRuns(
  ownerId: string,
  workflowId: string,
  limit = 20
): Promise<RunSummary[]> {
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId, ownerId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      status: true,
      dryRun: true,
      graphHash: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });
  return runs;
}

export async function getRunDetail(ownerId: string, runId: string): Promise<RunDetail | null> {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, ownerId },
    include: {
      nodeExecutions: true,
    },
  });
  if (!run) return null;

  let parsedInput: { query: string } = { query: "" };
  try {
    parsedInput = JSON.parse(run.input);
  } catch {
    parsedInput = { query: "" };
  }

  let parsedOutput: Record<string, PortValue> | null = null;
  if (run.output) {
    try {
      parsedOutput = JSON.parse(run.output);
    } catch {
      parsedOutput = null;
    }
  }

  const nodes = run.nodeExecutions
    .sort((a, b) => {
      const aTime = a.startedAt?.getTime() ?? 0;
      const bTime = b.startedAt?.getTime() ?? 0;
      return aTime - bTime;
    })
    .map((ne) => {
      let inputVal: unknown = null;
      let outputVal: unknown = null;
      try {
        if (ne.input) inputVal = JSON.parse(ne.input);
      } catch {
        inputVal = ne.input;
      }
      try {
        if (ne.output) outputVal = JSON.parse(ne.output);
      } catch {
        outputVal = ne.output;
      }
      return {
        nodeId: ne.nodeId,
        nodeType: ne.nodeType,
        status: ne.status,
        input: inputVal,
        output: outputVal,
        error: ne.error,
        model: ne.model,
        inputTokens: ne.inputTokens,
        outputTokens: ne.outputTokens,
        durationMs: ne.durationMs,
      };
    });

  return {
    id: run.id,
    status: run.status,
    dryRun: run.dryRun,
    graphHash: run.graphHash,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error,
    input: parsedInput,
    output: parsedOutput,
    traceId: run.traceId,
    nodes,
  };
}
