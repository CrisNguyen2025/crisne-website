"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const MOBILE_QUERY = "(max-width: 639px)";
const LOCK_THRESHOLD_PX = 5;
const EXPAND_DISTANCE_PX = 28;
const EXPAND_VELOCITY = 0.25;
const COLLAPSE_DISTANCE_PX = 36;
const COLLAPSE_VELOCITY = 0.25;
const DISMISS_DISTANCE_PX = 56;
const DISMISS_VELOCITY = 0.3;
const SPRING_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SETTLE_MS = 280;

interface UseBottomSheetDragOptions {
  open: boolean;
  onClose: () => void;
}

interface TouchSession {
  startX: number;
  startY: number;
  startTime: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  startHeight: number;
  restingHeight: number;
  fullHeight: number;
  axis: "pending" | "vertical" | "horizontal";
  startedOnHandle: boolean;
  scrollParent: HTMLElement | null;
  dragging: boolean;
}

function findScrollableParent(
  target: EventTarget | null,
  boundary: HTMLElement | null
): HTMLElement | null {
  if (!(target instanceof Element) || !boundary) return null;
  let current: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (current && current !== boundary) {
    const style = window.getComputedStyle(current);
    const canScroll =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function rubberBand(distance: number, maxStretch: number): number {
  const abs = Math.abs(distance);
  const damped = maxStretch * (1 - Math.exp(-abs / (maxStretch * 1.4)));
  return distance < 0 ? -damped : damped;
}

function resolveDragAxis(session: TouchSession, dx: number, dy: number): boolean {
  if (session.axis === "pending") {
    if (Math.abs(dx) < LOCK_THRESHOLD_PX && Math.abs(dy) < LOCK_THRESHOLD_PX) {
      return false;
    }
    session.axis = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
  }
  return session.axis === "vertical";
}

function shouldYieldToScroll(session: TouchSession, dy: number, expanded: boolean): boolean {
  if (session.startedOnHandle || !session.scrollParent) return false;
  const atTop = session.scrollParent.scrollTop <= 1;
  return (dy > 0 && !atTop) || (dy < 0 && expanded);
}

function computeCornerRadius(height: number, restingHeight: number, fullHeight: number): string {
  const span = Math.max(1, fullHeight - restingHeight);
  const ratio = Math.max(0, Math.min(1, (height - restingHeight) / span));
  const radiusPx = Math.round(16 * (1 - ratio));
  return `${radiusPx}px ${radiusPx}px 0 0`;
}

function applyExpandedDragFrame(
  sheet: HTMLDivElement,
  session: TouchSession,
  dy: number
) {
  if (dy <= 0) {
    sheet.style.height = `${session.fullHeight}px`;
    sheet.style.transform = "";
    sheet.style.borderRadius = "0px";
    return;
  }
  const targetHeight = session.fullHeight - dy;
  if (targetHeight >= session.restingHeight) {
    sheet.style.height = `${targetHeight}px`;
    sheet.style.transform = "";
    sheet.style.borderRadius = computeCornerRadius(
      targetHeight,
      session.restingHeight,
      session.fullHeight
    );
  } else {
    const overflow = session.restingHeight - targetHeight;
    sheet.style.height = `${session.restingHeight}px`;
    sheet.style.transform = `translate3d(0, ${rubberBand(overflow, 36)}px, 0)`;
    sheet.style.borderRadius = "16px 16px 0 0";
  }
}

function applyRestingDragFrame(
  sheet: HTMLDivElement,
  backdrop: HTMLDivElement | null,
  session: TouchSession,
  dy: number
) {
  if (dy < 0) {
    const nextHeight = Math.min(session.fullHeight, session.startHeight - dy);
    sheet.style.height = `${nextHeight}px`;
    sheet.style.maxHeight = `${session.fullHeight}px`;
    sheet.style.transform = "";
    sheet.style.borderRadius = computeCornerRadius(
      nextHeight,
      session.restingHeight,
      session.fullHeight
    );
    if (backdrop) backdrop.style.opacity = "";
    return;
  }

  sheet.style.height = "";
  sheet.style.maxHeight = "";
  sheet.style.borderRadius = "";
  sheet.style.transform = `translate3d(0, ${dy}px, 0)`;

  if (backdrop) {
    const height = Math.max(session.restingHeight, 320);
    const progress = Math.min(1, dy / (height * 0.85));
    backdrop.style.opacity = String(Math.max(0, 1 - progress));
  }
}

/**
 * 2-detent mobile bottom-sheet gesture:
 * - Drag up slowly: height grows 1:1 with finger, releasing glides to full height (100dvh)
 * - From full height, swipe down lightly: shrinks 1:1 and returns to resting/default height
 * - From resting height, swipe down lightly: slides down with backdrop fade and closes
 */
export function useBottomSheetDrag({ open, onClose }: UseBottomSheetDragOptions) {
  const [expanded, setExpanded] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const restingHeightRef = useRef<number | null>(null);
  const touchRef = useRef<TouchSession | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setExpanded(false);
    }
  }

  const clearInlineStyles = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.height = "";
      sheet.style.maxHeight = "";
      sheet.style.borderRadius = "";
      sheet.style.transition = "";
      sheet.style.willChange = "";
    }
    if (backdrop) {
      backdrop.style.opacity = "";
      backdrop.style.transition = "";
    }
  }, []);

  useEffect(() => {
    if (!open) {
      restingHeightRef.current = null;
      return;
    }
    clearInlineStyles();
    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [open, clearInlineStyles]);

  const animateHeightTo = useCallback(
    (targetHeightPx: number, targetRadius: string, nextExpanded?: boolean) => {
      const sheet = sheetRef.current;
      const backdrop = backdropRef.current;
      if (sheet) {
        sheet.style.transition = `height ${SETTLE_MS}ms ${SPRING_EASE}, transform ${SETTLE_MS}ms ${SPRING_EASE}, border-radius ${SETTLE_MS}ms ease-out`;
        sheet.style.maxHeight = "100dvh";
        sheet.style.height = `${targetHeightPx}px`;
        sheet.style.transform = "translate3d(0, 0, 0)";
        sheet.style.borderRadius = targetRadius;
      }
      if (backdrop) {
        backdrop.style.transition = "opacity 220ms ease-out";
        backdrop.style.opacity = "";
      }
      if (nextExpanded !== undefined) {
        setExpanded(nextExpanded);
      }
      settleTimerRef.current = window.setTimeout(clearInlineStyles, SETTLE_MS + 16);
    },
    [clearInlineStyles]
  );

  const dismissSmoothly = useCallback(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.transition = `transform 220ms ${SPRING_EASE}`;
      sheet.style.transform = "translate3d(0, 100%, 0)";
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 180ms ease-out";
      backdrop.style.opacity = "0";
    }
    onClose();
  }, [onClose]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!window.matchMedia?.(MOBILE_QUERY).matches) return;
      const touch = e.touches[0];
      const sheet = sheetRef.current;
      if (!touch || !sheet) return;

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      const currentHeight = sheet.offsetHeight;
      if (!expanded) {
        restingHeightRef.current = currentHeight;
      }
      const fullHeight = window.innerHeight;
      const restingHeight = restingHeightRef.current ?? Math.min(currentHeight, fullHeight * 0.82);

      const target = e.target instanceof Element ? e.target : null;
      const startedOnHandle = Boolean(target?.closest("[data-sheet-handle]"));
      const now = Date.now();

      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: now,
        lastY: touch.clientY,
        lastTime: now,
        velocity: 0,
        startHeight: currentHeight,
        restingHeight,
        fullHeight,
        axis: "pending",
        startedOnHandle,
        scrollParent: startedOnHandle
          ? null
          : findScrollableParent(e.target, sheetRef.current),
        dragging: false,
      };
    },
    [expanded]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const session = touchRef.current;
      const touch = e.touches[0];
      const sheet = sheetRef.current;
      if (!session || !touch || !sheet) return;

      const dx = touch.clientX - session.startX;
      const dy = touch.clientY - session.startY;
      if (!resolveDragAxis(session, dx, dy)) return;
      if (shouldYieldToScroll(session, dy, expanded)) return;

      const now = Date.now();
      session.velocity = (touch.clientY - session.lastY) / Math.max(1, now - session.lastTime);
      session.lastY = touch.clientY;
      session.lastTime = now;

      if (!session.dragging) {
        session.dragging = true;
        if (dy > 0 && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        sheet.style.transition = "none";
        sheet.style.willChange = "transform, height";
        if (backdropRef.current) backdropRef.current.style.transition = "none";
      }

      if (expanded) {
        applyExpandedDragFrame(sheet, session, dy);
      } else {
        applyRestingDragFrame(sheet, backdropRef.current, session, dy);
      }
    },
    [expanded]
  );

  const finishDrag = useCallback(
    (e: React.TouchEvent) => {
      const session = touchRef.current;
      touchRef.current = null;
      if (!session || !session.dragging) return;

      const touch = e.changedTouches[0];
      const rawDy = touch ? touch.clientY - session.startY : session.lastY - session.startY;
      const totalElapsed = Math.max(1, Date.now() - session.startTime);
      const velocity =
        Math.abs(session.velocity) > 0.05 ? session.velocity : rawDy / totalElapsed;

      if (expanded) {
        // From full height, any light swipe down returns cleanly to default resting height
        if (rawDy > COLLAPSE_DISTANCE_PX || velocity > COLLAPSE_VELOCITY) {
          animateHeightTo(session.restingHeight, "16px 16px 0 0", false);
        } else {
          animateHeightTo(session.fullHeight, "0px");
        }
        return;
      }

      // From resting height: swipe up → glide to full height
      if (rawDy < -EXPAND_DISTANCE_PX || velocity < -EXPAND_VELOCITY) {
        animateHeightTo(session.fullHeight, "0px", true);
        return;
      }

      // From resting height: swipe down → dismiss smoothly
      if (rawDy > DISMISS_DISTANCE_PX || velocity > DISMISS_VELOCITY) {
        dismissSmoothly();
        return;
      }

      // Otherwise snap softly back to resting height
      animateHeightTo(session.restingHeight, "16px 16px 0 0");
    },
    [expanded, animateHeightTo, dismissSmoothly]
  );

  return {
    isExpanded: expanded,
    sheetRef,
    backdropRef,
    sheetTouchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: finishDrag,
      onTouchCancel: finishDrag,
    },
  };
}
