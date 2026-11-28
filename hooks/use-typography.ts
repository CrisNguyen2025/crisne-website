"use client";

import { useSyncExternalStore } from "react";

/** Type scale for the roadmap and news pages; separate from the color theme (use-design) and light/dark */
export type Typography = "default" | "docs";

const STORAGE_KEY = "typography";
const DEFAULT_TYPOGRAPHY: Typography = "default";
export const TYPOGRAPHIES: readonly Typography[] = ["default", "docs"];

function isTypography(value: string | null | undefined): value is Typography {
  return TYPOGRAPHIES.includes(value as Typography);
}

let currentTypography: Typography | null = null;
const listeners = new Set<() => void>();

function readStoredTypography(): Typography {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isTypography(stored) ? stored : DEFAULT_TYPOGRAPHY;
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

// app/styles/docs-typography.css keys off this attribute; "default" keeps the scale of the color theme
function applyTypography(typography: Typography) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (typography === DEFAULT_TYPOGRAPHY) {
    delete root.dataset.typography;
  } else {
    root.dataset.typography = typography;
  }
}

function emitChange() {
  for (const listener of listeners) listener();
}

function handleStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  currentTypography = readStoredTypography();
  applyTypography(currentTypography);
  emitChange();
}

function getSnapshot(): Typography {
  currentTypography ??= readStoredTypography();
  return currentTypography;
}

function getServerSnapshot(): Typography {
  return DEFAULT_TYPOGRAPHY;
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) globalThis.addEventListener("storage", handleStorage);
  listeners.add(listener);
  applyTypography(getSnapshot());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.removeEventListener("storage", handleStorage);
  };
}

export function setTypography(typography: Typography) {
  currentTypography = typography;
  applyTypography(typography);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, typography);
  } catch {}
  emitChange();
}

export function useTypography(): Typography {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
