"use client";

import { useEffect } from "react";

export function PwaServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Non-critical: ignore registration errors in unsupported/private browsers
    });
  }, []);

  return null;
}
