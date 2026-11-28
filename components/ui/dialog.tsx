"use client";

import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnimatedPresence } from "@/hooks/use-animated-presence";
import { useBottomSheetDrag } from "@/hooks/use-bottom-sheet-drag";

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
let activeTouchScrollY: HTMLElement[] = [];
let activeTouchScrollX: HTMLElement[] = [];

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function collectScrollableOverlayAncestors(target: EventTarget | null) {
  activeTouchScrollY = [];
  activeTouchScrollX = [];
  if (!(target instanceof Element)) return;
  const boundary = target.closest(OVERLAY_INTERACTIVE_SELECTOR);
  if (!boundary) return;

  let current: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      activeTouchScrollY.push(current);
    }
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      current.scrollWidth > current.clientWidth + 1
    ) {
      activeTouchScrollX.push(current);
    }
    if (current === boundary) break;
    current = current.parentElement;
  }
}

function canElementsScrollAxis(elements: HTMLElement[], delta: number, axis: "x" | "y"): boolean {
  for (const el of elements) {
    const pos = axis === "y" ? el.scrollTop : el.scrollLeft;
    const viewport = axis === "y" ? el.clientHeight : el.clientWidth;
    const total = axis === "y" ? el.scrollHeight : el.scrollWidth;
    if (delta < 0 && pos > 0) return true;
    if (delta > 0 && pos + viewport < total - 1) return true;
  }
  return false;
}

function canCachedAncestorsScroll(deltaX: number, deltaY: number): boolean {
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    return canElementsScrollAxis(activeTouchScrollY, deltaY, "y");
  }
  return canElementsScrollAxis(activeTouchScrollX, deltaX, "x");
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
  collectScrollableOverlayAncestors(e.target);
}

function handleOverlayTouchMove(e: TouchEvent) {
  if (e.defaultPrevented) return;
  const touch = e.touches[0];
  if (!touch) return;
  const deltaX = lastTouchX - touch.clientX;
  const deltaY = lastTouchY - touch.clientY;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
  // Let swipe-to-dismiss drawers handle horizontal touch moves without interference
  if (
    Math.abs(deltaX) > Math.abs(deltaY) &&
    e.target instanceof Element &&
    e.target.closest("[data-swipe-drawer]")
  ) {
    return;
  }
  if (!canCachedAncestorsScroll(deltaX, deltaY)) {
    e.preventDefault();
  }
}

function handleOverlayTouchEnd() {
  activeTouchScrollY = [];
  activeTouchScrollX = [];
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
    window.addEventListener("touchend", handleOverlayTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleOverlayTouchEnd, { passive: true });
    window.addEventListener("keydown", handleOverlayScrollKey);
    window.addEventListener("scroll", handleOverlayWindowScroll, { passive: true });
  }
  overlayLockCount += 1;
}

function unlockPageScroll() {
  overlayLockCount = Math.max(0, overlayLockCount - 1);
  if (overlayLockCount === 0) {
    activeTouchScrollY = [];
    activeTouchScrollX = [];
    window.removeEventListener("wheel", handleOverlayWheel);
    window.removeEventListener("touchstart", handleOverlayTouchStart);
    window.removeEventListener("touchmove", handleOverlayTouchMove);
    window.removeEventListener("touchend", handleOverlayTouchEnd);
    window.removeEventListener("touchcancel", handleOverlayTouchEnd);
    window.removeEventListener("keydown", handleOverlayScrollKey);
    window.removeEventListener("scroll", handleOverlayWindowScroll);
  }
}

/** Close on Escape and lock page scroll while an overlay is open. */
export function useOverlay(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    lockPageScroll();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unlockPageScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
}

/** Portals render only on the client, after mount. */
const noopSubscribe = () => () => {};

export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const DIALOG_EXIT_MS = 180;

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  title: ReactNode;
  titleClassName?: string;
  hideHeaderTitleOnMobile?: boolean;
  hideCloseOnMobile?: boolean;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function getHeaderRowPadding(hideTitle: boolean, hideClose: boolean): string {
  if (hideTitle && hideClose) return "py-0 sm:py-4";
  if (hideTitle) return "py-1";
  if (hideClose) return "px-5 pt-1 pb-3 sm:py-4";
  return "px-3 py-2.5 sm:px-5 sm:py-4";
}

function getSheetSurfaceClass(isExpanded: boolean, isVisible: boolean): string {
  return cn(
    "relative flex w-full flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-xl transition-[transform,opacity,height,max-height,border-radius] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:max-w-md",
    isExpanded
      ? "h-dvh max-h-dvh rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:pt-0"
      : "max-h-[90dvh] rounded-t-2xl sm:rounded-2xl",
    isVisible
      ? "translate-y-0 opacity-100 duration-300 sm:scale-100"
      : "translate-y-full opacity-0 duration-200 sm:translate-y-1 sm:scale-[0.97]"
  );
}

/** Centered dialog on sm and up; a bottom sheet on phones. */
export function Dialog({
  open,
  onClose,
  onAfterClose,
  title,
  titleClassName,
  hideHeaderTitleOnMobile = false,
  hideCloseOnMobile = false,
  description,
  icon,
  children,
  footer,
  className,
}: DialogProps) {
  const isMounted = useMounted();
  const { shouldRender, isVisible } = useAnimatedPresence(open, DIALOG_EXIT_MS, onAfterClose);
  const { isExpanded, sheetRef, backdropRef, sheetTouchHandlers } = useBottomSheetDrag({
    open,
    onClose,
  });
  useOverlay(open, onClose);
  if (!shouldRender || !isMounted) return null;

  const headerRowPadding = getHeaderRowPadding(hideHeaderTitleOnMobile, hideCloseOnMobile);

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4",
        !open && "pointer-events-none"
      )}
      aria-hidden={!open || undefined}
    >
      <div
        ref={backdropRef}
        className={cn(
          "absolute inset-0 bg-black/40 sm:backdrop-blur-[0.125rem] transition-opacity ease-out motion-reduce:transition-none",
          isVisible ? "opacity-100 duration-250" : "opacity-0 duration-200"
        )}
        onClick={open ? onClose : undefined}
      />
      <div
        ref={sheetRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        {...sheetTouchHandlers}
        className={cn(getSheetSurfaceClass(isExpanded, isVisible), className)}
      >
        <div
          data-sheet-handle
          className={cn(
            "shrink-0 touch-none select-none border-border",
            hideHeaderTitleOnMobile ? "border-b-0 sm:border-b" : "border-b"
          )}
        >
          <div className="flex justify-center pt-2 pb-0.5 sm:hidden" aria-hidden="true">
            <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
          </div>
          <div
            className={cn(
              "flex items-center gap-2 sm:items-start sm:gap-3 sm:px-5 sm:py-4",
              headerRowPadding
            )}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cn(
                "shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer sm:order-last sm:-mr-1 sm:inline-flex sm:size-7 sm:rounded-lg",
                hideCloseOnMobile ? "hidden" : "inline-flex size-10"
              )}
            >
              <X className="size-5 sm:size-4" />
            </button>
            {icon && <div className="mt-0.5 hidden shrink-0 text-primary sm:block">{icon}</div>}
            <div
              className={cn(
                "min-w-0 flex-1 text-center sm:text-left",
                hideHeaderTitleOnMobile && "sr-only sm:not-sr-only"
              )}
            >
              <h2 className={cn("text-base font-semibold text-foreground sm:text-sm", titleClassName)}>
                {title}
              </h2>
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            {!hideHeaderTitleOnMobile && !hideCloseOnMobile && (
              <span aria-hidden="true" className="size-10 shrink-0 sm:hidden" />
            )}
          </div>
        </div>
        <div
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-5 sm:py-4",
            hideHeaderTitleOnMobile ? "pt-1" : "pt-3.5",
            footer ? "pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))]"
          )}
        >
          {children}
        </div>
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
