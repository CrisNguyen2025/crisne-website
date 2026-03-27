"use client";

import { useEffect, useRef } from "react";
import { trackSectionView } from "@/lib/gtag";

export function useTrackSectionView(sectionId: string) {
  const tracked = useRef(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackSectionView(sectionId);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [sectionId]);

  return ref;
}
