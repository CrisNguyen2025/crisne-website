import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { WIDGET_THEME_VARS } from "../tokens";

export type AbotDialogSize = "sm" | "md" | "lg";

const DIALOG_CLOSE_DURATION_MS = 150;

/**
 * Responsive dialog bounds matched to each option's content density across phone,
 * tablet, and desktop viewports while leaving visible backdrop margin on every edge.
 */
const SIZE_CLASSES: Record<AbotDialogSize, string> = {
  sm: "max-w-[calc(100vw-1.5rem)] max-h-[85dvh] sm:max-w-[27rem] sm:max-h-[min(84dvh,42rem)] md:max-w-[30rem] lg:max-w-[32rem]",
  md: "max-w-[calc(100vw-1.5rem)] max-h-[82dvh] sm:max-w-[31rem] sm:max-h-[min(82dvh,42rem)] md:max-w-[35rem] lg:max-w-[38rem]",
  lg: "max-w-[calc(100vw-1.5rem)] max-h-[88dvh] sm:max-w-[35rem] sm:max-h-[min(86dvh,46rem)] md:max-w-[42rem] lg:max-w-[46rem]",
};

const AbotDialogCloseContext = createContext<(() => void) | null>(null);

export function useAbotDialogClose(fallbackClose: () => void): () => void {
  const closeFromDialog = useContext(AbotDialogCloseContext);
  return closeFromDialog ?? fallbackClose;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canScrollDirection(el: HTMLElement, deltaX: number, deltaY: number): boolean {
  const style = window.getComputedStyle(el);
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    const scrollableY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1;
    if (!scrollableY) return false;
    if (deltaY < 0) return el.scrollTop > 0;
    if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    return false;
  }
  const scrollableX =
    (style.overflowX === "auto" || style.overflowX === "scroll") &&
    el.scrollWidth > el.clientWidth + 1;
  if (!scrollableX) return false;
  if (deltaX < 0) return el.scrollLeft > 0;
  if (deltaX > 0) return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  return false;
}

function hasScrollableDialogAncestor(
  target: EventTarget | null,
  dialogEl: HTMLElement | null,
  deltaX: number,
  deltaY: number
): boolean {
  if (!(target instanceof Element) || !dialogEl || !dialogEl.contains(target)) {
    return false;
  }
  let current: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (current) {
    if (canScrollDirection(current, deltaX, deltaY)) {
      return true;
    }
    if (current === dialogEl) break;
    current = current.parentElement;
  }
  return false;
}

export interface AbotDialogProps {
  label: string;
  size?: AbotDialogSize;
  zIndex?: number;
  onClose: () => void;
  /** Return true when Escape was handled internally (e.g. cancelling inline delete confirm). */
  onEscape?: () => boolean;
  panelClassName?: string;
  children: React.ReactNode;
}

export function AbotDialog({
  label,
  size = "md",
  zIndex = 120,
  onClose,
  onEscape,
  panelClassName = "",
  children,
}: AbotDialogProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onCloseRef.current();
    }, DIALOG_CLOSE_DURATION_MS);
  }, [isClosing]);

  // Capture Escape first so only this modal closes, leaving the Abot chat panel open.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (onEscapeRef.current?.()) {
        return;
      }
      requestClose();
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [requestClose]);

  // Prevent wheel/touch scrolling on the backdrop from moving the host page underneath.
  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    const onWheel = (event: WheelEvent) => {
      if (!hasScrollableDialogAncestor(event.target, dialogRef.current, event.deltaX, event.deltaY)) {
        event.preventDefault();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      lastTouchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !lastTouchRef.current) return;
      const deltaX = lastTouchRef.current.x - touch.clientX;
      const deltaY = lastTouchRef.current.y - touch.clientY;
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      if (!hasScrollableDialogAncestor(event.target, dialogRef.current, deltaX, deltaY)) {
        if (event.cancelable) event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      lastTouchRef.current = null;
    };

    rootEl.addEventListener("wheel", onWheel, { passive: false });
    rootEl.addEventListener("touchstart", onTouchStart, { passive: true });
    rootEl.addEventListener("touchmove", onTouchMove, { passive: false });
    rootEl.addEventListener("touchend", onTouchEnd, { passive: true });
    rootEl.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      rootEl.removeEventListener("wheel", onWheel);
      rootEl.removeEventListener("touchstart", onTouchStart);
      rootEl.removeEventListener("touchmove", onTouchMove);
      rootEl.removeEventListener("touchend", onTouchEnd);
      rootEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const content = (
    <AbotDialogCloseContext.Provider value={requestClose}>
      <div
        ref={rootRef}
        data-abot-modal-root=""
        style={{ ...WIDGET_THEME_VARS, zIndex }}
        onClick={requestClose}
        className={`fixed inset-0 flex items-center justify-center p-3 font-sans overscroll-none sm:p-5 md:p-6 ${
          isClosing ? "pointer-events-none" : ""
        }`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 ease-out motion-reduce:transition-none ${
            isClosing ? "opacity-0" : "animate-in fade-in duration-150 opacity-100"
          }`}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={`relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_20px_50px_rgba(31,30,28,0.18),0_4px_16px_rgba(31,30,28,0.08)] transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none ${SIZE_CLASSES[size]} ${
            isClosing
              ? "scale-95 opacity-0"
              : "scale-100 opacity-100 animate-in fade-in zoom-in-95 duration-200"
          } ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    </AbotDialogCloseContext.Provider>
  );

  const canPortal = typeof document !== "undefined" && Boolean(document.body);
  return canPortal ? createPortal(content, document.body) : content;
}
