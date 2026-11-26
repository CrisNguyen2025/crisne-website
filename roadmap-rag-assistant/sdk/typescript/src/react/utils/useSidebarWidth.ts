import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  loadSidebarWidth,
  saveSidebarWidth,
  sidebarWidthKey,
} from "../storage";
import {
  DESKTOP_MEDIA_QUERY,
  getRootFontSize,
  isDesktopViewport,
  prefersReducedMotion,
  toRem,
  type DesktopHeightSnapshot,
} from "./useDesktopPanelHeight";

export const SIDEBAR_DEFAULT_WIDTH = 400;
export const SIDEBAR_MIN_WIDTH = 360;
export const SIDEBAR_MAX_WIDTH = 640;

const KEYBOARD_RESIZE_STEP = 24;
const ABSOLUTE_FLOOR = 320;
const WIDTH_TRANSITION = "width 200ms cubic-bezier(0.22, 1, 0.36, 1)";
const BODY_PADDING_TRANSITION =
  "padding-right 200ms cubic-bezier(0.22, 1, 0.36, 1)";

export function getSidebarWidthBounds() {
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1440;
  const max = Math.max(
    ABSOLUTE_FLOOR,
    Math.min(SIDEBAR_MAX_WIDTH, Math.floor(viewportW * 0.45))
  );
  const min = Math.min(SIDEBAR_MIN_WIDTH, max);
  const initial = Math.min(max, Math.max(min, SIDEBAR_DEFAULT_WIDTH));
  return { min, max, initial };
}

export interface UseSidebarWidthOptions {
  isSidebarActive: boolean;
  baseUrl: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResize?: () => void;
}

export interface UseSidebarWidthReturn {
  isDragging: boolean;
  snapshot: DesktopHeightSnapshot;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Manages user-resizable width for Abot's docked right sidebar, coalescing pointer
 * moves to animation frames and syncing `--abot-sidebar-width` on `<html>`.
 */
export function useSidebarWidth({
  isSidebarActive,
  baseUrl,
  containerRef,
  onResize,
}: UseSidebarWidthOptions): UseSidebarWidthReturn {
  const storageKey = sidebarWidthKey(baseUrl);
  const preferredWidthRef = useRef<number>(
    loadSidebarWidth(storageKey) ?? SIDEBAR_DEFAULT_WIDTH
  );
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const onResizeRef = useRef(onResize);
  const [isDragging, setIsDragging] = useState(false);
  const [snapshot, setSnapshot] = useState<DesktopHeightSnapshot>(() => ({
    current: preferredWidthRef.current,
    min: SIDEBAR_MIN_WIDTH,
    max: SIDEBAR_MAX_WIDTH,
  }));

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    preferredWidthRef.current =
      loadSidebarWidth(storageKey) ?? SIDEBAR_DEFAULT_WIDTH;
  }, [storageKey]);

  const clearWidthTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.style.transition = "";
    }
    if (typeof document !== "undefined") {
      document.body.style.transition = "";
    }
  }, [containerRef]);

  const scheduleResizeNotify = useCallback(() => {
    if (resizeRafRef.current !== null) return;
    if (typeof window.requestAnimationFrame !== "function") {
      onResizeRef.current?.();
      return;
    }
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;
      onResizeRef.current?.();
    });
  }, []);

  const applyRootSidebarWidth = useCallback((remValue: string) => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--abot-sidebar-width", remValue);
  }, []);

  const syncSidebarWidth = useCallback(
    (commitSnapshot: boolean, animate = false) => {
      const container = containerRef.current;
      if (!container) return;

      if (!isSidebarActive || !isDesktopViewport()) {
        clearWidthTransition();
        container.style.width = "";
        container.style.maxWidth = "";
        return;
      }

      const { min, max } = getSidebarWidthBounds();
      const clamped = Math.round(
        Math.min(max, Math.max(min, preferredWidthRef.current))
      );

      if (animate && !prefersReducedMotion()) {
        clearWidthTransition();
        container.style.transition = WIDTH_TRANSITION;
        document.body.style.transition = BODY_PADDING_TRANSITION;
        transitionTimerRef.current = window.setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.style.transition = "";
          }
          document.body.style.transition = "";
          transitionTimerRef.current = null;
        }, 220);
      }

      const rootSize = getRootFontSize();
      const widthRem = toRem(clamped, rootSize);
      container.style.width = widthRem;
      container.style.maxWidth = toRem(max, rootSize);
      applyRootSidebarWidth(widthRem);

      if (commitSnapshot) {
        setSnapshot((prev) =>
          prev.current === clamped && prev.min === min && prev.max === max
            ? prev
            : { current: clamped, min, max }
        );
      }
    },
    [applyRootSidebarWidth, clearWidthTransition, containerRef, isSidebarActive]
  );

  useLayoutEffect(() => {
    if (!isSidebarActive) {
      cleanupDragRef.current?.();
      clearWidthTransition();
      if (containerRef.current) {
        containerRef.current.style.width = "";
        containerRef.current.style.maxWidth = "";
      }
      return;
    }
    syncSidebarWidth(true);
  }, [isSidebarActive, clearWidthTransition, containerRef, syncSidebarWidth]);

  useEffect(() => {
    if (!isSidebarActive) return;

    const handleViewportChange = () => {
      syncSidebarWidth(true);
      onResizeRef.current?.();
    };

    window.addEventListener("resize", handleViewportChange, { passive: true });
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(DESKTOP_MEDIA_QUERY)
        : null;
    mql?.addEventListener?.("change", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      mql?.removeEventListener?.("change", handleViewportChange);
    };
  }, [isSidebarActive, syncSidebarWidth]);

  useEffect(
    () => () => {
      cleanupDragRef.current?.();
      clearWidthTransition();
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    },
    [clearWidthTransition]
  );

  const beginDrag = useCallback(
    (startX: number) => {
      const container = containerRef.current;
      if (!isSidebarActive || !isDesktopViewport() || !container) return;
      cleanupDragRef.current?.();
      clearWidthTransition();

      const rootFontSize = getRootFontSize();
      const { min, max } = getSidebarWidthBounds();
      const maxRem = toRem(max, rootFontSize);
      const startWidth = Math.min(
        max,
        Math.max(min, preferredWidthRef.current)
      );
      let latestClientX = startX;

      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      const prevWillChange = container.style.willChange;
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ew-resize";
      document.documentElement.dataset.abotResizing = "true";
      container.style.transition = "none";
      container.style.willChange = "width";
      setIsDragging(true);

      const applyAt = (clientX: number) => {
        // Left-edge drag: moving pointer left (smaller clientX) widens the sidebar.
        const next = Math.round(
          Math.min(max, Math.max(min, startWidth + (startX - clientX)))
        );
        if (next === preferredWidthRef.current && containerRef.current?.style.width) {
          return;
        }
        preferredWidthRef.current = next;
        const el = containerRef.current;
        if (el) {
          const widthRem = toRem(next, rootFontSize);
          el.style.width = widthRem;
          el.style.maxWidth = maxRem;
          applyRootSidebarWidth(widthRem);
        }
      };

      const scheduleApply = (clientX: number) => {
        latestClientX = clientX;
        if (typeof window.requestAnimationFrame !== "function") {
          applyAt(clientX);
          return;
        }
        if (dragRafRef.current !== null) return;
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          applyAt(latestClientX);
        });
      };

      const onMouseMove = (e: MouseEvent) => {
        scheduleApply(e.clientX);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        scheduleApply(e.touches[0].clientX);
      };

      const finish = () => {
        if (dragRafRef.current !== null) {
          window.cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        applyAt(latestClientX);

        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
        delete document.documentElement.dataset.abotResizing;
        if (containerRef.current) {
          containerRef.current.style.transition = "";
          containerRef.current.style.willChange = prevWillChange;
        }
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", finish);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", finish);
        window.removeEventListener("touchcancel", finish);
        window.removeEventListener("blur", finish);
        cleanupDragRef.current = null;
        setIsDragging(false);
        saveSidebarWidth(storageKey, preferredWidthRef.current);
        syncSidebarWidth(true);
        window.dispatchEvent(new CustomEvent("abot:sidebar-change"));
        scheduleResizeNotify();
      };

      cleanupDragRef.current = finish;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", finish);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", finish);
      window.addEventListener("touchcancel", finish);
      window.addEventListener("blur", finish);
    },
    [
      applyRootSidebarWidth,
      clearWidthTransition,
      containerRef,
      isSidebarActive,
      scheduleResizeNotify,
      storageKey,
      syncSidebarWidth,
    ]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      beginDrag(e.clientX);
    },
    [beginDrag]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      beginDrag(e.touches[0].clientX);
    },
    [beginDrag]
  );

  const handleDoubleClick = useCallback(() => {
    preferredWidthRef.current = SIDEBAR_DEFAULT_WIDTH;
    saveSidebarWidth(storageKey, SIDEBAR_DEFAULT_WIDTH);
    syncSidebarWidth(true, true);
    window.dispatchEvent(new CustomEvent("abot:sidebar-change"));
    scheduleResizeNotify();
  }, [scheduleResizeNotify, storageKey, syncSidebarWidth]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isSidebarActive || !isDesktopViewport()) return;
      const { min, max } = getSidebarWidthBounds();
      const current = Math.min(
        max,
        Math.max(min, preferredWidthRef.current)
      );
      let next: number | null = null;

      if (e.key === "ArrowLeft") {
        next = Math.min(max, current + KEYBOARD_RESIZE_STEP);
      } else if (e.key === "ArrowRight") {
        next = Math.max(min, current - KEYBOARD_RESIZE_STEP);
      } else if (e.key === "Home") {
        next = min;
      } else if (e.key === "End") {
        next = max;
      }

      if (next !== null) {
        e.preventDefault();
        preferredWidthRef.current = next;
        saveSidebarWidth(storageKey, next);
        syncSidebarWidth(true, true);
        window.dispatchEvent(new CustomEvent("abot:sidebar-change"));
        scheduleResizeNotify();
      }
    },
    [isSidebarActive, scheduleResizeNotify, storageKey, syncSidebarWidth]
  );

  return {
    isDragging,
    snapshot,
    onMouseDown: handleMouseDown,
    onTouchStart: handleTouchStart,
    onDoubleClick: handleDoubleClick,
    onKeyDown: handleKeyDown,
  };
}
