import { useCallback, useEffect, useState } from "react";
import type { ChatbotViewMode } from "../types";
import { loadViewMode, saveViewMode, viewModeKey } from "../storage";

export const SIDEBAR_WIDTH_REM = "25rem";

export function useSidebarLayout(
  baseUrl: string,
  defaultViewMode: ChatbotViewMode,
  isOpen: boolean
) {
  const storageKey = viewModeKey(baseUrl);
  const [viewMode, setViewModeState] = useState<ChatbotViewMode>(
    () => loadViewMode(storageKey) ?? defaultViewMode
  );

  const setViewMode = useCallback(
    (mode: ChatbotViewMode) => {
      setViewModeState(mode);
      saveViewMode(storageKey, mode);
    },
    [storageKey]
  );

  const isSidebarActive = isOpen && viewMode === "sidebar";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (isSidebarActive) {
      root.dataset.abotSidebar = "true";
      root.style.setProperty("--abot-sidebar-width", SIDEBAR_WIDTH_REM);
    } else {
      delete root.dataset.abotSidebar;
      root.style.removeProperty("--abot-sidebar-width");
    }
    window.dispatchEvent(new CustomEvent("abot:sidebar-change"));

    return () => {
      delete root.dataset.abotSidebar;
      root.style.removeProperty("--abot-sidebar-width");
      window.dispatchEvent(new CustomEvent("abot:sidebar-change"));
    };
  }, [isSidebarActive]);

  return { viewMode, setViewMode, isSidebarActive };
}
