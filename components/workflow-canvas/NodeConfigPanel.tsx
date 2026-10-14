"use client";

import React from "react";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import type { ConditionBranch } from "@/lib/workflow/dsl-types";
import {
  X,
  Trash2,
  Plus,
  Sliders,
  Sparkles,
  GitFork,
  GitMerge,
  Info,
} from "lucide-react";

import type { ProjectDocumentItem } from "@/logic/workflow/api";

interface NodeConfigPanelProps {
  documents?: ProjectDocumentItem[];
}

export function NodeConfigPanel({ documents = [] }: NodeConfigPanelProps) {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const graph = useCanvasStore((s) => s.graph);
  const ui = useCanvasStore((s) => s.ui);
  const updateConfig = useCanvasStore((s) => s.updateConfig);
  const removeElements = useCanvasStore((s) => s.removeElements);

  if (!selectedNodeId) return null;

  const node = graph.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const label = ui.labels[node.id] || node.id;
  const config = node.config as Record<string, unknown>;

  const handleDeleteNode = () => {
    if (node.type === "input") return;
    removeElements([node.id], []);
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-border/70 bg-card/60 backdrop-blur-md p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Configure Node
          </h2>
        </div>
        <button
          type="button"
          onClick={() => selectNode(null)}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close configuration panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Node Info & ID */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="block font-mono text-[10px] text-muted-foreground">{node.id}</span>
        </div>
        {node.type !== "input" && (
          <button
            type="button"
            onClick={handleDeleteNode}
            className="flex items-center gap-1 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete</span>
          </button>
        )}
      </div>

      {/* Config Form by NodeType */}
      <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
        {/* INPUT NODE */}
        {node.type === "input" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Query Description</label>
            <input
              type="text"
              value={(config.description as string) || ""}
              onChange={(e) => updateConfig(node.id, { description: e.target.value })}
              placeholder="e.g. User query or question"
              className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
            />
            <p className="text-[11px] text-muted-foreground">
              Entry point for workflow execution. Passes the query string down the graph.
            </p>
          </div>
        )}

        {/* CONDITION NODE */}
        {node.type === "condition" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <GitFork className="h-3.5 w-3.5 text-cyan-500" />
                <span>Branches</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const branches = ((config.branches as ConditionBranch[]) || []).slice();
                  branches.push({
                    name: `branch_${branches.length + 1}`,
                    operator: "contains",
                    value: "",
                  });
                  updateConfig(node.id, { branches });
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                <span>Add Branch</span>
              </button>
            </div>

            {((config.branches as ConditionBranch[]) || []).map((branch, idx) => (
              <div key={idx} className="rounded-xl border border-border/70 bg-card p-2.5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={branch.name}
                    onChange={(e) => {
                      const branches = ((config.branches as ConditionBranch[]) || []).slice();
                      branches[idx] = { ...branches[idx], name: e.target.value.replace(/[^A-Za-z0-9_]/g, "") };
                      updateConfig(node.id, { branches });
                    }}
                    placeholder="branch_name"
                    className="w-1/2 rounded-lg border border-border/80 bg-background px-2 py-1 text-xs font-mono font-medium text-foreground focus:border-primary focus:outline-hidden"
                  />
                  <select
                    value={branch.operator}
                    onChange={(e) => {
                      const branches = ((config.branches as ConditionBranch[]) || []).slice();
                      branches[idx] = {
                        ...branches[idx],
                        operator: e.target.value as ConditionBranch["operator"],
                      };
                      updateConfig(node.id, { branches });
                    }}
                    className="rounded-lg border border-border/80 bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  >
                    <option value="contains">contains</option>
                    <option value="equals">equals</option>
                    <option value="length_gt">length_gt</option>
                  </select>

                  {((config.branches as ConditionBranch[]) || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const branches = ((config.branches as ConditionBranch[]) || []).filter(
                          (_, i) => i !== idx
                        );
                        updateConfig(node.id, { branches });
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remove branch"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={branch.value}
                  onChange={(e) => {
                    const branches = ((config.branches as ConditionBranch[]) || []).slice();
                    branches[idx] = { ...branches[idx], value: e.target.value };
                    updateConfig(node.id, { branches });
                  }}
                  placeholder="Target value..."
                  className="w-full rounded-lg border border-border/80 bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>
            ))}

            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
              Branch <span className="font-mono font-medium text-foreground">else</span> is always available as fallback output.
            </div>
          </div>
        )}

        {/* MERGE NODE */}
        {node.type === "merge" && (
          <div className="space-y-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <GitMerge className="h-3.5 w-3.5 text-indigo-500" />
              <span>Merge Mode</span>
            </label>
            <select
              value={(config.mode as string) || "first_active"}
              onChange={(e) => updateConfig(node.id, { mode: e.target.value })}
              className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
            >
              <option value="first_active">first_active (use first non-skipped input)</option>
              <option value="join_strings">join_strings (concatenate text with separator)</option>
              <option value="concat_documents">concat_documents (combine document chunks)</option>
            </select>

            {config.mode === "join_strings" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Separator</label>
                <input
                  type="text"
                  value={(config.separator as string) ?? "\\n\\n"}
                  onChange={(e) => updateConfig(node.id, { separator: e.target.value })}
                  placeholder="Separator (e.g. \n\n or space)"
                  className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>
            )}
          </div>
        )}

        {/* LLM NODE */}
        {node.type === "llm" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                  <span>Prompt Template</span>
                </label>
                <span className="text-[10px] text-muted-foreground">Required</span>
              </div>
              <textarea
                rows={4}
                value={(config.prompt as string) || ""}
                onChange={(e) => updateConfig(node.id, { prompt: e.target.value })}
                placeholder="User asked: {{inputs.question}}. Context: {{inputs.context}}"
                className="w-full rounded-xl border border-border/80 bg-background p-2.5 font-mono text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
              <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span>Variables:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig(node.id, {
                      prompt: `${(config.prompt as string) || ""}{{inputs.question}}`,
                    })
                  }
                  className="rounded bg-muted px-1 py-0.5 font-mono text-primary hover:bg-muted/80"
                >
                  {"{{inputs.question}}"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig(node.id, {
                      prompt: `${(config.prompt as string) || ""}{{inputs.context}}`,
                    })
                  }
                  className="rounded bg-muted px-1 py-0.5 font-mono text-primary hover:bg-muted/80"
                >
                  {"{{inputs.context}}"}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">System Instruction</label>
              <textarea
                rows={2}
                value={(config.system as string) || ""}
                onChange={(e) => updateConfig(node.id, { system: e.target.value })}
                placeholder="Optional system role or instructions"
                className="w-full rounded-xl border border-border/80 bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-foreground">Temperature</label>
                <span className="font-mono text-muted-foreground">
                  {typeof config.temperature === "number" ? config.temperature : 0.3}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={typeof config.temperature === "number" ? config.temperature : 0.3}
                onChange={(e) => updateConfig(node.id, { temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Max Output Tokens</label>
              <input
                type="number"
                min="64"
                max="4096"
                step="64"
                value={(config.maxOutputTokens as number) || 1024}
                onChange={(e) =>
                  updateConfig(node.id, { maxOutputTokens: parseInt(e.target.value, 10) })
                }
                className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* RAG NODE */}
        {node.type === "rag" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Top K Chunks (1–20)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={(config.topK as number) || 4}
                onChange={(e) => updateConfig(node.id, { topK: parseInt(e.target.value, 10) })}
                className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Minimum Score (0.0 – 1.0)</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={(config.minScore as number) ?? 0.0}
                onChange={(e) => updateConfig(node.id, { minScore: parseFloat(e.target.value) })}
                className="w-full rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Restrict to Documents</label>
                <span className="text-[10px] text-muted-foreground">
                  {((config.documentIds as string[]) || []).length === 0
                    ? "All Documents"
                    : `${((config.documentIds as string[]) || []).length} selected`}
                </span>
              </div>
              {documents && documents.length > 0 ? (
                <div className="max-h-28 overflow-y-auto rounded-xl border border-border/80 bg-background p-2 space-y-1.5">
                  {documents.map((doc) => {
                    const selectedDocIds = (config.documentIds as string[]) || [];
                    const isChecked = selectedDocIds.includes(doc.id);
                    return (
                      <label key={doc.id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedDocIds, doc.id]
                              : selectedDocIds.filter((id) => id !== doc.id);
                            updateConfig(node.id, {
                              documentIds: next.length > 0 ? next : undefined,
                            });
                          }}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="truncate text-foreground text-[11px]">{doc.filename}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  No documents in project. Open Knowledge Base to upload files.
                </p>
              )}
            </div>
          </div>
        )}

        {/* REWRITE NODE */}
        {node.type === "rewrite" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Instruction</label>
              <textarea
                rows={3}
                value={(config.instruction as string) || ""}
                onChange={(e) => updateConfig(node.id, { instruction: e.target.value })}
                placeholder="Rewrite user query into standalone search question..."
                className="w-full rounded-xl border border-border/80 bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
              <p className="text-[10px] text-muted-foreground">
                Uses {"{{inputs.query}}"} to generate a refined search query.
              </p>
            </div>
          </div>
        )}

        {/* OUTPUT NODE */}
        {node.type === "output" && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
            <Info className="mx-auto h-5 w-5 mb-1.5 opacity-60" />
            <p className="font-medium text-foreground">Terminal Output Node</p>
            <p className="mt-1 text-[11px]">
              Captures the final port value of the workflow run as the answer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
