import React, { useEffect, useState } from "react";
import { CheckCircleIcon, ChevronDownIcon } from "./icons";

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
      className="grid grid-cols-2 gap-[2px] w-3 h-3 shrink-0"
      aria-hidden="true"
    >
      <span className="rounded-full bg-[#2AABEE] animate-pulse" />
      <span className="rounded-full bg-[#2AABEE] animate-pulse [animation-delay:150ms]" />
      <span className="rounded-full bg-[#2AABEE] animate-pulse [animation-delay:450ms]" />
      <span className="rounded-full bg-[#2AABEE] animate-pulse [animation-delay:300ms]" />
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
    <div className="text-xs">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left select-none transition-colors ${
          canExpand ? "cursor-pointer hover:bg-slate-100/80" : "cursor-default"
        }`}
      >
        {running ? (
          <StepSpinner />
        ) : (
          <CheckCircleIcon className="w-3 h-3 text-emerald-600 shrink-0" />
        )}
        <span
          className={`truncate text-[11.5px] ${
            running ? "text-slate-700" : "text-slate-500"
          }`}
        >
          {label}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-slate-400 shrink-0">
          {startedAt !== undefined && (running || endedAt !== undefined) && (
            <ElapsedTimer
              startedAt={startedAt}
              endedAt={running ? undefined : endedAt}
            />
          )}
          {canExpand && (
            <ChevronDownIcon
              className={`w-3 h-3 transition-transform duration-200 ${
                expanded ? "rotate-180" : "-rotate-90"
              }`}
            />
          )}
        </span>
      </button>

      {canExpand && expanded && (
        <div className="ml-5 mt-1 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
          {detail}
        </div>
      )}
    </div>
  );
}
