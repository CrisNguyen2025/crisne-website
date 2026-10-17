import React, { useEffect, useState } from "react";
import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, CloseIcon } from "./icons";

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
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:0ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:200ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:600ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:400ms]" />
    </span>
  );
}

/** A source found by a retrieval step; rendered as a link when it has `href`. */
export interface StepSource {
  title: string;
  topic?: string;
  href?: string;
}

/** `warning`: finished but needs a look (guard issues, interrupted). `error`: failed. */
export type StepTone = "default" | "warning" | "error";

export interface ToolStepRowProps {
  label: string;
  /** Short result shown after the label, e.g. "2 tài liệu". */
  summary?: string;
  tone?: StepTone;
  startedAt?: number;
  endedAt?: number;
  running: boolean;
  /** Expanded body; when absent (and no items) the row is not clickable. */
  detail?: string;
  items?: StepSource[];
  expanded?: boolean;
  onToggle?: () => void;
}

function StepStatusIcon({ running, tone }: { running: boolean; tone: StepTone }) {
  if (running) return <StepSpinner />;
  if (tone === "error") return <CloseIcon className="h-3 w-3 shrink-0 text-[#B42318]" />;
  if (tone === "warning") return <AlertTriangleIcon className="h-3 w-3 shrink-0 text-[#B54708]" />;
  return <CheckIcon className="h-3 w-3 shrink-0 text-[#3F7D58]" />;
}

export function ToolStepRow({
  label,
  summary,
  tone = "default",
  startedAt,
  endedAt,
  running,
  detail,
  items,
  expanded = false,
  onToggle,
}: ToolStepRowProps) {
  const canExpand = !running && (!!detail || (items && items.length > 0)) && !!onToggle;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        className={`group/row flex w-full select-none items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
          canExpand
            ? "cursor-pointer hover:bg-[#F4F3F0] text-[#4D4B46]"
            : "cursor-default text-[#6B6862]"
        }`}
      >
        <StepStatusIcon running={running} tone={tone} />
        <span
          className={`truncate ${
            running ? "font-medium text-[#1F1E1C]" : "text-[#4D4B46]"
          }`}
        >
          {label}
          {summary && (
            <span
              className={
                tone === "error"
                  ? "text-[#B42318]"
                  : tone === "warning"
                    ? "text-[#B54708]"
                    : "text-[#8C8983]"
              }
            >
              {" · "}
              {summary}
            </span>
          )}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-[#8C8983]">
          {startedAt !== undefined && (running || endedAt !== undefined) && (
            <ElapsedTimer
              startedAt={startedAt}
              endedAt={running ? undefined : endedAt}
            />
          )}
          {canExpand && (
            <ChevronDownIcon
              className={`h-3 w-3 transition-transform duration-200 text-[#8C8983] group-hover/row:text-[#1F1E1C] ${
                expanded ? "" : "-rotate-90"
              }`}
            />
          )}
        </span>
      </button>

      {canExpand && expanded && (
        <div className="ml-5 mt-1 mr-1 rounded-md bg-[#F4F3F0]/70 border border-[#E6E4DF] px-2.5 py-1.5 text-[11px] leading-relaxed text-[#4D4B46] whitespace-pre-wrap break-words">
          {detail && <div className={items?.length ? "mb-1" : ""}>{detail}</div>}
          {items && items.length > 0 && (
            <ul className="space-y-0.5">
              {items.map((it, idx) => (
                <li key={`${it.href ?? it.title}-${idx}`} className="flex min-w-0 items-baseline gap-1.5">
                  <span aria-hidden="true" className="text-[#8C8983]">•</span>
                  {it.href ? (
                    <a
                      href={it.href}
                      className="truncate font-medium text-[#1F1E1C] underline decoration-[#C2410C]/40 underline-offset-2 hover:decoration-[#C2410C]"
                    >
                      {it.title}
                    </a>
                  ) : (
                    <span className="truncate">{it.title}</span>
                  )}
                  {it.topic && <span className="shrink-0 text-[#8C8983]">{it.topic}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export interface StepItem {
  id: string;
  label: string;
  summary?: string;
  tone?: StepTone;
  startedAt?: number;
  endedAt?: number;
  running: boolean;
  detail?: string;
  items?: StepSource[];
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

  const runningStep = [...steps].reverse().find((s) => s.running);
  const anyRunning = runningStep !== undefined;
  const anyError = steps.some((s) => s.tone === "error");

  const firstStartedAt = steps.find((s) => s.startedAt !== undefined)?.startedAt;
  const lastEndedAt = anyRunning
    ? undefined
    : steps
        .filter((s) => s.endedAt !== undefined)
        .reduce<number | undefined>(
          (max, s) => (max === undefined || (s.endedAt ?? 0) > max ? s.endedAt : max),
          undefined
        );

  const totalDuration =
    firstStartedAt !== undefined && lastEndedAt !== undefined
      ? formatElapsed(lastEndedAt - firstStartedAt)
      : undefined;

  // Like Claude: the live header names what is happening now, then sums up the turn.
  const headerLabel = runningStep
    ? runningStep.label
    : totalDuration
      ? `Đã suy nghĩ ${totalDuration}`
      : "Đã suy nghĩ";

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="group/btn inline-flex items-center gap-1.5 py-0.5 text-left text-[#6B6862] hover:text-[#1F1E1C] cursor-pointer transition-colors select-none font-medium"
      >
        {anyRunning ? (
          <StepSpinner />
        ) : anyError ? (
          <CloseIcon className="h-3.5 w-3.5 text-[#B42318]" />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58]" />
        )}

        <span className="text-xs tracking-tight">
          {headerLabel}
        </span>

        {anyRunning && firstStartedAt !== undefined && (
          <span className="text-[11px] text-[#8C8983]">
            <ElapsedTimer startedAt={firstStartedAt} />
          </span>
        )}

        <ChevronDownIcon
          className={`h-3 w-3 text-[#8C8983] transition-transform duration-200 group-hover/btn:text-[#1F1E1C] ${
            isOpen ? "" : "-rotate-90"
          }`}
        />
      </button>

      {isOpen && (
        <div className="relative mt-1.5 ml-1 pl-3 border-l border-[#E6E4DF] space-y-1 py-0.5 animate-in fade-in duration-150">
          {steps.map((s) => (
            <ToolStepRow
              key={s.id}
              label={s.label}
              summary={s.summary}
              tone={s.tone}
              startedAt={s.startedAt}
              endedAt={s.endedAt}
              running={s.running}
              detail={s.detail}
              items={s.items}
              expanded={expandedTools[s.id] ?? false}
              onToggle={() => onToggleTool(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
