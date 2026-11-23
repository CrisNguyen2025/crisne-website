"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/utils";

export function useAnimatedPresence(
  open: boolean,
  exitMs: number,
  onAfterClose?: () => void
) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);

  if (open && !shouldRender) {
    setShouldRender(true);
  }

  useEffect(() => {
    if (open) {
      let frame2 = 0;
      const frame1 = window.requestAnimationFrame(() => {
        frame2 = window.requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => {
        window.cancelAnimationFrame(frame1);
        window.cancelAnimationFrame(frame2);
      };
    }

    if (!shouldRender) return;

    const delay = prefersReducedMotion() ? 0 : exitMs;
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setShouldRender(false);
      onAfterClose?.();
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, shouldRender, exitMs, onAfterClose]);

  return {
    shouldRender,
    isVisible: open && isVisible,
  };
}
