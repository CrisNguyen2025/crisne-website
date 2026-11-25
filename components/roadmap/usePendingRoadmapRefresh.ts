"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { consumeRoadmapRefreshPending } from "@/lib/roadmap/pending-write";

export function usePendingRoadmapRefresh(routeKey: string): void {
  const router = useRouter();

  useEffect(() => {
    if (consumeRoadmapRefreshPending(routeKey)) {
      router.refresh();
    }
  }, [routeKey, router]);
}
