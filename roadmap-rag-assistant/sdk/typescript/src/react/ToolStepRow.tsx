import React, { useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons";

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Re-renders every second while running; frozen once `endedAt` is set. */
function ElapsedTimer({
  startedAt,
  endedAt,
}: {
  startedAt: number;
  endedAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endedAt]);

  return (
    <span className="tabular-nums">
      {formatElapsed((endedAt ?? now) - startedAt)}
    </span>
  );
}

/** 2×2 dot grid that pulses in sequence. */
function StepSpinner() {
  return (
    <span
      className="grid h-3 w-3 shrink-0 grid-cols-2 gap-0.5"
      aria-hidden="true"
    >
      <span className="animate-pulse rounded-full bg-primary" />
      <span className="animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
      <span className="animate-pulse rounded-full bg-primary [animation-delay:450ms]" />
      <span className="animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
    </span>
  );
}

export interface ToolStepRowProps {
  label: string;
  startedAt?: number;
  endedAt?: number;
  running: boolean;
  /** Expanded body; when absent the row is not clickable. */
  detail?: string;
  expanded?: boolean;
  onToggle?: () => void;
}

export function ToolStepRow({
  label,
  startedAt,
  endedAt,
  running,
  detail,
  expanded = false,
  onToggle,
}: ToolStepRowProps) {
  const canExpand = !running && !!detail && !!onToggle;

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        className={`flex w-full select-none items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${
          canExpand ? "cursor-pointer hover:bg-muted" : "cursor-default"
        }`}
      >
        {running ? (
          <StepSpinner />
        ) : (
          <CheckIcon className="h-3 w-3 text-muted-foreground" />
        )}
        <span
          className={`truncate ${running ? "text-foreground" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
          {startedAt !== undefined && (running || endedAt !== undefined) && (
            <ElapsedTimer
              startedAt={startedAt}
              endedAt={running ? undefined : endedAt}
            />
          )}
          {canExpand && (
            <ChevronDownIcon
              className={`h-3 w-3 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
            />
          )}
        </span>
      </button>

      {canExpand && expanded && (
        <div className="ml-5 mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2.5 leading-relaxed text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  );
}
