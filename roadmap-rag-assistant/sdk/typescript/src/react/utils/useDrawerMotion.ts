"use client";

import { useCallback, useEffect, useRef } from "react";

const MOBILE_QUERY = "(max-width: 767px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Distance in px before a drag counts as horizontal (a short wobble stays a scroll) */
const COMMIT_PX = 10;
/** Share of the panel width that must be dragged to close on release */
const CLOSE_RATIO = 0.3;
/** Release speed in px/ms that closes the drawer even when it is short of the ratio */
const CLOSE_VELOCITY = 0.5;
const CLOSE_MIN_FLICK_PX = 40;
const CLOSE_MS = 240;
const SNAP_MS = 200;

function isMobile(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** True when the touch started inside something that scrolls sideways (table, code block) or a field */
function startsInHorizontalScroller(target: EventTarget | null, panel: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== panel) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Mobile drawer motion for the chat panel: swipe right to close, and a close that slides the
 * panel out before `done` runs. Drag moves the panel and scrim through styles set on the
 * elements, not React state, so a drag does not re-render the widget every frame.
 *
 * Desktop (>= 768px) gets no gesture and `close` runs `done` straight away.
 */
export function useDrawerMotion(
  panelRef: React.RefObject<HTMLElement | null>,
  scrimRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onSwipeClose: () => void
) {
  const onSwipeCloseRef = useRef(onSwipeClose);
  useEffect(() => {
    onSwipeCloseRef.current = onSwipeClose;
  });

  const close = useCallback(
    (done: () => void) => {
      const panel = panelRef.current;
      const scrim = scrimRef.current;
      if (!panel || !isMobile() || prefersReducedMotion()) {
        done();
        return;
      }
      panel.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      panel.style.transform = "translateX(100%)";
      if (scrim) {
        scrim.style.transition = `opacity ${CLOSE_MS}ms ease-out`;
        scrim.style.opacity = "0";
      }
      window.setTimeout(done, CLOSE_MS);
    },
    [panelRef, scrimRef]
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let lastX = 0;
    let lastT = 0;
    let instantaneousVelocity = 0;
    let mode: "idle" | "pending" | "drag" | "ignore" = "idle";
    let dragX = 0;

    const width = () => panel.getBoundingClientRect().width || window.innerWidth;

    const setDrag = (x: number) => {
      panel.style.transition = "none";
      panel.style.transform = `translateX(${x}px)`;
      if (scrimRef.current) {
        scrimRef.current.style.transition = "none";
        // Scrim opacity decreases smoothly from 1 to 0 as panel is pulled right to reveal the page
        scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - x / width())));
      }
    };

    const snapBack = () => {
      panel.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      panel.style.transform = "translateX(0px)";
      if (scrimRef.current) {
        scrimRef.current.style.transition = `opacity ${SNAP_MS}ms ease-out`;
        scrimRef.current.style.opacity = "1";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (!isMobile() || e.touches.length !== 1) {
        mode = "ignore";
        return;
      }
      if (startsInHorizontalScroller(e.target, panel)) {
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
      mode = "pending";
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "idle" || mode === "ignore") return;
      const t = e.touches[0];
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
        // Only a clearly sideways move to the right is a swipe; anything else is a scroll
        mode = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5 ? "drag" : "ignore";
        if (mode === "ignore") return;
      }

      // Taking over the gesture: keep the browser from scrolling the page underneath
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
      // If finger stopped moving for >80ms before release, velocity is 0 (intentional hold);
      // otherwise consider the release flick velocity.
      const velocity =
        now - lastT > 80
          ? 0
          : Math.max(instantaneousVelocity, dragX / Math.max(1, now - startT));

      mode = "idle";
      // A fast flick closes only once it has covered a real distance, so a quick tap-wobble can't
      if (dragX > width() * CLOSE_RATIO || (velocity > CLOSE_VELOCITY && dragX > CLOSE_MIN_FLICK_PX)) {
        close(() => onSwipeCloseRef.current());
      } else {
        snapBack();
      }
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, panelRef, scrimRef, close]);

  return { close };
}
