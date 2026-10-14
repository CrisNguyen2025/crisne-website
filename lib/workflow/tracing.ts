import {
  startObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing";
import type { WorkflowNode } from "./dsl-types";
import type { NodeInputs, NodeResult, WorkflowRunResult } from "./dag-executor";
import { WORKFLOW_LLM_MODEL } from "./nodes";
import {
  MAX_JSON_FIELD_LENGTH_BYTES,
  WORKFLOW_TRACE_NAME,
} from "./constants";

export interface WorkflowTraceContext {
  projectId: string;
  workflowId: string;
  runId: string;
  trigger: string;
  dryRun: boolean;
  graphHash: string;
  ownerEmail?: string;
  query?: string;
}

export function truncateJsonString(data: unknown, maxBytes = MAX_JSON_FIELD_LENGTH_BYTES): string {
  if (data === undefined || data === null) return "";
  try {
    const str = typeof data === "string" ? data : JSON.stringify(data);
    if (Buffer.byteLength(str, "utf8") <= maxBytes) {
      return str;
    }
    return str.slice(0, maxBytes - 18) + '... [truncated]"';
  } catch {
    return String(data).slice(0, maxBytes);
  }
}

export function truncateData<T>(data: T, maxBytes = MAX_JSON_FIELD_LENGTH_BYTES): T {
  if (data === undefined || data === null) return data;
  try {
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, "utf8") <= maxBytes) {
      return data;
    }
    return {
      _truncated: true,
      preview: serialized.slice(0, maxBytes - 30) + "... [truncated]",
    } as unknown as T;
  } catch {
    return data;
  }
}

export interface WorkflowTrace {
  readonly traceId: string;
  onNodeStart(node: WorkflowNode, inputs: NodeInputs): void;
  onNodeFinish(node: WorkflowNode, result: NodeResult): void;
  end(result: WorkflowRunResult): void;
}

export function createWorkflowTrace(context: WorkflowTraceContext): WorkflowTrace {
  const rootSpan = startObservation(WORKFLOW_TRACE_NAME, {
    input: { query: context.query },
    metadata: {
      projectId: context.projectId,
      workflowId: context.workflowId,
      runId: context.runId,
      trigger: context.trigger,
      dryRun: context.dryRun,
      graphHash: context.graphHash,
      userId: context.ownerEmail,
    },
  });

  const activeObservations = new Map<string, LangfuseSpan | LangfuseGeneration>();

  return {
    get traceId() {
      return rootSpan.traceId;
    },

    onNodeStart(node: WorkflowNode, inputs: NodeInputs) {
      const isLlm = node.type === "llm";
      const truncatedInputs = truncateData(inputs);

      if (isLlm) {
        const obs = rootSpan.startObservation(
          `node:${node.id}`,
          {
            input: truncatedInputs,
            model: (node.config as { model?: string }).model ?? WORKFLOW_LLM_MODEL,
            metadata: { nodeType: node.type },
          },
          { asType: "generation" }
        );
        activeObservations.set(node.id, obs);
      } else {
        const obs = rootSpan.startObservation(
          `node:${node.id}`,
          {
            input: truncatedInputs,
            metadata: { nodeType: node.type },
          },
          { asType: "span" }
        );
        activeObservations.set(node.id, obs);
      }
    },

    onNodeFinish(node: WorkflowNode, result: NodeResult) {
      let obs = activeObservations.get(node.id);
      const isLlm = node.type === "llm";

      if (!obs) {
        // Node was finished without onNodeStart (e.g. SKIPPED or CANCELLED)
        if (isLlm) {
          obs = rootSpan.startObservation(
            `node:${node.id}`,
            {
              input: result.inputs ? truncateData(result.inputs) : undefined,
              metadata: { nodeType: node.type, status: result.status },
            },
            { asType: "generation" }
          );
        } else {
          obs = rootSpan.startObservation(
            `node:${node.id}`,
            {
              input: result.inputs ? truncateData(result.inputs) : undefined,
              metadata: { nodeType: node.type, status: result.status },
            },
            { asType: "span" }
          );
        }
      }

      const truncatedOutputs = result.outputs ? truncateData(result.outputs) : undefined;

      switch (result.status) {
        case "SUCCEEDED": {
          if (isLlm) {
            obs.update({
              output: truncatedOutputs,
              usageDetails: result.usage
                ? {
                    input: result.usage.inputTokens ?? 0,
                    output: result.usage.outputTokens ?? 0,
                    total: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
                  }
                : undefined,
              model: result.usage?.model ?? (node.config as { model?: string }).model ?? WORKFLOW_LLM_MODEL,
              level: "DEFAULT",
            });
          } else {
            const isRag = node.type === "rag";
            const ragChunks =
              isRag && Array.isArray(result.outputs?.documents)
                ? (result.outputs.documents as Array<{ id?: string; score?: number; documentId?: string }>).map(
                    (d) => ({ id: d.id, score: d.score, documentId: d.documentId })
                  )
                : undefined;

            obs.update({
              output: truncatedOutputs,
              level: "DEFAULT",
              metadata: ragChunks ? { nodeType: node.type, chunks: ragChunks } : undefined,
            });
          }
          break;
        }
        case "FAILED": {
          obs.update({
            output: truncatedOutputs,
            level: "ERROR",
            statusMessage: result.error ?? "Node execution failed",
          });
          break;
        }
        case "SKIPPED": {
          obs.update({
            level: "DEFAULT",
            statusMessage: "skipped",
          });
          break;
        }
        case "CANCELLED": {
          obs.update({
            level: "WARNING",
            statusMessage: "cancelled",
          });
          break;
        }
      }

      obs.end();
      activeObservations.delete(node.id);
    },

    end(result: WorkflowRunResult) {
      rootSpan.update({
        output: result.outputs ? truncateData(result.outputs) : undefined,
        level: result.status === "SUCCEEDED" ? "DEFAULT" : "ERROR",
        statusMessage: result.error?.message,
      });
      rootSpan.end();
    },
  };
}
