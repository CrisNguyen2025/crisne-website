"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { useSwipeDrawer } from "@/hooks/use-swipe-drawer";
import { useMounted, useOverlay } from "./dialog";

type SheetSide = "right" | "left" | "bottom";

const SHEET_EXIT_MS = 190;

const SIDE_POSITION_CLASSES: Record<SheetSide, string> = {
  right: "inset-y-0 right-0 h-full w-full max-w-xl border-l",
  left: "inset-y-0 left-0 h-full w-full max-w-sm border-r",
  bottom:
    "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-3xl border-t border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))]",
};

const SIDE_CLOSED_TRANSFORM: Record<SheetSide, string> = {
  right: "translate-x-full",
  left: "-translate-x-full",
  bottom: "translate-y-full",
};

interface SheetProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  side?: SheetSide;
  children: ReactNode;
  className?: string;
  label: string;
  /** Touch: drag the panel back toward its edge to close (left/right sides only). */
  swipeToClose?: boolean;
}

export function Sheet({
  open,
  onClose,
  onAfterClose,
  side = "right",
  children,
  className,
  label,
  swipeToClose = false,
}: SheetProps) {
  const isMounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  if (open && !shouldRender) {
    setShouldRender(true);
  }
  if (!open && isVisible) {
    setIsVisible(false);
  }

  useEffect(() => {
    if (open) {
      if (panelRef.current && !prefersReducedMotion()) {
        void panelRef.current.offsetWidth;
      }
      const frame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!shouldRender) return;

    const delay = prefersReducedMotion() ? 0 : SHEET_EXIT_MS;
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setShouldRender(false);
      onAfterClose?.();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [open, shouldRender, onAfterClose]);

  useOverlay(open, onClose);
  useSwipeDrawer(
    panelRef,
    scrimRef,
    swipeToClose && side !== "bottom" && open && isVisible,
    onClose,
    side === "left" ? "left" : "right"
  );

  if (!shouldRender || !isMounted) return null;

  const showPanel = open && isVisible;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[90]",
        !open && "pointer-events-none"
      )}
      aria-hidden={!open || undefined}
    >
      <div
        ref={scrimRef}
        className={cn(
          "absolute inset-0 bg-black/35 md:backdrop-blur-[0.125rem] transition-opacity ease-out motion-reduce:transition-none",
          showPanel ? "opacity-100 duration-[220ms]" : "opacity-0 duration-[170ms]"
        )}
        onClick={open ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-label={open ? label : undefined}
        className={cn(
          "absolute flex flex-col border-border bg-card text-card-foreground shadow-2xl will-change-transform [contain:layout_style] transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          SIDE_POSITION_CLASSES[side],
          showPanel
            ? "translate-x-0 translate-y-0 duration-[240ms]"
            : cn(SIDE_CLOSED_TRANSFORM[side], "duration-[190ms]"),
          className
        )}
      >
        {side === "bottom" && (
          <div className="flex w-full items-center justify-center pt-2.5 pb-1">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
