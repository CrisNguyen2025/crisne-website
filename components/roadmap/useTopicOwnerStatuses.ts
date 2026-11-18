"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  patchCachedOwnerStatus,
  setCachedOwnerStatuses,
} from "@/lib/roadmap/owner-status-cache";
import type { LessonStatus } from "@/lib/roadmap/status";
import * as roadmapService from "@/logic/roadmap/roadmapService";

export interface RoadmapUpdatedEventDetail {
  skipRefresh?: boolean;
  toolName?: string;
  result?: string;
}

export function useTopicOwnerStatuses(topicSlug: string, canWrite: boolean) {
  const router = useRouter();
  const [ownerStatusById, setOwnerStatusById] = useState<
    Record<string, LessonStatus>
  >(() => getCachedOwnerStatuses(topicSlug) ?? {});

  const loadOwnerStatuses = useCallback(() => {
    if (!canWrite) return;
    roadmapService
      .fetchRoadmapBySlug(topicSlug, { mode: "outline" })
      .then((data) => {
        const next: Record<string, LessonStatus> = {};
        for (const it of data.items) {
          if (it.status) next[it.id] = it.status;
        }
        setCachedOwnerStatuses(topicSlug, next);
        setOwnerStatusById(next);
      })
      .catch(() => {});
  }, [canWrite, topicSlug]);

  useEffect(() => {
    loadOwnerStatuses();
  }, [loadOwnerStatuses]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      invalidateCachedOwnerStatuses(topicSlug);
      const detail = (
        event as CustomEvent<RoadmapUpdatedEventDetail | undefined>
      ).detail;
      if (detail?.skipRefresh) {
        return;
      }
      router.refresh();
      loadOwnerStatuses();
    };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => window.removeEventListener("roadmap:updated", handleUpdate);
  }, [router, loadOwnerStatuses, topicSlug]);

  const setOptimisticStatus = useCallback(
    (lessonId: string, status: LessonStatus) => {
      setOwnerStatusById((prev) => ({ ...prev, [lessonId]: status }));
      patchCachedOwnerStatus(topicSlug, lessonId, status);
    },
    [topicSlug]
  );

  const invalidate = useCallback(() => {
    invalidateCachedOwnerStatuses(topicSlug);
  }, [topicSlug]);

  return {
    ownerStatusById,
    setOptimisticStatus,
    invalidateStatuses: invalidate,
  };
}
