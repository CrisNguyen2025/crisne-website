"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { LucideIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  /** Asks inside the menu before onSelect runs (deletes) */
  confirm?: { title: string; description?: string; confirmLabel?: string };
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  icon?: ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
}

/** A "⋯" button with a small menu; a danger item can ask for confirmation in place. */
export function ActionMenu({ items, label = "More actions", icon, align = "end", triggerClassName }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirming, setConfirming] = useState<ActionMenuItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closing also drops a pending confirmation, so the menu opens on its items next time
  const close = () => {
    setIsOpen(false);
    setConfirming(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  const run = (item: ActionMenuItem) => {
    if (item.confirm && confirming !== item) {
      setConfirming(item);
      return;
    }
    close();
    item.onSelect();
  };

  return (
    <div ref={rootRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={label}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cn(
          "relative flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 touch-manipulation after:absolute after:-inset-2.5 after:content-['']",
          isOpen && "bg-muted text-foreground",
          triggerClassName
        )}
      >
        {icon ?? <MoreHorizontal className="size-4" />}
      </button>

      {isOpen && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-1 w-52 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {confirming ? (
            <div className="space-y-2 p-2">
              <p className="font-medium text-foreground">{confirming.confirm!.title}</p>
              {confirming.confirm!.description && (
                <p className="text-xs text-muted-foreground">{confirming.confirm!.description}</p>
              )}
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => run(confirming)}
                  className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white hover:bg-destructive/90"
                >
                  {confirming.confirm!.confirmLabel ?? "Delete"}
                </button>
              </div>
            </div>
          ) : (
            items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => run(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors sm:py-1.5",
                    item.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted"
                  )}
                >
                  {Icon && <Icon className={cn("size-4", !item.danger && "text-muted-foreground")} />}
                  <span>{item.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
