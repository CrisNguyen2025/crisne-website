"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

export default function WorkflowEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report error to monitoring if configured
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-background text-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive mb-3">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-bold tracking-tight">Failed to load workflow</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {error.message || "An error occurred while loading this workflow."}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/workflows"
          className="flex items-center gap-2 rounded-xl border border-border/80 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Workflows</span>
        </Link>
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Try again</span>
        </button>
      </div>
    </div>
  );
}
