"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { safeHref } from "../utils/links";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 320;
const EDGE_GAP = 8;
const HIDE_DELAY_MS = 150;

/** Bottom edge of the nearest scrolling ancestor, which clips the panel; the viewport when there is none. */
function clipBottom(element: HTMLElement): number {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY)) {
      return node.getBoundingClientRect().bottom;
    }
  }
  return window.innerHeight;
}

export interface Citation {
  /** The source's id, which claims in the answer cite. */
  id?: string;
  title: string;
  href?: string | null;
}

/** Source label for a roadmap topic link (`/?topic=<slug>`), or null for any other link. */
export function roadmapSourceLabel(href: string): string | null {
  if (!href.startsWith("/?topic=")) return null;
  const topic = new URLSearchParams(href.slice(2)).get("topic");
  return topic ? `Roadmap · ${topic}` : null;
}

/** Source label for a citation: the roadmap topic, else the external host. */
export function citationSourceLabel(href?: string | null): string {
  if (!href) return "Roadmap";
  const roadmap = roadmapSourceLabel(href);
  if (roadmap) return roadmap;
  if (/^https?:\/\//i.test(href)) {
    // A malformed address must not break rendering the answer
    try {
      return new URL(href).hostname;
    } catch {
      return "Roadmap";
    }
  }
  return "Roadmap";
}

function GlobeIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </svg>
  );
}

/**
 * Citation chip shown after the claim it supports. Hover, focus or click opens a panel listing its
 * sources; the panel closes when the pointer or focus leaves, on outside click or Escape.
 * `onOpenChange` reports each open and close, also a close by unmounting.
 */
export function CitationChip({
  citations,
  onOpenChange,
}: {
  citations: Citation[];
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const [alignUp, setAlignUp] = useState(false);
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const panelId = useId();
  const [first] = citations;

  // Hover opens the panel; leaving waits briefly so the pointer can cross the gap into it
  const cancelHide = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const show = () => {
    cancelHide();
    setOpen(true);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  };
  useEffect(() => cancelHide, []);

  // The parent passes a new callback each render; only open/close should trigger a report
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    if (!open) return;
    onOpenChangeRef.current?.(true);
    return () => onOpenChangeRef.current?.(false);
  }, [open]);

  // Open towards the left when the panel would run past the right edge of the viewport, and
  // upwards only when the chat below the chip cannot hold the panel: opened upwards it covers
  // the claim the chip highlights
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const { left, bottom } = rootRef.current.getBoundingClientRect();
    const height = Math.min(panelRef.current?.scrollHeight ?? PANEL_HEIGHT, PANEL_HEIGHT);
    setAlignEnd(left + PANEL_WIDTH > window.innerWidth - EDGE_GAP);
    setAlignUp(bottom + height + EDGE_GAP > clipBottom(rootRef.current));
  }, [open]);

  // Mount the panel first, then fade it in on the next frame so the transition runs
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // Captured first and stopped, so Escape closes this panel and not the chat around it
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative ml-1 inline-block align-baseline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={show}
        className="inline-flex max-w-[16rem] cursor-pointer items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-px text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <GlobeIcon />
        <span className="truncate">{first.title || citationSourceLabel(first.href)}</span>
        {citations.length > 1 && <span>+{citations.length - 1}</span>}
      </button>
      {open && (
        <span
          ref={panelRef}
          id={panelId}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onFocus={cancelHide}
          onBlur={scheduleHide}
          className={`absolute z-50 block max-h-80 w-80 ${alignUp ? "bottom-full mb-2" : "top-full mt-2"} max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-left shadow-lg transition duration-150 ease-out ${alignEnd ? "right-0" : "left-0"} ${entered ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
        >
          {citations.map((citation, idx) => {
            const body = (
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GlobeIcon />
                  <span className="truncate">{citationSourceLabel(citation.href)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm font-medium leading-snug text-foreground">
                  {citation.title}
                </span>
              </span>
            );
            // A source without a page, or with a link the chat must not render, is listed, not linked
            const link = citation.href ? safeHref(citation.href) : null;
            if (!link) {
              return (
                <span key={idx} className="flex items-start gap-3 rounded-lg px-3 py-2.5">
                  {body}
                </span>
              );
            }
            return (
              <a
                key={idx}
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
              >
                {body}
              </a>
            );
          })}
        </span>
      )}
    </span>
  );
}
