"use client";

import { useSyncExternalStore } from "react";

/** Visual theme for the roadmap and news pages; light/dark is a separate setting (theme-provider) */
export type Design =
  | "default"
  | "perplexity"
  | "cursor"
  | "anthropic"
  | "linear"
  | "letters"
  | "stripe"
  | "discord"
  | "apple"
  | "railway"
  | "posthog";

const STORAGE_KEY = "design";
export const DEFAULT_DESIGN: Design = "apple";
/** Temporarily hides the theme switcher UI and locks default theme to Apple without deleting other themes */
export const ENABLE_DESIGN_SWITCHER = false;
export const DESIGNS: readonly Design[] = [
  "default",
  "perplexity",
  "cursor",
  "anthropic",
  "linear",
  "letters",
  "stripe",
  "discord",
  "apple",
  "railway",
  "posthog",
];

function isDesign(value: string | null | undefined): value is Design {
  return DESIGNS.includes(value as Design);
}

let currentDesign: Design | null = null;
const listeners = new Set<() => void>();

function readStoredDesign(): Design {
  if (!ENABLE_DESIGN_SWITCHER) return DEFAULT_DESIGN;
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isDesign(stored) ? stored : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

// app/styles/*-theme.css key off this attribute; "default" uses app/styles/roadmap-theme.css (Figma)
function applyDesign(design: Design) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (design === "default") {
    delete root.dataset.design;
  } else {
    root.dataset.design = design;
  }
}

function emitChange() {
  for (const listener of listeners) listener();
}

function handleStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  currentDesign = readStoredDesign();
  applyDesign(currentDesign);
  emitChange();
}

function getSnapshot(): Design {
  currentDesign ??= readStoredDesign();
  return currentDesign;
}

function getServerSnapshot(): Design {
  return DEFAULT_DESIGN;
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) globalThis.addEventListener("storage", handleStorage);
  listeners.add(listener);
  applyDesign(getSnapshot());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.removeEventListener("storage", handleStorage);
  };
}

export function setDesign(design: Design) {
  currentDesign = design;
  applyDesign(design);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, design);
  } catch {}
  emitChange();
}

export function useDesign(): Design {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
