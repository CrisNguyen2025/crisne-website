"use client";

import { useEffect, type RefObject } from "react";

export interface UseQuickBarShortcutOptions {
  inputRef?: RefObject<HTMLInputElement | null>;
  onTrigger?: () => void;
  isEnabled?: boolean;
}

export function useQuickBarShortcut({
  inputRef,
  onTrigger,
  isEnabled = true,
}: UseQuickBarShortcutOptions) {
  useEffect(() => {
    if (typeof window === "undefined" || !isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Guard against modifier keys (Cmd+A, Ctrl+A, Alt+A)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 2. Guard against mobile screen size (< 768px)
      if (window.innerWidth < 768) return;

      // 3. Guard against active form controls or editable elements
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // 4. Match key 'a' or 'A'
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (inputRef?.current) {
          inputRef.current.focus();
        }
        onTrigger?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputRef, onTrigger, isEnabled]);
}
