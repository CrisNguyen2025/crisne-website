"use client";

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const OVERLAY_INTERACTIVE_SELECTOR =
  '[aria-modal="true"], [role="listbox"], [role="menu"]';
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

let overlayLockCount = 0;
let lockedScrollX = 0;
let lockedScrollY = 0;
let lastTouchX = 0;
let lastTouchY = 0;

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function canScrollInDirection(
  el: HTMLElement,
  deltaX: number,
  deltaY: number
): boolean {
  const style = window.getComputedStyle(el);
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    const canScrollY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1;
    if (!canScrollY) return false;
    if (deltaY < 0) return el.scrollTop > 0;
    if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    return false;
  }
  const canScrollX =
    (style.overflowX === "auto" || style.overflowX === "scroll") &&
    el.scrollWidth > el.clientWidth + 1;
  if (!canScrollX) return false;
  if (deltaX < 0) return el.scrollLeft > 0;
  if (deltaX > 0) return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  return false;
}

function hasScrollableOverlayAncestor(
  target: EventTarget | null,
  deltaX: number,
  deltaY: number
): boolean {
  if (!(target instanceof Element)) return false;
  const boundary = target.closest(OVERLAY_INTERACTIVE_SELECTOR);
  if (!boundary) return false;

  let current: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (current) {
    if (canScrollInDirection(current, deltaX, deltaY)) {
      return true;
    }
    if (current === boundary) break;
    current = current.parentElement;
  }
  return false;
}

function handleOverlayWheel(e: WheelEvent) {
  if (!hasScrollableOverlayAncestor(e.target, e.deltaX, e.deltaY)) {
    e.preventDefault();
  }
}

function handleOverlayTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}

function handleOverlayTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  const deltaX = lastTouchX - touch.clientX;
  const deltaY = lastTouchY - touch.clientY;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
  if (!hasScrollableOverlayAncestor(e.target, deltaX, deltaY)) {
    e.preventDefault();
  }
}

function handleOverlayScrollKey(e: KeyboardEvent) {
  if (!SCROLL_KEYS.has(e.key)) return;
  if (isEditableElement(e.target)) return;
  if (e.target instanceof Element && e.target.closest(OVERLAY_INTERACTIVE_SELECTOR)) {
    return;
  }
  e.preventDefault();
}

function handleOverlayWindowScroll() {
  if (window.scrollX !== lockedScrollX || window.scrollY !== lockedScrollY) {
    window.scrollTo({
      left: lockedScrollX,
      top: lockedScrollY,
      behavior: "instant",
    });
  }
}

function lockPageScroll() {
  if (overlayLockCount === 0) {
    lockedScrollX = window.scrollX;
    lockedScrollY = window.scrollY;
    window.addEventListener("wheel", handleOverlayWheel, { passive: false });
    window.addEventListener("touchstart", handleOverlayTouchStart, { passive: true });
    window.addEventListener("touchmove", handleOverlayTouchMove, { passive: false });
    window.addEventListener("keydown", handleOverlayScrollKey);
    window.addEventListener("scroll", handleOverlayWindowScroll, { passive: true });
  }
  overlayLockCount += 1;
}

function unlockPageScroll() {
  overlayLockCount = Math.max(0, overlayLockCount - 1);
  if (overlayLockCount === 0) {
    window.removeEventListener("wheel", handleOverlayWheel);
    window.removeEventListener("touchstart", handleOverlayTouchStart);
    window.removeEventListener("touchmove", handleOverlayTouchMove);
    window.removeEventListener("keydown", handleOverlayScrollKey);
    window.removeEventListener("scroll", handleOverlayWindowScroll);
  }
}

/** Close on Escape and lock page scroll while an overlay is open. */
export function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    lockPageScroll();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unlockPageScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);
}

/** Portals render only on the client, after mount. */
const noopSubscribe = () => () => {};

export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Centered dialog on sm and up; a bottom sheet on phones. */
export function Dialog({ open, onClose, title, description, icon, children, footer, className }: DialogProps) {
  const isMounted = useMounted();
  useOverlay(open, onClose);
  if (!open || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-xl",
          "animate-in slide-in-from-bottom-4 duration-200 sm:max-w-md sm:rounded-2xl sm:zoom-in-95 sm:slide-in-from-bottom-0",
          className
        )}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          {icon && <div className="mt-0.5 shrink-0 text-primary">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
