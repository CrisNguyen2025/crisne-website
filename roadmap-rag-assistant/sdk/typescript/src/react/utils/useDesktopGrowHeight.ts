import React, { useEffect, useLayoutEffect, useRef } from "react";

export const DESKTOP_MIN_HEIGHT = 480;
const DESKTOP_QUERY = "(min-width: 768px)";
const OPPOSITE_EDGE_GAP = 24;
const GROW_TAU_MS = 42;

function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(DESKTOP_QUERY).matches;
  }
  return window.innerWidth >= 768;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface UseDesktopGrowHeightOptions {
  isOpen: boolean;
  isInitStage: boolean;
  isStreaming: boolean;
  offsetY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef?: React.RefObject<HTMLElement | null>;
  /** Invoked at the exact frame the growing panel arrives at the ceiling */
  onReachCeiling?: () => void;
}

export interface UseDesktopGrowHeightReturn {
  contentRef: React.RefObject<HTMLDivElement | null>;
  isSubCeilingRef: React.RefObject<boolean>;
}

/**
 * Progressive desktop height (`480px` init/min -> smooth rAF content-hug -> full viewport ceiling).
 * Keeps `scrollTop = 0` and hides transient scrollbar thumbs below ceiling (`data-sub-ceiling="true"`),
 * then hands off cleanly to internal scrolling once the panel touches the ceiling.
 */
export function useDesktopGrowHeight({
  isOpen,
  isInitStage,
  isStreaming,
  offsetY,
  containerRef,
  scrollRef,
  inputRef,
  onReachCeiling,
}: UseDesktopGrowHeightOptions): UseDesktopGrowHeightReturn {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isSubCeilingRef = useRef<boolean>(false);
  const displayedHeightRef = useRef<number>(DESKTOP_MIN_HEIGHT);
  const streamingFloorRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const wasOpenRef = useRef<boolean>(false);
  const wasInitStageRef = useRef<boolean>(isInitStage);

  const latestRef = useRef({
    isInitStage,
    isStreaming,
    offsetY,
    onReachCeiling,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      isInitStage,
      isStreaming,
      offsetY,
      onReachCeiling,
    };
  });

  const updateFnRef = useRef<(immediate: boolean) => void>(() => {});
  useLayoutEffect(() => {
    const cancelGlide = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const measureTarget = (container: HTMLElement) => {
      const {
        isInitStage: init,
        isStreaming: streaming,
        offsetY: offY,
      } = latestRef.current;
      const viewportH =
        typeof window !== "undefined" ? window.innerHeight : 900;
      const ceiling = Math.max(320, viewportH - (offY + OPPOSITE_EDGE_GAP));
      const minH = Math.min(DESKTOP_MIN_HEIGHT, ceiling);
      if (init) {
        return { target: minH, ceiling };
      }
      const scrollEl = scrollRef.current;
      const contentEl = contentRef.current;
      if (!scrollEl || !contentEl) {
        return { target: minH, ceiling };
      }
      const chromeH = Math.max(
        0,
        container.offsetHeight - scrollEl.clientHeight
      );
      // Include 1px bottom sentinel sibling inside scrollEl
      const contentH = contentEl.offsetHeight + 1;
      const raw = Math.min(ceiling, Math.max(minH, chromeH + contentH));
      if (streaming) {
        streamingFloorRef.current = Math.min(
          ceiling,
          Math.max(streamingFloorRef.current, raw)
        );
        return { target: streamingFloorRef.current, ceiling };
      }
      return { target: raw, ceiling };
    };

    const syncSubCeiling = (subCeiling: boolean, notifyHandoff: boolean) => {
      const wasSubCeiling = isSubCeilingRef.current;
      isSubCeilingRef.current = subCeiling;
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        scrollEl.dataset.subCeiling = subCeiling ? "true" : "false";
        if (subCeiling && scrollEl.scrollTop !== 0) {
          scrollEl.scrollTop = 0;
        }
      }
      if (notifyHandoff && wasSubCeiling && !subCeiling) {
        latestRef.current.onReachCeiling?.();
      }
    };

    updateFnRef.current = (immediate: boolean) => {
      const container = containerRef.current;
      if (!container) return;

      if (!isDesktopViewport()) {
        cancelGlide();
        container.style.height = "";
        container.style.maxHeight = "";
        syncSubCeiling(false, false);
        return;
      }

      const { target, ceiling } = measureTarget(container);
      container.style.maxHeight = `${ceiling}px`;

      if (immediate || prefersReducedMotion()) {
        cancelGlide();
        displayedHeightRef.current = target;
        container.style.height = `${target}px`;
        syncSubCeiling(target < ceiling - 0.5, !immediate);
        return;
      }

      const curr = displayedHeightRef.current;
      if (Math.abs(target - curr) <= 0.5) {
        displayedHeightRef.current = target;
        container.style.height = `${target}px`;
        syncSubCeiling(target < ceiling - 0.5, true);
        return;
      }

      const nextSubCeiling = curr < ceiling - 0.5 || target < ceiling - 0.5;
      syncSubCeiling(nextSubCeiling, false);

      if (rafRef.current !== null) return;

      let lastTime = performance.now();
      const tick = (now: number) => {
        const el = containerRef.current;
        if (!el || !isDesktopViewport()) {
          rafRef.current = null;
          return;
        }
        const { target: tgt, ceiling: ceil } = measureTarget(el);
        el.style.maxHeight = `${ceil}px`;

        const prev = displayedHeightRef.current;
        const diff = tgt - prev;
        const dt = Math.min(now - lastTime, 64);
        lastTime = now;

        if (Math.abs(diff) <= 0.5) {
          displayedHeightRef.current = tgt;
          el.style.height = `${tgt}px`;
          rafRef.current = null;
          syncSubCeiling(tgt < ceil - 0.5, true);
          return;
        }

        const factor = 1 - Math.exp(-dt / GROW_TAU_MS);
        const next = prev + diff * factor;
        displayedHeightRef.current = next;
        el.style.height = `${next}px`;
        syncSubCeiling(next < ceil - 0.5 || tgt < ceil - 0.5, true);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };
  });

  // Snap cleanly on initial open or new conversation reset before paint, and update streaming ratchet floor
  useLayoutEffect(() => {
    if (!isOpen) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      wasOpenRef.current = false;
      wasInitStageRef.current = isInitStage;
      streamingFloorRef.current = 0;
      isSubCeilingRef.current = false;
      return;
    }

    if (isStreaming) {
      streamingFloorRef.current = Math.max(
        streamingFloorRef.current,
        displayedHeightRef.current
      );
    } else {
      streamingFloorRef.current = 0;
    }

    const justOpened = !wasOpenRef.current;
    const enteringInit = !justOpened && !wasInitStageRef.current && isInitStage;
    wasOpenRef.current = true;
    wasInitStageRef.current = isInitStage;

    if (scrollRef.current && isDesktopViewport() && !justOpened) {
      scrollRef.current.dataset.subCeiling = isSubCeilingRef.current
        ? "true"
        : "false";
    }

    updateFnRef.current(justOpened || enteringInit);

    // Replay the crisp init entrance (fade + zoom-in-95) instead of shrinking down from chat height
    if (
      enteringInit &&
      !prefersReducedMotion() &&
      typeof containerRef.current?.animate === "function"
    ) {
      const keyframes = isDesktopViewport()
        ? [
            { opacity: 0, transform: "scale(0.95)" },
            { opacity: 1, transform: "scale(1)" },
          ]
        : [{ opacity: 0 }, { opacity: 1 }];
      containerRef.current.animate(keyframes, {
        duration: 200,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
  }, [isOpen, isInitStage, isStreaming, offsetY, containerRef, scrollRef]);

  // Observe natural content/composer height changes and viewport resizing
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => updateFnRef.current(false);
    window.addEventListener("resize", handleResize, { passive: true });

    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(DESKTOP_QUERY)
        : null;
    mql?.addEventListener?.("change", handleResize);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateFnRef.current(false))
        : null;
    if (ro) {
      if (contentRef.current) ro.observe(contentRef.current);
      if (inputRef?.current) ro.observe(inputRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      mql?.removeEventListener?.("change", handleResize);
      ro?.disconnect();
    };
  }, [isOpen, isInitStage, inputRef]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  return { contentRef, isSubCeilingRef };
}
