'use client';

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';

/**
 * GlobalPageLoader
 *
 * Shows a full-screen loading overlay on initial page load and hard refresh (F5).
 * Automatically dismisses once React hydration is complete and the page has painted.
 *
 * Strategy:
 * - On server render: nothing (avoids SSR flicker)
 * - On client mount: overlay appears immediately, then fades out after hydration
 */
export function GlobalPageLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Give the browser one frame to paint, then start fade-out
    const timer = setTimeout(() => {
      setFading(true);
      // Remove from DOM after CSS transition completes
      const removeTimer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(removeTimer);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Logo mark */}
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          {/* Outer ring pulse */}
          <span className="absolute w-16 h-16 rounded-2xl bg-primary/10 animate-ping" />
          <div className="relative w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Layers className="w-7 h-7 text-primary" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight text-foreground">
            AI Architecture
          </span>
          <span className="text-xs text-muted-foreground">Loading workspace…</span>
        </div>

        {/* Progress bar */}
        <div className="w-40 h-0.5 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-[loading-bar_0.9s_ease-in-out_forwards]" />
        </div>
      </div>
    </div>
  );
}
