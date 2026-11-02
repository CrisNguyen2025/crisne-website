"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ConfirmPopoverProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** The trigger; clicking it opens the confirmation */
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

/** Asks "are you sure?" next to its trigger before running a destructive action. */
export function ConfirmPopover({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  children,
  align = "end",
  className,
}: ConfirmPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <div onClick={() => setIsOpen((v) => !v)} className="inline-flex">
        {children}
      </div>
      {isOpen && (
        <div
          role="alertdialog"
          className={cn(
            "absolute top-full z-50 mt-1.5 w-60 space-y-2 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          <p className="font-medium text-foreground">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onConfirm();
              }}
              className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white hover:bg-destructive/90"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
