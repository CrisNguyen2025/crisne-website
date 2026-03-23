"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "portfolio_unlocked";

export function useUnlock() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIsUnlocked(true);
    }
    setIsHydrated(true);
  }, []);

  const unlock = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsUnlocked(true);
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsUnlocked(false);
  };

  return { isUnlocked, isHydrated, unlock, reset };
}
