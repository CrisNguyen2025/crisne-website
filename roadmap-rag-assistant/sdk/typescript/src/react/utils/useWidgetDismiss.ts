import { useEffect } from "react";
import type { ChatbotViewMode } from "../types";

export interface UseWidgetDismissOptions {
  isOpen: boolean;
  isOptionsOpen: boolean;
  isSwitchMenuOpen: boolean;
  viewMode: ChatbotViewMode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrimRef: React.RefObject<HTMLDivElement | null>;
  optionsRef: React.RefObject<HTMLDivElement | null>;
  switchMenuRef: React.RefObject<HTMLDivElement | null>;
  closeDrawer: () => void;
  setIsOptionsOpen: (open: boolean) => void;
  setIsSwitchMenuOpen: (open: boolean) => void;
}

function isDesktopViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 48rem)").matches
      : window.innerWidth >= 768)
  );
}

/** Handles outside clicks and Escape dismissal; desktop sidebar ignores page clicks and global Escape. */
export function useWidgetDismiss({
  isOpen,
  isOptionsOpen,
  isSwitchMenuOpen,
  viewMode,
  containerRef,
  scrimRef,
  optionsRef,
  switchMenuRef,
  closeDrawer,
  setIsOptionsOpen,
  setIsSwitchMenuOpen,
}: UseWidgetDismissOptions) {
  useEffect(() => {
    if (!isOpen && !isOptionsOpen && !isSwitchMenuOpen) return;

    const handleClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (scrimRef.current?.contains(target)) return;

      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setIsOptionsOpen(false);
        setIsSwitchMenuOpen(false);
        if (viewMode === "floating" || !isDesktopViewport()) {
          closeDrawer();
        }
        return;
      }

      if (isOptionsOpen && optionsRef.current && !optionsRef.current.contains(target)) {
        setIsOptionsOpen(false);
      }
      if (
        isSwitchMenuOpen &&
        switchMenuRef.current &&
        !switchMenuRef.current.contains(target)
      ) {
        setIsSwitchMenuOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isOptionsOpen || isSwitchMenuOpen) {
        setIsOptionsOpen(false);
        setIsSwitchMenuOpen(false);
        return;
      }
      if (viewMode === "floating" || !isDesktopViewport()) {
        closeDrawer();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [
    isOpen,
    isOptionsOpen,
    isSwitchMenuOpen,
    viewMode,
    containerRef,
    scrimRef,
    optionsRef,
    switchMenuRef,
    closeDrawer,
    setIsOptionsOpen,
    setIsSwitchMenuOpen,
  ]);
}
