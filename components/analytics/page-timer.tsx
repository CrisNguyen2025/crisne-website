"use client";

import { useEffect } from "react";
import { startPageTimer, trackTimeOnPage } from "@/lib/analytics";

export function PageTimer() {
  useEffect(() => {
    // Start timing when component mounts
    startPageTimer();

    // Track time on page when user leaves
    const handleBeforeUnload = () => {
      trackTimeOnPage();
    };

    // Also track on visibility change (tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        trackTimeOnPage();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Track time when component unmounts (navigation)
      trackTimeOnPage();
    };
  }, []);

  return null;
}
