"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted, useOverlay } from "@/components/ui/dialog";
import { useSwipeDrawer } from "@/hooks/use-swipe-drawer";
import { cn, prefersReducedMotion } from "@/lib/utils";

const DRAWER_EXIT_MS = 200;

interface MobileNewsDrawerProps<T> {
  open: boolean;
  item: T | null;
  label: (item: T) => string;
  onClose: () => void;
  children: (item: T) => React.ReactNode;
}

/** Swipe-right dismissible drawer hosting a news post on narrow viewports. */
export function MobileNewsDrawer<T>({
  open,
  item,
  label,
  onClose,
  children,
}: MobileNewsDrawerProps<T>) {
  const isMounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [renderedItem, setRenderedItem] = useState<T | null>(open ? item : null);
  const [isVisible, setIsVisible] = useState(false);

  const isActive = open && item !== null;
  const hasRenderedItem = renderedItem !== null;

  if (isActive && renderedItem !== item) {
    setRenderedItem(item);
  }
  if (!isActive && isVisible) {
    setIsVisible(false);
  }

  useOverlay(isActive, onClose);
  useSwipeDrawer(panelRef, scrimRef, isActive, onClose);

  useEffect(() => {
    if (isActive) {
      if (prefersReducedMotion()) {
        const frame = window.requestAnimationFrame(() => {
          setIsVisible(true);
        });
        return () => window.cancelAnimationFrame(frame);
      }
      // Commit the initial off-screen transform before flipping so the transition starts on frame 1
      if (panelRef.current) {
        void panelRef.current.offsetWidth;
      }
      const frame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    if (!hasRenderedItem) return;

    const delay = prefersReducedMotion() ? 0 : DRAWER_EXIT_MS;
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setRenderedItem(null);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasRenderedItem, isActive]);

  // Keep the inner reader tree memoized across the `isVisible` flip so opening/closing
  // animations never pay a synchronous React reconciliation cost on frame 1
  const drawerContent = useMemo(
    () => (renderedItem ? children(renderedItem) : null),
    [children, renderedItem]
  );

  if (!isMounted || !renderedItem) return null;

  const showPanel = isActive && isVisible;

  return createPortal(
    <div
      className={cn(
        // Portaled to <body>, outside the News layout's `roadmap-theme`; re-apply it for editorial tokens
        "roadmap-theme fixed inset-0 z-50 xl:hidden",
        !isActive && "pointer-events-none"
      )}
      aria-hidden={!isActive || undefined}
    >
      <div
        ref={scrimRef}
        className={cn(
          "absolute inset-0 bg-black/40 md:backdrop-blur-[0.125rem] transition-opacity ease-out motion-reduce:transition-none",
          showPanel ? "opacity-100 duration-[220ms]" : "opacity-0 duration-[180ms]"
        )}
        onClick={isActive ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={isActive ? "dialog" : undefined}
        aria-modal={isActive ? "true" : undefined}
        aria-label={isActive ? label(renderedItem) : undefined}
        className={cn(
          "absolute inset-y-0 right-0 flex h-full w-full touch-pan-y flex-col bg-card text-card-foreground shadow-2xl will-change-transform [contain:layout_style] transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:max-w-3xl md:border-l md:border-border",
          showPanel ? "translate-x-0 duration-[240ms]" : "translate-x-full duration-[200ms]"
        )}
      >
        {drawerContent}
      </div>
    </div>,
    document.body
  );
}
