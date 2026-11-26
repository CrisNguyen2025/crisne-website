import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ChatbotPosition } from "../types";

export const DESKTOP_DEFAULT_WIDTH = 400;
export const DESKTOP_DEFAULT_HEIGHT = 650;
export const DESKTOP_MIN_HEIGHT = 480;

const DESKTOP_MEDIA_QUERY = "(min-width: 48rem)";
const OPPOSITE_EDGE_GAP = 24;
const KEYBOARD_RESIZE_STEP = 24;
const ABSOLUTE_FLOOR = 320;
const HEIGHT_TRANSITION = "height 200ms cubic-bezier(0.22, 1, 0.36, 1)";

function getRootFontSize(): number {
  if (typeof document === "undefined") return 16;
  const parsed = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

export function toRem(value: number, rootFontSize = getRootFontSize()): string {
  return `${value / rootFontSize}rem`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  }
  return window.innerWidth >= 768;
}

export function getDesktopHeightBounds(offsetY: number) {
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
  const max = Math.max(
    ABSOLUTE_FLOOR,
    viewportH - (offsetY + OPPOSITE_EDGE_GAP)
  );
  const min = Math.min(DESKTOP_MIN_HEIGHT, max);
  const initial = Math.min(max, Math.max(min, DESKTOP_DEFAULT_HEIGHT));
  return { min, max, initial };
}

export interface DesktopHeightSnapshot {
  current: number;
  min: number;
  max: number;
}

export interface UseDesktopPanelHeightOptions {
  isOpen: boolean;
  offsetY: number;
  position?: ChatbotPosition;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResize?: () => void;
}

export interface UseDesktopPanelHeightReturn {
  isDragging: boolean;
  snapshot: DesktopHeightSnapshot;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function useDesktopPanelHeight({
  isOpen,
  offsetY,
  position = "bottom-right",
  containerRef,
  onResize,
}: UseDesktopPanelHeightOptions): UseDesktopPanelHeightReturn {
  const preferredHeightRef = useRef<number>(DESKTOP_DEFAULT_HEIGHT);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const onResizeRef = useRef(onResize);
  const [isDragging, setIsDragging] = useState(false);
  const [snapshot, setSnapshot] = useState<DesktopHeightSnapshot>(() => ({
    current: DESKTOP_DEFAULT_HEIGHT,
    min: DESKTOP_MIN_HEIGHT,
    max: 852,
  }));

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const clearHeightTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.style.transition = "";
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

  const syncContainerHeight = useCallback(
    (commitSnapshot: boolean, animate = false) => {
      const container = containerRef.current;
      if (!container) return;

      if (!isDesktopViewport()) {
        clearHeightTransition();
        container.style.height = "";
        container.style.maxHeight = "";
        return;
      }

      const { min, max } = getDesktopHeightBounds(offsetY);
      const clamped = Math.round(
        Math.min(max, Math.max(min, preferredHeightRef.current))
      );

      if (animate && !prefersReducedMotion()) {
        clearHeightTransition();
        container.style.transition = HEIGHT_TRANSITION;
        transitionTimerRef.current = window.setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.style.transition = "";
          }
          transitionTimerRef.current = null;
        }, 220);
      }

      const rootSize = getRootFontSize();
      container.style.height = toRem(clamped, rootSize);
      container.style.maxHeight = toRem(max, rootSize);

      if (commitSnapshot) {
        setSnapshot((prev) =>
          prev.current === clamped && prev.min === min && prev.max === max
            ? prev
            : { current: clamped, min, max }
        );
      }
    },
    [clearHeightTransition, containerRef, offsetY]
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      cleanupDragRef.current?.();
      clearHeightTransition();
      if (containerRef.current) {
        containerRef.current.style.height = "";
        containerRef.current.style.maxHeight = "";
      }
      return;
    }
    syncContainerHeight(true);
  }, [isOpen, clearHeightTransition, containerRef, syncContainerHeight]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportChange = () => {
      syncContainerHeight(true);
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
  }, [isOpen, syncContainerHeight]);

  useEffect(
    () => () => {
      cleanupDragRef.current?.();
      clearHeightTransition();
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    },
    [clearHeightTransition]
  );

  const beginDrag = useCallback(
    (startY: number) => {
      const container = containerRef.current;
      if (!isDesktopViewport() || !container) return;
      cleanupDragRef.current?.();
      clearHeightTransition();

      const rootFontSize = getRootFontSize();
      const { min: initMin, max: initMax } = getDesktopHeightBounds(offsetY);
      const startHeight = Math.min(
        initMax,
        Math.max(initMin, preferredHeightRef.current)
      );
      const direction = position.startsWith("top") ? 1 : -1;

      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      const prevWillChange = container.style.willChange;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ns-resize";
      container.style.willChange = "height";
      setIsDragging(true);

      const updateAt = (clientY: number) => {
        const { min, max } = getDesktopHeightBounds(offsetY);
        const next = Math.round(
          Math.min(max, Math.max(min, startHeight + (clientY - startY) * direction))
        );
        preferredHeightRef.current = next;
        const el = containerRef.current;
        if (el && isDesktopViewport()) {
          el.style.height = toRem(next, rootFontSize);
          el.style.maxHeight = toRem(max, rootFontSize);
        }
        scheduleResizeNotify();
      };

      const onMouseMove = (e: MouseEvent) => {
        updateAt(e.clientY);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        updateAt(e.touches[0].clientY);
      };

      const finish = () => {
        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
        if (containerRef.current) {
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
        syncContainerHeight(true);
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
      clearHeightTransition,
      containerRef,
      offsetY,
      position,
      scheduleResizeNotify,
      syncContainerHeight,
    ]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      beginDrag(e.clientY);
    },
    [beginDrag]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      beginDrag(e.touches[0].clientY);
    },
    [beginDrag]
  );

  const handleDoubleClick = useCallback(() => {
    preferredHeightRef.current = DESKTOP_DEFAULT_HEIGHT;
    syncContainerHeight(true, true);
    scheduleResizeNotify();
  }, [scheduleResizeNotify, syncContainerHeight]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isDesktopViewport()) return;
      const { min, max } = getDesktopHeightBounds(offsetY);
      const current = Math.min(
        max,
        Math.max(min, preferredHeightRef.current)
      );
      let next: number | null = null;

      if (e.key === "ArrowUp") {
        next = Math.min(max, current + KEYBOARD_RESIZE_STEP);
      } else if (e.key === "ArrowDown") {
        next = Math.max(min, current - KEYBOARD_RESIZE_STEP);
      } else if (e.key === "Home") {
        next = min;
      } else if (e.key === "End") {
        next = max;
      }

      if (next !== null) {
        e.preventDefault();
        preferredHeightRef.current = next;
        syncContainerHeight(true, true);
        scheduleResizeNotify();
      }
    },
    [offsetY, scheduleResizeNotify, syncContainerHeight]
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
