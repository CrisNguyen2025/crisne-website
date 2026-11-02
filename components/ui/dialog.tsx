"use client";

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Close on Escape and lock page scroll while an overlay is open. */
export function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
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
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
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
