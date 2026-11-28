"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

const LEFT_SIDEBAR_WIDTH_REM = 18.75;
const MAIN_MIN_WIDTH_FOR_RAIL_REM = 61.25;
const MAIN_MIN_WIDTH_FOR_RAIL_PX = 980;
const DEFAULT_ABOT_WIDTH_REM = 25;
const COLLAPSE_LEFT_NAV_BASE_MAX_PX = 1365;

function getRootFontSize(): number {
  if (typeof document === "undefined") return 16;
  const parsed = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

function parseAbotWidthRem(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_ABOT_WIDTH_REM;
  if (trimmed.endsWith("rem")) {
    const val = parseFloat(trimmed);
    return Number.isFinite(val) && val > 0 ? val : DEFAULT_ABOT_WIDTH_REM;
  }
  if (trimmed.endsWith("px")) {
    const val = parseFloat(trimmed);
    return Number.isFinite(val) && val > 0
      ? val / getRootFontSize()
      : DEFAULT_ABOT_WIDTH_REM;
  }
  const num = parseFloat(trimmed);
  return Number.isFinite(num) && num > 0 ? num : DEFAULT_ABOT_WIDTH_REM;
}

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

function getAbotSidebarStateSnapshot(): string {
  if (typeof document === "undefined") return "0:25";
  const active = document.documentElement.dataset.abotSidebar === "true";
  const rawWidth = document.documentElement.style.getPropertyValue(
    "--abot-sidebar-width"
  );
  const widthRem = parseAbotWidthRem(rawWidth);
  return `${active ? "1" : "0"}:${widthRem}`;
}

function useIsMainTooNarrow(): boolean | null {
  const [isTooNarrow, setIsTooNarrow] = useState<boolean | null>(null);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const mainEl = document.getElementById("main-content");
    if (!mainEl) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      setIsTooNarrow((prev) => {
        let next: boolean | null = null;
        if (width > 0) {
          if (prev === null) {
            next = width < MAIN_MIN_WIDTH_FOR_RAIL_PX;
          } else if (prev) {
            next = width < MAIN_MIN_WIDTH_FOR_RAIL_PX + 16;
          } else {
            next = width < MAIN_MIN_WIDTH_FOR_RAIL_PX - 16;
          }
        }
        return prev === next ? prev : next;
      });
    });
    observer.observe(mainEl);

    return () => {
      observer.disconnect();
    };
  }, []);

  return isTooNarrow;
}

export function useCollapseRightRail(): boolean {
  const snapshot = useSyncExternalStore(
    subscribeAbotSidebar,
    getAbotSidebarStateSnapshot,
    () => "0:25"
  );
  const isAbotSidebarActive = snapshot.startsWith("1:");
  const abotWidthRem = Number(snapshot.slice(2)) || DEFAULT_ABOT_WIDTH_REM;

  const wideQuery = `(min-width: ${
    LEFT_SIDEBAR_WIDTH_REM + MAIN_MIN_WIDTH_FOR_RAIL_REM + abotWidthRem
  }rem)`;
  const isWideByMediaQuery = useMediaQuery(wideQuery);
  const isMainTooNarrow = useIsMainTooNarrow();

  if (!isAbotSidebarActive) return false;
  if (isMainTooNarrow !== null) {
    return isMainTooNarrow;
  }
  return !isWideByMediaQuery;
}

export function useIsAbotSidebarOpen(): boolean {
  const snapshot = useSyncExternalStore(
    subscribeAbotSidebar,
    getAbotSidebarStateSnapshot,
    () => "0:25"
  );
  return snapshot.startsWith("1:");
}

export function useCollapseLeftNav(): boolean {
  const snapshot = useSyncExternalStore(
    subscribeAbotSidebar,
    getAbotSidebarStateSnapshot,
    () => "0:25"
  );
  const isAbotSidebarActive = snapshot.startsWith("1:");
  const abotWidthRem = Number(snapshot.slice(2)) || DEFAULT_ABOT_WIDTH_REM;
  const extraAbotPx = Math.max(0, (abotWidthRem - DEFAULT_ABOT_WIDTH_REM) * 16);
  const maxWidthPx = Math.round(COLLAPSE_LEFT_NAV_BASE_MAX_PX + extraAbotPx);
  const isTooNarrow = useMediaQuery(`(max-width: ${maxWidthPx}px)`);

  return isAbotSidebarActive && isTooNarrow;
}
