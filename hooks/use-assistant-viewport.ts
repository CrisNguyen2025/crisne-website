"use client";

import { useSyncExternalStore, useMemo } from "react";

export interface AssistantViewportState {
  keyboardOffset: number;
  viewportHeight: number | null;
  isKeyboardOpen: boolean;
  composerStyle: React.CSSProperties;
  quickBarStyle: React.CSSProperties;
}

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeViewport(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", callback);
    vv.addEventListener("scroll", callback);
  }
  window.addEventListener("resize", callback);
  return () => {
    if (vv) {
      vv.removeEventListener("resize", callback);
      vv.removeEventListener("scroll", callback);
    }
    window.removeEventListener("resize", callback);
  };
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(MOBILE_QUERY).matches;
  }
  return window.innerWidth < 768;
}

function getKeyboardOffset(): number {
  if (!isMobileViewport()) return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - (vv.height + (vv.offsetTop || 0)));
}

function getViewportHeight(): number | null {
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  return vv ? vv.height : null;
}

export function useAssistantViewport(enabled: boolean = true): AssistantViewportState {
  const keyboardOffset = useSyncExternalStore(
    subscribeViewport,
    enabled ? getKeyboardOffset : () => 0,
    () => 0
  );

  const viewportHeight = useSyncExternalStore(
    subscribeViewport,
    enabled ? getViewportHeight : () => null,
    () => null
  );

  const isKeyboardOpen = keyboardOffset > 0;

  const composerStyle = useMemo<React.CSSProperties>(() => {
    return isKeyboardOpen ? { paddingBottom: `${keyboardOffset}px` } : {};
  }, [isKeyboardOpen, keyboardOffset]);

  const quickBarStyle = useMemo<React.CSSProperties>(() => {
    return isKeyboardOpen ? { transform: `translate(-50%, -${keyboardOffset}px)` } : {};
  }, [isKeyboardOpen, keyboardOffset]);

  return {
    keyboardOffset,
    viewportHeight,
    isKeyboardOpen,
    composerStyle,
    quickBarStyle,
  };
}
