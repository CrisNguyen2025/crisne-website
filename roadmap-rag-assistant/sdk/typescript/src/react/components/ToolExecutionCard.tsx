import React, { useState, useEffect } from 'react';
import {
  CheckIcon,
  CloseIcon,
  ChevronDownIcon,
  AlertTriangleIcon,
  CopyIcon,
} from '../icons';
import { formatElapsed, type StepSource, type StepTone } from '../ToolStepRow';
import { formatToolDisplayName } from '../utils/formatters';

export interface ToolExecutionCardProps {
  id?: string;
  name?: string;
  label?: string;
  status?: 'running' | 'success' | 'failed';
  summary?: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  durationMs?: number;
  startedAt?: number;
  endedAt?: number;
  running?: boolean;
  tone?: StepTone;
  detail?: string;
  items?: StepSource[];
  initiallyExpanded?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function formatToolPayload(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  return JSON.stringify(data, null, 2);
}

function StepSpinner() {
  return (
    <span
      className="grid h-3.5 w-3.5 shrink-0 grid-cols-2 gap-0.5"
      aria-hidden="true"
    >
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:0ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:200ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:600ms]" />
      <span className="animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:400ms]" />
    </span>
  );
}

export function ToolExecutionCard({
  name,
  label,
  status: propStatus,
  summary,
  args,
  result,
  error,
  durationMs,
  startedAt,
  endedAt,
  running,
  tone,
  detail,
  items,
  initiallyExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  className = '',
}: ToolExecutionCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(initiallyExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Determine effective execution status
  const effectiveStatus: 'running' | 'success' | 'failed' = (() => {
    if (propStatus) return propStatus;
    if (running === true) return 'running';
    if (tone === 'error' || Boolean(error)) return 'failed';
    if (endedAt !== undefined) return 'success';
    return 'running';
  })();

  const isRunning = effectiveStatus === 'running';

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (controlledExpanded === undefined) {
      setInternalExpanded((prev) => !prev);
    }
  };

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayTitle = label || (name ? formatToolDisplayName(name) : 'Thực thi công cụ');
  const effectiveResult = result ?? detail ?? error ?? '';
  const hasArgs = args && Object.keys(args).length > 0;
  const hasResult = Boolean(effectiveResult);
  const hasSources = items && items.length > 0;
  const canInspect = hasArgs || hasResult || hasSources;

  const effectiveDuration =
    durationMs ??
    (startedAt !== undefined
      ? Math.max(0, (endedAt ?? (isRunning ? now : endedAt ?? now)) - startedAt)
      : undefined);

  return (
    <div
      className={`rounded-lg border text-xs transition-all ${
        isRunning
          ? 'border-amber-400/50 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs'
          : effectiveStatus === 'failed'
            ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10'
            : 'border-[#EBE9E4] bg-white dark:bg-stone-900/60'
      } ${className}`}
    >
      <button
        type="button"
        onClick={canInspect ? handleToggle : undefined}
        aria-expanded={canInspect ? isExpanded : undefined}
        disabled={!canInspect}
        className={`flex w-full select-none items-center justify-between gap-2.5 px-3 py-2 text-left transition-colors ${
          canInspect ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {effectiveStatus === 'running' ? (
            <StepSpinner />
          ) : effectiveStatus === 'failed' ? (
            <CloseIcon className="h-3.5 w-3.5 shrink-0 text-[#B42318]" />
          ) : (
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#3F7D58]" />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span
                className={`truncate font-medium ${
                  isRunning ? 'text-amber-950 dark:text-amber-200' : 'text-[#1F1E1C] dark:text-stone-100'
                }`}
              >
                {displayTitle}
              </span>
              {name && name !== displayTitle && (
                <span className="shrink-0 rounded bg-muted/60 px-1 py-0.2 font-mono text-[10px] text-muted-foreground">
                  {name}
                </span>
              )}
            </div>
            {summary && (
              <p
                className={`truncate text-[11px] ${
                  effectiveStatus === 'failed'
                    ? 'text-[#B42318]'
                    : 'text-muted-foreground'
                }`}
              >
                {summary}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Status Badge */}
          {effectiveStatus === 'running' && (
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Đang thực thi...
            </span>
          )}
          {effectiveStatus === 'success' && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              Hoàn thành
            </span>
          )}
          {effectiveStatus === 'failed' && (
            <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
              Thất bại
            </span>
          )}

          {effectiveDuration !== undefined && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatElapsed(effectiveDuration)}
            </span>
          )}

          {canInspect && (
            <ChevronDownIcon
              className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                isExpanded ? '' : '-rotate-90'
              }`}
            />
          )}
        </div>
      </button>

      {/* Collapsible Inspection Details */}
      {isExpanded && canInspect && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-2.5 bg-black/[0.01] dark:bg-white/[0.01]">
          {hasArgs && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground tracking-tight">
                Tham số (Parameters)
              </div>
              <pre className="mt-1 max-h-48 overflow-x-auto rounded border border-border/40 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                {formatToolPayload(args)}
              </pre>
            </div>
          )}

          {hasResult && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground tracking-tight">
                <span>Kết quả (Output)</span>
                <button
                  type="button"
                  onClick={() => handleCopy(effectiveResult)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <CopyIcon className="h-3 w-3" />
                  <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
              <pre
                className={`mt-1 max-h-60 overflow-x-auto rounded border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words ${
                  effectiveStatus === 'failed'
                    ? 'border-rose-200 bg-rose-50/40 text-rose-900 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-200'
                    : 'border-border/40 bg-muted/40 text-foreground'
                }`}
              >
                {formatToolPayload(effectiveResult)}
              </pre>
            </div>
          )}

          {hasSources && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground tracking-tight mb-1">
                Tài liệu tham khảo ({items.length})
              </div>
              <ul className="space-y-1">
                {items.map((it, idx) => (
                  <li
                    key={`${it.href ?? it.title}-${idx}`}
                    className="flex min-w-0 items-baseline gap-1.5 text-[11px]"
                  >
                    <span aria-hidden="true" className="text-muted-foreground">•</span>
                    {it.href ? (
                      <a
                        href={it.href}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-medium text-primary underline underline-offset-2 hover:opacity-80"
                      >
                        {it.title}
                      </a>
                    ) : (
                      <span className="truncate text-foreground">{it.title}</span>
                    )}
                    {it.topic && (
                      <span className="shrink-0 text-muted-foreground text-[10px]">
                        ({it.topic})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolExecutionCard;
