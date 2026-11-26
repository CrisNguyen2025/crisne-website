import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageContext } from "../../types";

export interface PageContextRef {
  kind: "lesson" | "topic";
  /** Canonical same-origin path of the Topic or Lesson page being viewed. */
  path: string;
  /** Human-readable title (or slug fallback) shown on the context chip. */
  label: string;
  /** Parent Topic label (and optional Section) for 2-level Lesson pages. */
  topicLabel?: string;
  section?: string;
  /** Full label + path for hover tooltip. */
  tooltip: string;
}

const CONTEXT_ATTRS = [
  "data-roadmap-context",
  "data-roadmap-slug",
  "data-roadmap-title",
  "data-lesson-slug",
  "data-lesson-title",
  "data-section",
];

function cleanSegment(raw?: string): string {
  return (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
}

export function arePageContextsEqual(
  a?: PageContext,
  b?: PageContext
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    (a.roadmapSlug ?? "") === (b.roadmapSlug ?? "") &&
    (a.roadmapTitle ?? "") === (b.roadmapTitle ?? "") &&
    (a.itemId ?? "") === (b.itemId ?? "") &&
    (a.itemTitle ?? "") === (b.itemTitle ?? "") &&
    (a.section ?? "") === (b.section ?? "")
  );
}

/**
 * Formats a `PageContext` into a displayable Context Reference for the composer and message bubbles.
 * Covers both Lesson pages (`/[topicSlug]/[lessonSlug]`) and Topic pages (`/[topicSlug]`).
 */
export function resolvePageContextRef(
  context?: PageContext
): PageContextRef | null {
  const topicSlug = cleanSegment(context?.roadmapSlug);
  if (!topicSlug) return null;

  const lessonSlug = cleanSegment(context?.itemId);
  const topicLabel = context?.roadmapTitle?.trim() || topicSlug;
  const section = context?.section?.trim() || undefined;
  if (lessonSlug) {
    const path = `/${encodeURIComponent(topicSlug)}/${encodeURIComponent(lessonSlug)}`;
    const label = context?.itemTitle?.trim() || lessonSlug;
    return {
      kind: "lesson",
      path,
      label,
      topicLabel,
      ...(section ? { section } : {}),
      tooltip: `${label} (${path})`,
    };
  }

  const basePath = `/${encodeURIComponent(topicSlug)}`;
  const path = section
    ? `${basePath}?section=${encodeURIComponent(section)}`
    : basePath;
  const label = section ? `${topicLabel} · ${section}` : topicLabel;
  return {
    kind: "topic",
    path,
    label,
    tooltip: `${label} (${path})`,
  };
}

/**
 * Tracks the host page's `PageContext` reactively across SPA route transitions,
 * DOM `[data-roadmap-context]` updates, and `roadmap:updated` title edits.
 */
export function useActivePageContext(
  getContext?: () => PageContext | undefined,
  isOpen = false,
  routeKey?: string
): PageContext | undefined {
  const [pageContext, setPageContext] = useState<PageContext | undefined>(() =>
    getContext?.()
  );
  const getContextRef = useRef(getContext);
  useEffect(() => {
    getContextRef.current = getContext;
  }, [getContext]);

  const sync = useCallback(() => {
    const next = getContextRef.current?.();
    setPageContext((prev) => (arePageContextsEqual(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    sync();
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(rafId);
  }, [routeKey, isOpen, getContext, sync]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSync = () => sync();
    window.addEventListener("popstate", handleSync);
    window.addEventListener("roadmap:updated", handleSync);

    let observer: MutationObserver | null = null;
    if (isOpen && typeof MutationObserver !== "undefined" && document.body) {
      observer = new MutationObserver((records) => {
        const relevant = records.some((record) => {
          if (record.type === "attributes") return true;
          const targetEl =
            record.target instanceof Element ? record.target : null;
          if (targetEl?.closest("[data-abot-overlay-root]")) return false;
          return true;
        });
        if (relevant) sync();
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: CONTEXT_ATTRS,
      });
    }

    return () => {
      window.removeEventListener("popstate", handleSync);
      window.removeEventListener("roadmap:updated", handleSync);
      observer?.disconnect();
    };
  }, [isOpen, sync]);

  return pageContext;
}

export function useActiveContextRef(
  getContext?: () => PageContext | undefined,
  isOpen = false,
  routeKey?: string
): { pageContext: PageContext | undefined; contextRef: PageContextRef | null } {
  const pageContext = useActivePageContext(getContext, isOpen, routeKey);
  const contextRef = useMemo(
    () => resolvePageContextRef(pageContext),
    [pageContext]
  );
  return { pageContext, contextRef };
}
