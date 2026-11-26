"use client";

import { useSyncExternalStore } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

export const WIDE_WITH_SIDEBAR_QUERY = "(min-width: 105rem)";

function subscribeAbotSidebar(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("abot:sidebar-change", callback);
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(callback)
      : null;
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-abot-sidebar"],
  });
  return () => {
    window.removeEventListener("abot:sidebar-change", callback);
    observer?.disconnect();
  };
}

function getAbotSidebarSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.abotSidebar === "true";
}

export function useAbotSidebarActive(): boolean {
  return useSyncExternalStore(
    subscribeAbotSidebar,
    getAbotSidebarSnapshot,
    () => false
  );
}

export function useCollapseRightRail(): boolean {
  const isAbotSidebarActive = useAbotSidebarActive();
  const isWideWithSidebar = useMediaQuery(WIDE_WITH_SIDEBAR_QUERY);
  return isAbotSidebarActive && !isWideWithSidebar;
}
