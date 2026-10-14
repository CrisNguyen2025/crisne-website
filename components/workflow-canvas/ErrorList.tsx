"use client";

import React, { useState } from "react";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

export function ErrorList() {
  const errors = useCanvasStore((s) => s.errors);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const [isOpen, setIsOpen] = useState(false);

  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-card/80 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 shadow-sm backdrop-blur-xs">
        <CheckCircle className="h-3.5 w-3.5" />
        <span className="font-medium">Workflow valid</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-sm hover:bg-destructive/15 transition-colors"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{errors.length} validation error{errors.length === 1 ? "" : "s"}</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-80 rounded-2xl border border-border bg-card p-3 shadow-xl space-y-2 z-50">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="text-xs font-semibold text-foreground">Issues</span>
            <span className="text-[10px] text-muted-foreground">Click to focus node</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {errors.map((err, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (err.nodeId) selectNode(err.nodeId);
                  else if (err.nodeIds && err.nodeIds.length > 0) selectNode(err.nodeIds[0]);
                }}
                className="cursor-pointer rounded-lg border border-border/60 bg-muted/30 p-2 text-xs transition-colors hover:bg-muted/70"
              >
                <div className="flex items-center justify-between gap-1 font-mono text-[10px] text-muted-foreground">
                  <span className="font-semibold text-destructive">{err.code}</span>
                  {err.nodeId && <span className="truncate">Node: {err.nodeId}</span>}
                </div>
                <p className="mt-1 text-[11px] text-foreground leading-snug">{err.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
