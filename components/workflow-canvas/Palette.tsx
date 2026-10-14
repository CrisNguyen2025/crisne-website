"use client";

import React from "react";
import type { NodeType } from "@/lib/workflow/dsl-types";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import {
  LogIn,
  RefreshCw,
  Database,
  GitFork,
  GitMerge,
  Sparkles,
  LogOut,
  Plus,
} from "lucide-react";

interface PaletteItem {
  type: NodeType;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeClass?: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "input",
    name: "Input",
    description: "Workflow entry query",
    icon: <LogIn className="h-4 w-4 text-emerald-500" />,
  },
  {
    type: "condition",
    name: "Condition",
    description: "Branch on values",
    icon: <GitFork className="h-4 w-4 text-cyan-500" />,
  },
  {
    type: "merge",
    name: "Merge",
    description: "Combine active branches",
    icon: <GitMerge className="h-4 w-4 text-indigo-500" />,
  },
  {
    type: "llm",
    name: "LLM Generator",
    description: "Gemini 2.5 Flash Lite",
    icon: <Sparkles className="h-4 w-4 text-sky-500" />,
  },
  {
    type: "output",
    name: "Output",
    description: "Final workflow answer",
    icon: <LogOut className="h-4 w-4 text-rose-500" />,
  },
  {
    type: "rag",
    name: "RAG Retrieval",
    description: "Knowledge Base search",
    icon: <Database className="h-4 w-4 text-amber-500" />,
    badge: "M3",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    type: "rewrite",
    name: "Query Rewrite",
    description: "Rewrite question with LLM",
    icon: <RefreshCw className="h-4 w-4 text-violet-500" />,
    badge: "M3",
    badgeClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  },
];

export function Palette() {
  const addNode = useCanvasStore((s) => s.addNode);
  const nodes = useCanvasStore((s) => s.graph.nodes);

  const handleAdd = (type: NodeType) => {
    // Offset slightly from existing nodes
    const x = 300 + (nodes.length % 5) * 40;
    const y = 200 + (nodes.length % 5) * 40;
    addNode(type, { x, y });
  };

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/reactflow-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-border/70 bg-card/50 backdrop-blur-xs p-4">
      <div className="mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Node Palette
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Click or drag a node to add to the canvas.
        </p>
      </div>

      <div className="space-y-2 overflow-y-auto pr-1">
        {PALETTE_ITEMS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            onClick={() => handleAdd(item.type)}
            className="group flex cursor-pointer select-none items-center justify-between rounded-xl border border-border/70 bg-card p-3 shadow-2xs transition-all hover:border-primary/50 hover:shadow-sm hover:translate-x-0.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {item.icon}
              </div>
              <div className="min-w-0 truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {item.name}
                  </span>
                  {item.badge && (
                    <span
                      className={`rounded border px-1 py-0.2 text-[9px] font-medium ${item.badgeClass}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
              aria-label={`Add ${item.name}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
