"use client";

import React from "react";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export function SaveIndicator() {
  const saveState = useCanvasStore((s) => s.saveState);
  const errors = useCanvasStore((s) => s.errors);

  if (saveState === "saving") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground shadow-2xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span>Saving...</span>
      </div>
    );
  }

  if (saveState === "error") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs text-destructive shadow-2xs">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Save failed</span>
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400 shadow-2xs">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{errors.length} issue{errors.length === 1 ? "" : "s"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 shadow-2xs">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>Saved</span>
    </div>
  );
}
