"use client";

import { useEffect } from "react";
import { useTrackSectionView } from "@/hooks/use-track-section";
import { trackSectionClick } from "@/lib/analytics";

interface TrackedSectionProps {
  readonly sectionId: string;
  readonly children: React.ReactNode;
}

export function TrackedSection({ sectionId, children }: TrackedSectionProps) {
  const ref = useTrackSectionView(sectionId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = () => trackSectionClick(sectionId);
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [sectionId, ref]);

  return <div ref={ref as React.RefObject<HTMLDivElement>}>{children}</div>;
}
