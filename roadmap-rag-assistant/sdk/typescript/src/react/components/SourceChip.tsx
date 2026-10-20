"use client";

import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SourceChipProps {
  title: string;
  href: string;
  source: string;
}

const CARD_WIDTH = 256;
const EDGE_GAP = 8;

/** Source label for a roadmap topic link (`/?topic=<slug>`), or null for any other link. */
export function roadmapSourceLabel(href: string): string | null {
  if (!href.startsWith("/?topic=")) return null;
  const topic = new URLSearchParams(href.slice(2)).get("topic");
  return topic ? `Roadmap · ${topic}` : null;
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/**
 * Inline citation: a link chip that shows the source card on hover or focus.
 * The card is portalled to <body> and clamped to the viewport, so it never widens or clips
 * the scrollable chat panel it is opened from.
 */
export function SourceChip({ title, href, source }: SourceChipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLAnchorElement>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    if (!open || !chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - CARD_WIDTH - EDGE_GAP;
    setPosition({
      top: rect.top - EDGE_GAP,
      left: Math.max(EDGE_GAP, Math.min(rect.left, maxLeft)),
    });
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  return (
    <span className="inline-block align-baseline">
      <a
        ref={chipRef}
        href={href}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-px text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
      >
        <span className="truncate">{title}</span>
        <ArrowIcon />
      </a>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: CARD_WIDTH,
              transform: "translateY(-100%)",
            }}
            className="pointer-events-none z-[1000] block rounded-xl border border-border bg-popover p-3 text-left shadow-lg"
          >
            <span className="block truncate text-sm font-medium text-foreground">
              {title}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {source}
            </span>
          </span>,
          document.body
        )}
    </span>
  );
}
