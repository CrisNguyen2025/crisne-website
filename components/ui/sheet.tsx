"use client";

import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useMounted, useOverlay } from "./dialog";

type SheetSide = "right" | "left" | "bottom";

const SIDE_CLASSES: Record<SheetSide, string> = {
  right: "inset-y-0 right-0 h-full w-full max-w-xl border-l slide-in-from-right",
  left: "inset-y-0 left-0 h-full w-full max-w-sm border-r slide-in-from-left",
  bottom:
    "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-3xl border-t border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))] slide-in-from-bottom",
};

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  children: ReactNode;
  className?: string;
  /** Accessible name of the panel */
  label: string;
}

/** A panel sliding in from an edge, over a dimmed page. */
export function Sheet({ open, onClose, side = "right", children, className, label }: SheetProps) {
  const isMounted = useMounted();
  useOverlay(open, onClose);
  if (!open || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "absolute flex flex-col border-border bg-card text-card-foreground shadow-xl animate-in duration-200",
          SIDE_CLASSES[side],
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
