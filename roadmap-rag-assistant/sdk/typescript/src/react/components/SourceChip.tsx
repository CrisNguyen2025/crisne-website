"use client";

import React, { useId, useState } from "react";

export interface SourceChipProps {
  title: string;
  href: string;
  source: string;
}

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

/** Inline citation: a link chip that shows the source card on hover or focus. */
export function SourceChip({ title, href, source }: SourceChipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <a
        href={href}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-px text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
      >
        <span className="truncate">{title}</span>
        <ArrowIcon />
      </a>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 block w-64 rounded-xl border border-border bg-popover p-3 text-left shadow-lg"
        >
          <span className="block truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {source}
          </span>
        </span>
      )}
    </span>
  );
}
