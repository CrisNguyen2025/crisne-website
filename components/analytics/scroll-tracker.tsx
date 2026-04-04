"use client";

import { useEffect } from "react";
import { trackScrollDepth } from "@/lib/analytics";

export function ScrollTracker() {
  useEffect(() => {
    let rafId: number | null = null;
    let lastScrollY = -1;

    const handleScroll = () => {
      // Use requestAnimationFrame for performance
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;

        // Only track if scroll position changed significantly
        const currentScrollY = window.scrollY;
        if (Math.abs(currentScrollY - lastScrollY) < 50) return;
        lastScrollY = currentScrollY;

        trackScrollDepth();
      });
    };

    // Throttled scroll listener
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return null;
}
