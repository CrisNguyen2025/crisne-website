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
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[color:var(--chat-text-muted,#5E5B55)] [animation-duration:800ms] [animation-delay:0ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[color:var(--chat-text-muted,#5E5B55)] [animation-duration:800ms] [animation-delay:200ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[color:var(--chat-text-muted,#5E5B55)] [animation-duration:800ms] [animation-delay:600ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-[color:var(--chat-text-muted,#5E5B55)] [animation-duration:800ms] [animation-delay:400ms]" />
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
  if (tone === "error") return <CloseIcon className="h-3 w-3 shrink-0 text-[color:var(--chat-danger,#B42318)]" />;
  if (tone === "warning") return <AlertTriangleIcon className="h-3 w-3 shrink-0 text-[color:var(--chat-warning,#B54708)]" />;
  return <CheckIcon className="h-3 w-3 shrink-0 text-[color:var(--chat-success,#3F7D58)]" />;
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
            ? "cursor-pointer hover:bg-[color:var(--chat-surface,#F4F3F0)] text-[color:var(--chat-text-secondary,#4D4B46)]"
            : "cursor-default text-[color:var(--chat-text-muted,#5E5B55)]"
        }`}
      >
        <StepStatusIcon running={running} tone={tone} />
        <span
          className={`truncate ${
            running ? "font-medium text-[color:var(--chat-text,#1F1E1C)]" : "text-[color:var(--chat-text-secondary,#4D4B46)]"
          }`}
        >
          {label}
          {summary && (
            <span
              className={
                tone === "error"
                  ? "text-[color:var(--chat-danger,#B42318)]"
                  : tone === "warning"
                    ? "text-[color:var(--chat-warning,#B54708)]"
                    : "text-[color:var(--chat-text-subtle,#75716A)]"
              }
            >
              {" · "}
              {summary}
            </span>
          )}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-[color:var(--chat-text-subtle,#75716A)]">
          {startedAt !== undefined && (running || endedAt !== undefined) && (
            <ElapsedTimer
              startedAt={startedAt}
              endedAt={running ? undefined : endedAt}
            />
          )}
          {canExpand && (
            <ChevronDownIcon
              className={`h-3 w-3 transition-transform duration-200 text-[color:var(--chat-text-subtle,#75716A)] group-hover/row:text-[color:var(--chat-text,#1F1E1C)] ${
                expanded ? "" : "-rotate-90"
              }`}
            />
          )}
        </span>
      </button>

      {canExpand && expanded && (
        <div className="ml-5 mt-1 mr-1 rounded-md bg-[color:var(--chat-surface,#F4F3F0)]/70 border border-[color:var(--chat-border,#E6E4DF)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[color:var(--chat-text-secondary,#4D4B46)] whitespace-pre-wrap break-words">
          {detail && <div className={items?.length ? "mb-1" : ""}>{detail}</div>}
          {items && items.length > 0 && (
            <ul className="space-y-0.5">
              {items.map((it, idx) => (
                <li key={`${it.href ?? it.title}-${idx}`} className="flex min-w-0 items-baseline gap-1.5">
                  <span aria-hidden="true" className="text-[color:var(--chat-text-subtle,#75716A)]">•</span>
                  {it.href ? (
                    <a
                      href={it.href}
                      className="truncate font-medium text-[color:var(--chat-text,#1F1E1C)] underline decoration-[color:var(--chat-accent,#C2410C)]/40 underline-offset-2 hover:decoration-[color:var(--chat-accent,#C2410C)]"
                    >
                      {it.title}
                    </a>
                  ) : (
                    <span className="truncate">{it.title}</span>
                  )}
                  {it.topic && <span className="shrink-0 text-[color:var(--chat-text-subtle,#75716A)]">{it.topic}</span>}
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
  /** Left running when the stream stopped (stop button, dropped connection). */
  interrupted?: boolean;
  detail?: string;
  items?: StepSource[];
}

export interface CollapsibleStepsSummaryProps {
  steps: StepItem[];
  expandedTools: Record<string, boolean>;
  onToggleTool: (id: string) => void;
  isLive?: boolean;
  /** Start of the turn; defaults to the first step's start. */
  startedAt?: number;
  /** First streamed token: the turn's time stops here unless a step runs longer. */
  firstTokenAt?: number;
  /** What the turn did, shown after the finished header, e.g. "Tra cứu 3 tài liệu". */
  digest?: string;
}

/** Shimmer over the live label; the keyframe lives in the host's globals.css. */
const SHIMMER_CLASS =
  "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent motion-reduce:before:hidden";

const ENTER_CLASS = "animate-in fade-in duration-200 motion-reduce:animate-none";

export function CollapsibleStepsSummary({
  steps,
  expandedTools,
  onToggleTool,
  isLive = false,
  startedAt,
  firstTokenAt,
  digest,
}: CollapsibleStepsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const runningStep = [...steps].reverse().find((s) => s.running);
  const errorStep = steps.find((s) => s.tone === "error");
  const isInterrupted = steps.some((s) => s.interrupted);

  const turnStartedAt = startedAt ?? steps.find((s) => s.startedAt !== undefined)?.startedAt;
  // The time stops at the answer's first token, or at the last step that ended after it.
  // While live and nothing has ended the turn yet, it keeps ticking: the number never goes back.
  const turnEndedAt =
    runningStep || (isLive && firstTokenAt === undefined)
      ? undefined
      : [firstTokenAt, ...steps.map((s) => s.endedAt)].reduce<number | undefined>(
          (max, t) => (t !== undefined && (max === undefined || t > max) ? t : max),
          undefined
        );
  const isTicking = isLive && turnStartedAt !== undefined && turnEndedAt === undefined;

  const elapsedMs =
    turnStartedAt !== undefined && turnEndedAt !== undefined ? turnEndedAt - turnStartedAt : undefined;
  // "<1s" reads as noise in a header
  const duration = elapsedMs !== undefined && elapsedMs >= 1000 ? formatElapsed(elapsedMs) : undefined;
  const withDuration = (text: string) => (duration ? `${text} ${duration}` : text);

  // Like Claude: the live header names what is happening now, then sums up the turn.
  const headerLabel = runningStep
    ? runningStep.label
    : isTicking
      ? "Đang suy nghĩ…"
      : errorStep
        ? `Lỗi: ${errorStep.label}`
        : isInterrupted
          ? duration ? `Đã dừng sau ${duration}` : "Đã dừng"
          : withDuration(steps.length > 0 ? "Đã xử lý" : "Đã suy nghĩ");

  const status = runningStep || isTicking ? "running" : errorStep ? "error" : isInterrupted ? "warning" : "done";
  const showDigest = status === "done" && !!digest;
  const canExpand = steps.length > 0;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={canExpand ? () => setIsOpen((prev) => !prev) : undefined}
        disabled={!canExpand}
        aria-expanded={canExpand ? isOpen : undefined}
        className={`group/btn flex max-w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-[color:var(--chat-text-muted,#5E5B55)] transition-colors select-none font-medium ${
          canExpand ? "hover:text-[color:var(--chat-text,#1F1E1C)] cursor-pointer" : "cursor-default"
        }`}
      >
        {/* Fixed slot: the icon swap must not push the label */}
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span key={status} className={`flex ${ENTER_CLASS} zoom-in-50`}>
            {status === "running" ? (
              <StepSpinner />
            ) : status === "error" ? (
              <CloseIcon className="h-3.5 w-3.5 text-[color:var(--chat-danger,#B42318)]" />
            ) : status === "warning" ? (
              <AlertTriangleIcon className="h-3.5 w-3.5 text-[color:var(--chat-warning,#B54708)]" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5 text-[color:var(--chat-success,#3F7D58)]" />
            )}
          </span>
        </span>

        {/* Remounts on change so each new label fades in instead of snapping */}
        <span
          key={headerLabel}
          className={`truncate text-xs tracking-tight ${ENTER_CLASS} slide-in-from-bottom-1 ${
            status === "running" ? SHIMMER_CLASS : ""
          }`}
        >
          {headerLabel}
        </span>

        {showDigest && (
          <span className={`min-w-0 truncate font-normal text-[color:var(--chat-text-subtle,#75716A)] ${ENTER_CLASS}`}>
            · {digest}
          </span>
        )}

        {isTicking && (
          <span className="shrink-0 text-xs text-[color:var(--chat-text-subtle,#75716A)]">
            <ElapsedTimer startedAt={turnStartedAt} />
          </span>
        )}

        {canExpand && (
          <ChevronDownIcon
            className={`h-3 w-3 shrink-0 text-[color:var(--chat-text-subtle,#75716A)] transition-transform duration-200 group-hover/btn:text-[color:var(--chat-text,#1F1E1C)] ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        )}
      </button>

      {/* Mounted only while open: hidden rows would keep their timers ticking */}
      {isOpen && canExpand && (
        <div
          className={`relative mt-1.5 ml-1 pl-3 border-l border-[color:var(--chat-border,#E6E4DF)] space-y-1 py-0.5 ${ENTER_CLASS} slide-in-from-top-1`}
        >
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
