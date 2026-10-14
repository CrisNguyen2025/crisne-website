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

/** 2×2 dot grid that pulses in sequence. Neutral gray spinner. */
function StepSpinner() {
  return (
    <span
      className="grid h-3 w-3 shrink-0 grid-cols-2 gap-0.5"
      aria-hidden="true"
    >
      <span className="animate-pulse rounded-full bg-[#6B6862]" />
      <span className="animate-pulse rounded-full bg-[#6B6862] [animation-delay:150ms]" />
      <span className="animate-pulse rounded-full bg-[#6B6862] [animation-delay:450ms]" />
      <span className="animate-pulse rounded-full bg-[#6B6862] [animation-delay:300ms]" />
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
          canExpand ? "cursor-pointer hover:bg-[#ECEAE5]" : "cursor-default"
        }`}
      >
        {running ? (
          <StepSpinner />
        ) : (
          <CheckIcon className="h-3 w-3 text-[#3F7D58]" />
        )}
        <span
          className={`truncate ${running ? "text-[#1F1E1C] font-medium" : "text-[#6B6862]"}`}
        >
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[#6B6862]">
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
        <div className="ml-5 mt-1 whitespace-pre-wrap break-words rounded-md border border-[#E6E4DF] bg-[#F4F3F0] p-2.5 leading-relaxed text-[#1F1E1C]">
          {detail}
        </div>
      )}
    </div>
  );
}

export interface StepItem {
  id: string;
  label: string;
  startedAt?: number;
  endedAt?: number;
  running: boolean;
  detail?: string;
}

export interface CollapsibleStepsSummaryProps {
  steps: StepItem[];
  expandedTools: Record<string, boolean>;
  onToggleTool: (id: string) => void;
  isLive?: boolean;
}

export function CollapsibleStepsSummary({
  steps,
  expandedTools,
  onToggleTool,
  isLive = false,
}: CollapsibleStepsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) return null;

  const anyRunning = steps.some((s) => s.running);
  // Last action
  const lastStep = steps[steps.length - 1];

  // Overall start and end
  const firstStartedAt = steps.find((s) => s.startedAt !== undefined)?.startedAt;
  const lastEndedAt = anyRunning
    ? undefined
    : steps
        .filter((s) => s.endedAt !== undefined)
        .reduce<number | undefined>(
          (max, s) => (max === undefined || (s.endedAt ?? 0) > max ? s.endedAt : max),
          undefined
        );

  // If there is only 1 step, show it directly as a clean single row (can expand its details if available)
  if (steps.length === 1) {
    const single = steps[0];
    return (
      <ToolStepRow
        label={single.label}
        startedAt={single.startedAt}
        endedAt={single.endedAt}
        running={single.running}
        detail={single.detail}
        expanded={!!expandedTools[single.id]}
        onToggle={() => onToggleTool(single.id)}
      />
    );
  }

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full select-none items-center gap-2 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-2.5 py-1.5 text-left transition-colors hover:bg-[#ECEAE5] cursor-pointer"
      >
        {anyRunning ? (
          <StepSpinner />
        ) : (
          <CheckIcon className="h-3 w-3 text-[#3F7D58]" />
        )}

        <span className="flex items-center gap-1.5 truncate text-[#6B6862]">
          <span className={anyRunning ? "font-medium text-[#1F1E1C]" : "text-[#6B6862]"}>
            {lastStep.label}
          </span>
          <span className="rounded bg-[#FFFFFF] px-1.5 py-0.2 text-[10px] text-[#6B6862] border border-[#E6E4DF]">
            +{steps.length - 1}
          </span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1 text-[#6B6862]">
          {firstStartedAt !== undefined && (
            <ElapsedTimer
              startedAt={firstStartedAt}
              endedAt={lastEndedAt}
            />
          )}
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform duration-200 ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        </span>
      </button>

      {isOpen && (
        <div className="mt-1 space-y-0.5 rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] p-1">
          {steps.map((s) => (
            <ToolStepRow
              key={s.id}
              label={s.label}
              startedAt={s.startedAt}
              endedAt={s.endedAt}
              running={s.running}
              detail={s.detail}
              expanded={!!expandedTools[s.id]}
              onToggle={() => onToggleTool(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
