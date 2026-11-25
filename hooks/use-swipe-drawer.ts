"use client";

import { useEffect, useRef } from "react";

const COMMIT_PX = 6;
const CLOSE_RATIO = 0.22;
const CLOSE_VELOCITY = 0.35;
const REOPEN_VELOCITY = -0.25;
const CLOSE_MIN_FLICK_PX = 36;
const CLOSE_MIN_MS = 120;
const CLOSE_MAX_MS = 190;
const SNAP_MIN_MS = 140;
const SNAP_MAX_MS = 200;
const RELEASE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function computeSwipeVelocity(
  now: number,
  startT: number,
  currSampleT: number,
  prevSampleT: number,
  currSampleX: number,
  prevSampleX: number,
  sign: number,
  dragX: number
): number {
  const totalDt = now - startT;
  if (now - currSampleT > 80 || totalDt <= 0) return 0;
  const sampleDt = currSampleT - prevSampleT;
  const instantaneous = sampleDt > 0 ? (sign * (currSampleX - prevSampleX)) / sampleDt : 0;
  if (instantaneous < REOPEN_VELOCITY) return instantaneous;
  return Math.max(instantaneous, dragX / totalDt);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function shouldIgnoreSwipeStart(target: EventTarget | null, panel: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== panel) {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable) ||
      el.hasAttribute("data-no-swipe")
    ) {
      return true;
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Swipe-to-dismiss gesture controller for overlay drawers; `direction` is the way the panel leaves. */
export function useSwipeDrawer(
  panelRef: React.RefObject<HTMLElement | null>,
  scrimRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onSwipeClose: () => void,
  direction: "right" | "left" = "right"
) {
  const onSwipeCloseRef = useRef(onSwipeClose);

  useEffect(() => {
    onSwipeCloseRef.current = onSwipeClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;
    const sign = direction === "right" ? 1 : -1;
    const closedTransform = `translateX(${sign * 100}%)`;

    const clearInlineMotion = () => {
      panel.style.transition = "";
      panel.style.transform = "";
      if (scrimRef.current) {
        scrimRef.current.style.transition = "";
        scrimRef.current.style.opacity = "";
      }
    };

    clearInlineMotion();

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let prevSampleX = 0;
    let prevSampleT = 0;
    let currSampleX = 0;
    let currSampleT = 0;
    let mode: "idle" | "pending" | "drag" | "ignore" = "idle";
    let dragX = 0;
    let panelWidth = 0;
    let snapResetTimer = 0;
    let snapListenerPanel: HTMLElement | null = null;
    let onSnapTransitionEnd: ((e: TransitionEvent) => void) | null = null;

    const cancelSnapCleanup = () => {
      if (snapResetTimer) {
        window.clearTimeout(snapResetTimer);
        snapResetTimer = 0;
      }
      if (snapListenerPanel && onSnapTransitionEnd) {
        snapListenerPanel.removeEventListener("transitionend", onSnapTransitionEnd);
      }
      snapListenerPanel = null;
      onSnapTransitionEnd = null;
    };

    const measureWidth = () => {
      panelWidth = panel.getBoundingClientRect().width || window.innerWidth || 1;
      return panelWidth;
    };

    const getWidth = () => panelWidth || measureWidth();

    const setDrag = (x: number) => {
      panel.style.transition = "none";
      panel.style.transform = `translateX(${sign * x}px)`;
      if (scrimRef.current) {
        scrimRef.current.style.transition = "none";
        scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - x / getWidth())));
      }
    };

    const snapBack = () => {
      cancelSnapCleanup();
      const reduced = prefersReducedMotion();
      const progress = Math.min(1, dragX / getWidth());
      const durationMs = Math.round(SNAP_MIN_MS + (SNAP_MAX_MS - SNAP_MIN_MS) * progress);
      // Flush dragged transform before re-enabling transition so the browser animates instead of jumping
      if (!reduced) {
        panel.getBoundingClientRect();
      }
      panel.style.transition = reduced ? "none" : `transform ${durationMs}ms ${RELEASE_EASING}`;
      panel.style.transform = "translateX(0px)";
      if (scrimRef.current) {
        scrimRef.current.style.transition = reduced ? "none" : `opacity ${durationMs}ms ease-out`;
        scrimRef.current.style.opacity = "1";
      }

      const cleanup = () => {
        cancelSnapCleanup();
        if (mode === "idle") {
          clearInlineMotion();
        }
      };

      onSnapTransitionEnd = (e: TransitionEvent) => {
        if (e.target === panel && e.propertyName === "transform") {
          cleanup();
        }
      };
      snapListenerPanel = panel;
      panel.addEventListener("transitionend", onSnapTransitionEnd);
      snapResetTimer = window.setTimeout(cleanup, reduced ? 0 : durationMs + 32);
    };

    const animateClose = (velocity: number) => {
      cancelSnapCleanup();
      const reduced = prefersReducedMotion();
      const remainingRatio = Math.max(0, 1 - dragX / getWidth());
      const velocityBoost = Math.min(0.45, Math.max(0, velocity - CLOSE_VELOCITY) * 0.25);
      const durationMs = Math.round(
        CLOSE_MIN_MS +
          (CLOSE_MAX_MS - CLOSE_MIN_MS) * remainingRatio * (1 - velocityBoost)
      );
      if (!reduced) {
        panel.getBoundingClientRect();
      }
      panel.style.transition = reduced ? "none" : `transform ${durationMs}ms ${RELEASE_EASING}`;
      panel.style.transform = closedTransform;
      if (scrimRef.current) {
        scrimRef.current.style.transition = reduced ? "none" : `opacity ${durationMs}ms ease-out`;
        scrimRef.current.style.opacity = "0";
      }
      onSwipeCloseRef.current();
    };

    const onStart = (e: TouchEvent) => {
      cancelSnapCleanup();
      if (e.touches.length !== 1 || shouldIgnoreSwipeStart(e.target, panel)) {
        mode = "ignore";
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
      prevSampleX = startX;
      prevSampleT = startT;
      currSampleX = startX;
      currSampleT = startT;
      dragX = 0;
      measureWidth();
      mode = "pending";
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "idle" || mode === "ignore") return;
      const t = e.touches[0];
      if (!t) return;
      const now = performance.now();
      if (now - currSampleT >= 16) {
        prevSampleX = currSampleX;
        prevSampleT = currSampleT;
        currSampleX = t.clientX;
        currSampleT = now;
      }

      const dx = sign * (t.clientX - startX);
      const dy = t.clientY - startY;

      if (mode === "pending") {
        if (Math.abs(dx) < COMMIT_PX && Math.abs(dy) < COMMIT_PX) return;
        mode = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.1 ? "drag" : "ignore";
        if (mode === "ignore") return;
      }

      if (e.cancelable) e.preventDefault();
      dragX = Math.max(0, dx - COMMIT_PX);
      setDrag(dragX);
    };

    const onEnd = () => {
      if (mode !== "drag") {
        mode = "idle";
        return;
      }
      const now = performance.now();
      const velocity = computeSwipeVelocity(now, startT, currSampleT, prevSampleT, currSampleX, prevSampleX, sign, dragX);
      mode = "idle";

      if (
        velocity >= REOPEN_VELOCITY &&
        (dragX > getWidth() * CLOSE_RATIO ||
          (velocity > CLOSE_VELOCITY && dragX > CLOSE_MIN_FLICK_PX))
      ) {
        animateClose(velocity);
      } else {
        snapBack();
      }
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);

    return () => {
      cancelSnapCleanup();
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
      if (panel.style.transform !== closedTransform) {
        clearInlineMotion();
      }
    };
  }, [enabled, panelRef, scrimRef, direction]);
}
