"use client";

import React, { useState } from "react";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import { executeRunApi, fetchRunsHistoryApi, fetchRunDetailApi } from "@/logic/workflow/api";
import type { RunSummary } from "@/lib/workflow/run-service";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Terminal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Tag,
  X,
} from "lucide-react";

interface RunPanelProps {
  workflowId: string;
  versionId?: string | null;
  versionNumber?: number | null;
  onClearVersion?: () => void;
  initialRuns?: RunSummary[];
}

export function RunPanel({
  workflowId,
  versionId,
  versionNumber,
  onClearVersion,
  initialRuns = [],
}: RunPanelProps) {
  const [query, setQuery] = useState("Hello Cris");
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<RunSummary[]>(initialRuns);
  const [showHistory, setShowHistory] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const errors = useCanvasStore((s) => s.errors);
  const lastRun = useCanvasStore((s) => s.lastRun);
  const setLastRun = useCanvasStore((s) => s.setLastRun);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);

  const loadHistory = async () => {
    const list = await fetchRunsHistoryApi(workflowId);
    setHistory(list);
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0) {
      await loadHistory();
    }
  };

  const handleRun = async () => {
    if (!query.trim() || isRunning || errors.length > 0) return;

    setIsRunning(true);
    setExecutionError(null);
    try {
      const response = await executeRunApi(
        workflowId,
        { query: query.trim() },
        dryRun,
        versionId || undefined
      );

      if (response.run) {
        setLastRun(response.run);
        loadHistory();
      } else if (response.errors) {
        setExecutionError(response.errors.map((e) => e.message).join("; "));
      } else if (response.error) {
        setExecutionError(response.error);
      }
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : "Run failed unexpectedly.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSelectHistoryRun = async (runId: string) => {
    const detail = await fetchRunDetailApi(workflowId, runId);
    if (detail) {
      setLastRun(detail);
    }
  };

  const selectedNodeRun = lastRun?.nodes.find((n) => n.nodeId === selectedNodeId);

  return (
    <div className="flex flex-col border-t border-border/70 bg-card/90 backdrop-blur-md shadow-2xl transition-all">
      {/* Panel Bar Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Run & Debug
          </span>
          {lastRun && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 ${
                lastRun.status === "SUCCEEDED"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {lastRun.status === "SUCCEEDED" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {lastRun.status}
              {lastRun.dryRun && " (Dry Run)"}
            </span>
          )}
          {versionNumber ? (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Tag className="h-3 w-3" />
              <span>Target: v{versionNumber}</span>
              {onClearVersion && (
                <button
                  type="button"
                  onClick={onClearVersion}
                  className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Switch back to Draft"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Target: Draft
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHistory}
            className="flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="Toggle panel collapse"
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div className="p-4 grid grid-cols-1 gap-4 lg:grid-cols-12 max-h-72 overflow-y-auto">
          {executionError && (
            <div className="col-span-full rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <p className="font-semibold">Execution Failed:</p>
              <p className="mt-0.5 text-[11px]">{executionError}</p>
              {executionError.includes("QUOTA_EXCEEDED") && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Your daily Gemini quota was reached. Switch on Dry-Run mode to test logic without quota.
                </p>
              )}
            </div>
          )}
          {/* Controls: Query & Dry Run */}
          <div className="lg:col-span-5 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Input Query</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRun();
                  }}
                  placeholder="Enter input query for workflow..."
                  className="flex-1 rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isRunning || errors.length > 0 || !query.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  <span>Run</span>
                </button>
              </div>
            </div>

            {/* Dry Run Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-2.5">
              <div>
                <span className="text-xs font-medium text-foreground">Dry-run mode</span>
                <p className="text-[10px] text-muted-foreground">
                  Simulates LLM response without calling Gemini or consuming quota.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
          </div>

          {/* Output & Inspection */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* Final Output */}
            {lastRun && (
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <span className="text-xs font-semibold text-foreground">Final Output</span>
                  {lastRun.finishedAt && lastRun.startedAt && (
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(lastRun.finishedAt).getTime() - new Date(lastRun.startedAt).getTime()}ms
                    </span>
                  )}
                </div>

                {lastRun.status === "FAILED" ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                    <p className="font-semibold">Error:</p>
                    <p className="mt-0.5 font-mono text-[11px]">{lastRun.error || "Execution failed."}</p>
                    {lastRun.error?.includes("QUOTA_EXCEEDED") && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Your free-tier Gemini quota for the workflow builder was exceeded. Please try dry-run mode or wait until tomorrow UTC.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-24 overflow-y-auto rounded-lg bg-muted/40 p-2 text-xs font-mono text-foreground">
                    {lastRun.output ? (
                      Object.entries(lastRun.output).map(([nodeId, val]) => (
                        <div key={nodeId}>
                          <span className="text-muted-foreground">{nodeId}:</span>{" "}
                          <span>{typeof val === "string" ? val : JSON.stringify(val)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No output ports emitted</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Selected Node Inspection */}
            {selectedNodeRun && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Node: {selectedNodeRun.nodeId} ({selectedNodeRun.nodeType})
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Status: {selectedNodeRun.status}
                  </span>
                </div>
                {selectedNodeRun.durationMs !== null && (
                  <p className="text-[10px] text-muted-foreground">
                    Duration: {selectedNodeRun.durationMs}ms · Model: {selectedNodeRun.model || "n/a"} · Tokens: {selectedNodeRun.inputTokens ?? 0} in / {selectedNodeRun.outputTokens ?? 0} out
                  </p>
                )}
                {/* Check if output contains retrieved documents */}
                {(() => {
                  let parsedOut: { documents?: Array<{ id?: string; heading?: string; content?: string; score?: number }> } | null = null;
                  try {
                    parsedOut = typeof selectedNodeRun.output === "string" ? JSON.parse(selectedNodeRun.output) : selectedNodeRun.output;
                  } catch {
                    parsedOut = null;
                  }

                  if (parsedOut?.documents && Array.isArray(parsedOut.documents)) {
                    return (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                          <span>Retrieved Chunks ({parsedOut.documents.length})</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                          {parsedOut.documents.map((doc, idx: number) => (
                            <div key={doc.id || idx} className="rounded-lg border border-border/70 bg-card p-2 text-[11px] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground truncate">
                                  {doc.heading || `Chunk #${idx + 1}`}
                                </span>
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                                  Score: {typeof doc.score === "number" ? doc.score.toFixed(3) : "n/a"}
                                </span>
                              </div>
                              <p className="text-muted-foreground line-clamp-2 font-mono text-[10px]">
                                {doc.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (selectedNodeRun.output !== undefined && selectedNodeRun.output !== null) {
                    return (
                      <div className="max-h-16 overflow-y-auto rounded bg-card/60 p-1.5 font-mono text-[10px]">
                        Output: {typeof selectedNodeRun.output === "string" ? selectedNodeRun.output : JSON.stringify(selectedNodeRun.output)}
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistory && (
        <div className="border-t border-border/60 bg-card p-4 space-y-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-semibold text-foreground">Recent Runs (Past 20)</span>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Close
            </button>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs executed yet.</p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => handleSelectHistoryRun(h.id)}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    {h.status === "SUCCEEDED" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className="font-mono text-[11px]">{h.id.slice(0, 8)}</span>
                    {h.dryRun && (
                      <span className="rounded bg-muted px-1 py-0.2 text-[9px] text-muted-foreground">
                        dry
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                    <span>{h.startedAt ? new Date(h.startedAt).toLocaleTimeString() : ""}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
