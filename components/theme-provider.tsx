"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME: Theme = "dark";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  return globalThis.window?.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  try {
    return (globalThis.localStorage?.getItem(STORAGE_KEY) as Theme) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : (theme as ResolvedTheme);
}

function applyTheme(resolved: ResolvedTheme) {
  const d = globalThis.document?.documentElement;
  if (!d) return;
  d.classList.remove("light", "dark");
  d.classList.add(resolved);
  d.style.colorScheme = resolved;
}

let listeners: Array<() => void> = [];
let currentTheme: Theme = DEFAULT_THEME;
let currentResolved: ResolvedTheme = "dark";
let cachedSnapshot: { theme: Theme; resolved: ResolvedTheme } = { theme: currentTheme, resolved: currentResolved };
const serverSnapshot = { theme: DEFAULT_THEME, resolved: "dark" as ResolvedTheme };

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function getSnapshot() {
  return cachedSnapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

function emitChange() {
  cachedSnapshot = { theme: currentTheme, resolved: currentResolved };
  for (const listener of listeners) {
    listener();
  }
}

function setThemeInternal(newTheme: Theme) {
  currentTheme = newTheme;
  currentResolved = resolveTheme(newTheme);
  applyTheme(currentResolved);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, newTheme);
  } catch {}
  emitChange();
}

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { theme, resolved } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    currentTheme = getStoredTheme();
    currentResolved = resolveTheme(currentTheme);
    applyTheme(currentResolved);
    emitChange();
  }, []);

  useEffect(() => {
    if (currentTheme !== "system") return;
    const mq = globalThis.matchMedia(MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      currentResolved = e.matches ? "dark" : "light";
      applyTheme(currentResolved);
      emitChange();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setThemeInternal(e.newValue as Theme);
      }
    };
    globalThis.addEventListener("storage", handler);
    return () => globalThis.removeEventListener("storage", handler);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeInternal(newTheme);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme: resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: DEFAULT_THEME,
      resolvedTheme: "dark" as ResolvedTheme,
      setTheme: () => {},
    };
  }
  return ctx;
}
