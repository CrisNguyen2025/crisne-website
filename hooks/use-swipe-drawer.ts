"use client";

import { useEffect, useRef } from "react";

const COMMIT_PX = 10;
const CLOSE_RATIO = 0.3;
const CLOSE_VELOCITY = 0.5;
const CLOSE_MIN_FLICK_PX = 40;
const CLOSE_MS = 240;
const SNAP_MS = 200;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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

/** Right-swipe gesture controller for dismissible overlay drawers. */
export function useSwipeDrawer(
  panelRef: React.RefObject<HTMLElement | null>,
  scrimRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onSwipeClose: () => void
) {
  const onSwipeCloseRef = useRef(onSwipeClose);

  useEffect(() => {
    onSwipeCloseRef.current = onSwipeClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;

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
    let lastX = 0;
    let lastT = 0;
    let instantaneousVelocity = 0;
    let mode: "idle" | "pending" | "drag" | "ignore" = "idle";
    let dragX = 0;
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

    const width = () => panel.getBoundingClientRect().width || window.innerWidth;

    const setDrag = (x: number) => {
      panel.style.transition = "none";
      panel.style.transform = `translateX(${x}px)`;
      if (scrimRef.current) {
        scrimRef.current.style.transition = "none";
        scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - x / width())));
      }
    };

    const snapBack = () => {
      cancelSnapCleanup();
      const reduced = prefersReducedMotion();
      panel.style.transition = reduced
        ? "none"
        : `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      panel.style.transform = "translateX(0px)";
      if (scrimRef.current) {
        scrimRef.current.style.transition = reduced ? "none" : `opacity ${SNAP_MS}ms ease-out`;
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
      snapResetTimer = window.setTimeout(cleanup, reduced ? 0 : SNAP_MS + 32);
    };

    const animateClose = () => {
      cancelSnapCleanup();
      const reduced = prefersReducedMotion();
      panel.style.transition = reduced
        ? "none"
        : `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      panel.style.transform = "translateX(100%)";
      if (scrimRef.current) {
        scrimRef.current.style.transition = reduced ? "none" : `opacity ${CLOSE_MS}ms ease-out`;
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
      lastX = startX;
      lastT = startT;
      instantaneousVelocity = 0;
      dragX = 0;
      mode = "pending";
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "idle" || mode === "ignore") return;
      const t = e.touches[0];
      if (!t) return;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 16) {
        instantaneousVelocity = (t.clientX - lastX) / dt;
        lastX = t.clientX;
        lastT = now;
      }

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (mode === "pending") {
        if (Math.abs(dx) < COMMIT_PX && Math.abs(dy) < COMMIT_PX) return;
        mode = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5 ? "drag" : "ignore";
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
      const velocity =
        now - lastT > 80
          ? 0
          : Math.max(instantaneousVelocity, dragX / Math.max(1, now - startT));
      mode = "idle";

      if (
        dragX > width() * CLOSE_RATIO ||
        (velocity > CLOSE_VELOCITY && dragX > CLOSE_MIN_FLICK_PX)
      ) {
        animateClose();
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
      if (panel.style.transform !== "translateX(100%)") {
        clearInlineMotion();
      }
    };
  }, [enabled, panelRef, scrimRef]);
}
