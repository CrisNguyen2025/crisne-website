"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ContentHeading } from "@/lib/roadmap/content-utils";
import { cn, getScrollBehavior } from "@/lib/utils";

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
      el.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  return { activeHeadingId, jumpToHeading };
}

interface SidebarLessonTocProps {
  headings: ContentHeading[];
  activeHeadingId: string;
  onJump: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
  onAfterJump?: () => void;
}

/** Nested table of contents displayed directly beneath the active Lesson in the left nav. */
export function SidebarLessonToc({
  headings,
  activeHeadingId,
  onJump,
  onAfterJump,
}: SidebarLessonTocProps) {
  if (headings.length === 0) return null;

  return (
    <ol
      aria-label="Trên trang này"
      className="mt-1 mb-2 ml-4 space-y-0.5 border-l border-border pl-2"
    >
      {headings.map((h) => {
        const isActive = activeHeadingId === h.id;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={isActive ? "true" : undefined}
              onClick={(e) => {
                onJump(e, h.id);
                onAfterJump?.();
              }}
              className={cn(
                "block rounded-md py-1 text-xs leading-snug transition-colors duration-150",
                h.level === 3 ? "pl-4 pr-2" : "px-2",
                isActive
                  ? "font-medium text-foreground"
                  : "font-normal text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground"
              )}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
