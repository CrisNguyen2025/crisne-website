"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ProvenanceDto } from "@/lib/provenance/dto";
import { PROVENANCE_REF_ATTRIBUTE } from "@/lib/provenance/markers";
import { formatFriendlyTime } from "@/lib/roadmap/date-utils";

const AUTHOR_TYPE_LABEL: Record<string, string> = {
  human: "Owner viết",
  ai_generated: "AI tóm tắt",
  ai_assisted: "AI tóm tắt, Owner sửa",
};

export function formatAuthorType(authorType: string): string {
  return AUTHOR_TYPE_LABEL[authorType] ?? authorType;
}

interface ProvenanceChipProps {
  provenance: ProvenanceDto;
  index: number;
}

const POPOVER_WIDTH = 288;
const VIEWPORT_GUTTER = 16;

/** Numbered chip at the end of a sentence; opens where the sentence came from (Owner only, ADR-0017). */
export function ProvenanceChip({ provenance, index }: ProvenanceChipProps) {
  // Fixed position from the chip's rect: the Lesson content scrolls horizontally and would clip an absolute box
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const isOpen = position !== null;

  const toggle = () => {
    if (isOpen) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_GUTTER;
    setPosition({ top: rect.bottom + 6, left: Math.max(VIEWPORT_GUTTER, Math.min(rect.left, maxLeft)) });
  };

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setPosition(null);
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    // The box is fixed, so it would drift away from the chip on scroll or resize
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  return (
    <span className="not-prose inline-block align-super">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={`Nguồn ${index}: ${provenance.sourceName}`}
        className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground transition-colors hover:border-[var(--editorial-accent)] hover:text-foreground cursor-pointer"
      >
        {index}
      </button>
      {position &&
        createPortal(
          <span
            ref={popoverRef}
            role="dialog"
            aria-label={`Nguồn của câu ${index}`}
            style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
            className="fixed z-[80] block max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 text-left text-xs font-normal leading-relaxed text-foreground shadow-lg"
          >
            <a
              href={provenance.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-semibold text-[var(--editorial-accent)] hover:underline"
            >
              {provenance.sourceName}
            </a>
            <span className="mt-0.5 block text-muted-foreground">{provenance.sourceTitle}</span>
            <span className="mt-2 block border-l-2 border-border pl-2 italic">{provenance.excerpt}</span>
            <span className="mt-2 block text-muted-foreground">
              Thu thập: {formatFriendlyTime(provenance.collectedAt)}
              {" · "}Trích xuất: {provenance.extractedAt ? formatFriendlyTime(provenance.extractedAt) : "Chưa rõ"}
            </span>
            <span className="block text-muted-foreground">Người viết: {formatAuthorType(provenance.authorType)}</span>
          </span>,
          document.body
        )}
    </span>
  );
}

interface ProvenanceChipsProps {
  /** Element holding the Lesson HTML (set with dangerouslySetInnerHTML) */
  container: HTMLElement | null;
  provenances: ProvenanceDto[];
}

const NO_ELEMENTS: HTMLElement[] = [];

/** Marker spans inside `container`, kept current with a MutationObserver (the HTML is replaced on save). */
function useMarkerElements(container: HTMLElement | null): HTMLElement[] {
  const snapshotRef = useRef<HTMLElement[]>(NO_ELEMENTS);

  // Stable per container, or useSyncExternalStore would resubscribe on every render
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!container) return () => {};
      const observer = new MutationObserver(onChange);
      observer.observe(container, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    [container]
  );

  const getSnapshot = () => {
    if (!container) return NO_ELEMENTS;
    const next = Array.from(container.querySelectorAll<HTMLElement>(`span[${PROVENANCE_REF_ATTRIBUTE}]`));
    const prev = snapshotRef.current;
    if (next.length === prev.length && next.every((el, i) => el === prev[i])) return prev;
    snapshotRef.current = next;
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => NO_ELEMENTS);
}

/**
 * Renders a chip into every marker span that has Provenance. Portals go into the existing spans, so React
 * never rewrites the content's innerHTML; a marker without Provenance stays an empty span.
 */
export function ProvenanceChips({ container, provenances }: ProvenanceChipsProps) {
  const elements = useMarkerElements(container);
  const byKey = new Map(provenances.map((p, i) => [p.claimRefKey, { provenance: p, index: i + 1 }]));

  return (
    <>
      {elements.map((element, i) => {
        const hit = byKey.get((element.getAttribute(PROVENANCE_REF_ATTRIBUTE) ?? "").toLowerCase());
        if (!hit) return null;
        return createPortal(
          <ProvenanceChip provenance={hit.provenance} index={hit.index} />,
          element,
          `${hit.provenance.claimRefKey}-${i}`
        );
      })}
    </>
  );
}
