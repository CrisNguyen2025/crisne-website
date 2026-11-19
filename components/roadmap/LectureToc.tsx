"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ContentHeading } from "@/lib/roadmap/content-utils";
import { cn } from "@/lib/utils";

const ACTIVE_HEADING_OFFSET = 128;

export function computeActiveHeadingId(
  elements: HTMLElement[],
  viewportHeight: number,
  scrollY: number,
  scrollHeight: number
): string {
  if (elements.length === 0) return "";
  if (scrollHeight > viewportHeight && scrollY + viewportHeight >= scrollHeight - 24) {
    return elements[elements.length - 1].id;
  }

  let currentId = elements[0].id;
  for (const el of elements) {
    if (el.getBoundingClientRect().top <= ACTIVE_HEADING_OFFSET) {
      currentId = el.id;
    } else {
      break;
    }
  }
  return currentId;
}

export function useActiveHeading(headings: ContentHeading[]) {
  const [trackedHeadingId, setTrackedHeadingId] = useState<string>("");
  const manualTargetRef = useRef<{ id: string; until: number } | null>(null);

  const activeHeadingId = headings.some((h) => h.id === trackedHeadingId)
    ? trackedHeadingId
    : (headings[0]?.id ?? "");

  const updateFromScroll = useCallback(() => {
    if (headings.length === 0) return;
    const lock = manualTargetRef.current;
    if (lock && Date.now() < lock.until) {
      return;
    }
    manualTargetRef.current = null;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const nextId = computeActiveHeadingId(
      elements,
      window.innerHeight,
      window.scrollY,
      document.documentElement.scrollHeight
    );
    if (nextId) {
      setTrackedHeadingId((prev) => (prev === nextId ? prev : nextId));
    }
  }, [headings]);

  useEffect(() => {
    if (headings.length === 0) return;
    let rafId = 0;

    const scheduleUpdate = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateFromScroll();
      });
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [headings, updateFromScroll]);

  const jumpToHeading = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string
  ) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      manualTargetRef.current = { id, until: Date.now() + 650 };
      setTrackedHeadingId(id);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  return { activeHeadingId, jumpToHeading };
}

interface LectureTocLinksProps {
  headings: ContentHeading[];
  activeHeadingId: string;
  onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
  variant: "rail" | "inline";
}

function LectureTocLinks({
  headings,
  activeHeadingId,
  onJump,
  variant,
}: LectureTocLinksProps) {
  const isRail = variant === "rail";
  return (
    <ul
      className={cn(
        "text-[0.8125rem]",
        isRail ? "mt-3 space-y-1.5 border-l border-border" : "space-y-1.5"
      )}
    >
      {headings.map((h) => {
        const isActive = activeHeadingId === h.id;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => onJump(e, h.id)}
              className={cn(
                "block leading-snug transition-colors duration-150",
                isRail
                  ? cn(
                      "-ml-[0.0625rem] border-l-2 py-0.5",
                      h.level === 3 ? "pl-5" : "pl-3.5",
                      isActive
                        ? "border-[var(--editorial-accent)] font-medium text-[var(--editorial-accent)]"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )
                  : cn(
                      "rounded-md py-1 px-2",
                      h.level === 3 && "pl-5",
                      isActive
                        ? "bg-[var(--editorial-sidebar-active)] font-medium text-[var(--editorial-accent)]"
                        : "text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground"
                    )
              )}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function DesktopTocRail({
  headings,
  activeHeadingId,
  onJump,
}: {
  headings: ContentHeading[];
  activeHeadingId: string;
  onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  return (
    <aside
      aria-hidden={headings.length === 0 || undefined}
      className="hidden xl:block w-[15.75rem] shrink-0"
    >
      {headings.length > 0 && (
        <div className="sticky top-20 max-h-[calc(100dvh-6.5rem)] overflow-y-auto no-scrollbar">
          <nav aria-label="On this page">
            <p className="text-[0.8125rem] font-semibold tracking-tight text-foreground">
              On this page
            </p>
            <LectureTocLinks
              headings={headings}
              activeHeadingId={activeHeadingId}
              onJump={onJump}
              variant="rail"
            />
          </nav>
        </div>
      )}
    </aside>
  );
}

export function TabletInlineToc({
  headings,
  activeHeadingId,
  onJump,
}: {
  headings: ContentHeading[];
  activeHeadingId: string;
  onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  if (headings.length === 0) return null;

  return (
    <details
      ref={detailsRef}
      className="hidden lg:block xl:hidden group mb-6 rounded-xl border border-border bg-[var(--editorial-sidebar)] px-4 py-3 text-xs"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-foreground select-none [&::-webkit-details-marker]:hidden">
        <span>On this page</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
          <span>{headings.length}</span>
          <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
        </span>
      </summary>
      <div className="mt-2.5 border-t border-border/80 pt-2.5">
        <LectureTocLinks
          headings={headings}
          activeHeadingId={activeHeadingId}
          onJump={(e, id) => {
            onJump(e, id);
            if (detailsRef.current) detailsRef.current.open = false;
          }}
          variant="inline"
        />
      </div>
    </details>
  );
}

export function MobileTocDropdown({
  headings,
  activeHeadingId,
  onJump,
}: {
  headings: ContentHeading[];
  activeHeadingId: string;
  onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (headings.length === 0) return null;

  const scrollToTop = () => {
    setIsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex min-h-[2.75rem] items-center gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        <span>On this page</span>
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform duration-150",
            isOpen && "rotate-90 text-foreground"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute inset-x-4 top-full z-40 mt-1.5 max-h-[65dvh] overflow-y-auto rounded-xl border border-border bg-[var(--editorial-sidebar)] p-3 shadow-lg">
          <button
            type="button"
            onClick={scrollToTop}
            className="mb-2 block w-full border-b border-border/80 px-2 pb-2 text-left text-xs font-medium text-[var(--editorial-accent)] cursor-pointer"
          >
            Lên đầu trang ↑
          </button>
          <LectureTocLinks
            headings={headings}
            activeHeadingId={activeHeadingId}
            onJump={(e, id) => {
              onJump(e, id);
              setIsOpen(false);
            }}
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}
