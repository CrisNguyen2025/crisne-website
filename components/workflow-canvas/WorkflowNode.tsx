"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasFlowNode } from "@/lib/workflow/canvas-mapping";
import { resolveNodePorts } from "@/lib/workflow/node-registry";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import {
  LogIn,
  RefreshCw,
  Database,
  GitFork,
  GitMerge,
  Sparkles,
  LogOut,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Ban,
} from "lucide-react";
import type { NodeType, WorkflowNode as DslWorkflowNode } from "@/lib/workflow/dsl-types";

function getNodeIcon(type: NodeType) {
  switch (type) {
    case "input":
      return <LogIn className="h-4 w-4 text-emerald-500" />;
    case "rewrite":
      return <RefreshCw className="h-4 w-4 text-violet-500" />;
    case "rag":
      return <Database className="h-4 w-4 text-amber-500" />;
    case "condition":
      return <GitFork className="h-4 w-4 text-cyan-500" />;
    case "merge":
      return <GitMerge className="h-4 w-4 text-indigo-500" />;
    case "llm":
      return <Sparkles className="h-4 w-4 text-sky-500" />;
    case "output":
      return <LogOut className="h-4 w-4 text-rose-500" />;
  }
}

function getNodeTheme(type: NodeType) {
  switch (type) {
    case "input":
      return "border-emerald-500/40 hover:border-emerald-500";
    case "rewrite":
      return "border-violet-500/40 hover:border-violet-500";
    case "rag":
      return "border-amber-500/40 hover:border-amber-500";
    case "condition":
      return "border-cyan-500/40 hover:border-cyan-500";
    case "merge":
      return "border-indigo-500/40 hover:border-indigo-500";
    case "llm":
      return "border-sky-500/40 hover:border-sky-500";
    case "output":
      return "border-rose-500/40 hover:border-rose-500";
  }
}

export const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  id,
  data,
  selected,
}: NodeProps<CanvasFlowNode>) {
  const nodeType = data.nodeType ?? "input";
  const label = data.label || id;
  const config = data.config ?? {};

  const errors = useCanvasStore((s) => s.errors);
  const lastRun = useCanvasStore((s) => s.lastRun);

  // Check if this node has validation errors
  const hasError = errors.some((err) => err.nodeId === id || err.nodeIds?.includes(id));

  // Check execution status from last run
  const nodeRun = lastRun?.nodes.find((n) => n.nodeId === id);

  // Derive ports
  const dslNode: DslWorkflowNode = {
    id,
    type: nodeType,
    config,
  } as DslWorkflowNode;

  const { inputs, outputs } = resolveNodePorts(dslNode);

  // Status indicators
  let statusBadge = null;
  let statusRing = "";

  if (nodeRun) {
    switch (nodeRun.status) {
      case "SUCCEEDED":
        statusBadge = (
          <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            <span>{nodeRun.durationMs ? `${nodeRun.durationMs}ms` : "OK"}</span>
          </span>
        );
        statusRing = "ring-2 ring-emerald-500/80";
        break;
      case "SKIPPED":
        statusBadge = (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <MinusCircle className="h-3 w-3" />
            <span>Skipped</span>
          </span>
        );
        statusRing = "opacity-60 border-dashed";
        break;
      case "FAILED":
        statusBadge = (
          <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
            <XCircle className="h-3 w-3" />
            <span>Failed</span>
          </span>
        );
        statusRing = "ring-2 ring-destructive";
        break;
      case "CANCELLED":
        statusBadge = (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
            <Ban className="h-3 w-3" />
            <span>Cancelled</span>
          </span>
        );
        statusRing = "opacity-40";
        break;
    }
  }

  return (
    <div
      className={`relative min-w-[180px] rounded-2xl border bg-card p-3 shadow-md transition-all ${getNodeTheme(
        nodeType
      )} ${
        selected ? "ring-2 ring-primary shadow-lg" : ""
      } ${
        hasError ? "ring-2 ring-destructive border-destructive" : ""
      } ${statusRing}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          {getNodeIcon(nodeType)}
          <span className="text-xs font-semibold text-foreground tracking-tight truncate max-w-[120px]">
            {label}
          </span>
        </div>
        {hasError ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : (
          statusBadge
        )}
      </div>

      {/* Node Body / Subtitle */}
      <div className="mt-2 text-[11px] text-muted-foreground truncate">
        {nodeType === "condition" && "branches" in config ? (
          <span>{(config as { branches?: unknown[] }).branches?.length ?? 1} branch(es)</span>
        ) : nodeType === "merge" && "mode" in config ? (
          <span>Mode: {(config as { mode: string }).mode}</span>
        ) : nodeType === "llm" ? (
          <span>Gemini 2.5 Flash Lite</span>
        ) : (
          <span className="capitalize">{nodeType} node</span>
        )}
      </div>

      {/* Target (Input) Handles on Left */}
      <div className="absolute -left-2 top-0 flex h-full flex-col justify-around py-4">
        {inputs.map((port) => (
          <div key={port.name} className="relative flex items-center">
            <Handle
              type="target"
              position={Position.Left}
              id={port.name}
              className={`!h-3 !w-3 !rounded-full !border-2 !border-background ${
                port.type === "documents" ? "!bg-amber-500" : "!bg-sky-500"
              }`}
            />
            <span className="pointer-events-none absolute left-4 text-[9px] font-mono text-muted-foreground/70 uppercase">
              {port.name}
            </span>
          </div>
        ))}
      </div>

      {/* Source (Output) Handles on Right */}
      <div className="absolute -right-2 top-0 flex h-full flex-col justify-around py-4">
        {outputs.map((port) => (
          <div key={port.name} className="relative flex items-center justify-end">
            <span className="pointer-events-none absolute right-4 text-[9px] font-mono text-muted-foreground/70 uppercase">
              {port.name}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.name}
              className={`!h-3 !w-3 !rounded-full !border-2 !border-background ${
                port.type === "documents" ? "!bg-amber-500" : "!bg-sky-500"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export const nodeTypes = {
  input: WorkflowNodeComponent,
  rewrite: WorkflowNodeComponent,
  rag: WorkflowNodeComponent,
  condition: WorkflowNodeComponent,
  merge: WorkflowNodeComponent,
  llm: WorkflowNodeComponent,
  output: WorkflowNodeComponent,
};
