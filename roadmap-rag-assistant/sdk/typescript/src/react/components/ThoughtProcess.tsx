import React, { useState, useEffect } from 'react';
import { CheckIcon, ChevronDownIcon } from '../icons';

export interface ThoughtProcessProps {
  thinking?: string;
  durationMs?: number;
  thinkingDurationMs?: number;
  isThinking?: boolean;
  isLive?: boolean;
  startedAt?: number;
  endedAt?: number;
  initiallyExpanded?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function formatThoughtBadge(ms: number, isThinking: boolean): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (isThinking) {
    return `Thinking (${seconds}s)...`;
  }
  return `Đã suy nghĩ ${seconds} giây`;
}

export function ThoughtProcess({
  thinking,
  durationMs,
  thinkingDurationMs,
  isThinking = false,
  isLive = false,
  startedAt,
  endedAt,
  initiallyExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  className = '',
}: ThoughtProcessProps) {
  const [internalExpanded, setInternalExpanded] = useState(initiallyExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isThinking && !isLive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isThinking, isLive]);

  const effectiveDuration =
    durationMs ??
    thinkingDurationMs ??
    (startedAt !== undefined ? Math.max(0, (endedAt ?? now) - startedAt) : 1000);

  const seconds = Math.max(1, Math.round(effectiveDuration / 1000));
  const headerLabel = isThinking
    ? `Thinking (${seconds}s)...`
    : `Đã suy nghĩ ${seconds} giây`;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (controlledExpanded === undefined) {
      setInternalExpanded((prev) => !prev);
    }
  };

  if (!thinking && !isThinking) {
    return null;
  }

  return (
    <div className={`my-2 text-xs ${className}`}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={handleToggle}
        className="group/thought flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer font-medium select-none transition-colors"
      >
        {isThinking ? (
          <span
            className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0"
            aria-hidden="true"
          />
        ) : (
          <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58] shrink-0" />
        )}
        <span className="tracking-tight">{headerLabel}</span>
        <ChevronDownIcon
          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 group-hover/thought:text-foreground ${
            isExpanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {isExpanded && (
        <div className="mt-1.5 border-l-2 border-primary/30 border-muted-foreground/30 pl-3 py-1 text-muted-foreground/80 text-muted-foreground font-mono text-xs leading-relaxed italic whitespace-pre-wrap rounded-r-md bg-muted/20 p-2.5">
          {thinking || (isThinking ? 'Đang suy nghĩ...' : '')}
        </div>
      )}
    </div>
  );
}

export default ThoughtProcess;
