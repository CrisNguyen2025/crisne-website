"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  patchCachedOwnerStatus,
  setCachedOwnerStatuses,
} from "@/lib/roadmap/owner-status-cache";
import { topicPath } from "@/lib/roadmap/paths";
import {
  markRoadmapRefreshPending,
  recordPendingDeletion,
} from "@/lib/roadmap/pending-write";
import type { LessonStatus } from "@/lib/roadmap/status";
import type { ChecklistItem } from "@/lib/roadmap/types";
import * as roadmapService from "@/logic/roadmap/roadmapService";

export interface RoadmapUpdatedEventDetail {
  skipRefresh?: boolean;
  toolName?: string;
  result?: string;
  deletedLessonId?: string;
  deletedTopicSlug?: string;
}

const DELETE_TOOL_NAMES = new Set([
  "delete_item",
  "delete_topic",
  "delete_roadmap",
]);

function toOwnerStatusMap(
  items: Pick<ChecklistItem, "id" | "status">[]
): Record<string, LessonStatus> {
  const next: Record<string, LessonStatus> = {};
  for (const it of items) {
    if (it.status) next[it.id] = it.status;
  }
  return next;
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 404
  );
}

export function useTopicOwnerStatuses(
  topicSlug: string,
  canWrite: boolean,
  currentLessonId?: string
) {
  const router = useRouter();
  const [ownerStatusById, setOwnerStatusById] = useState<
    Record<string, LessonStatus>
  >(() => getCachedOwnerStatuses(topicSlug) ?? {});

  const loadOwnerStatuses = useCallback(() => {
    if (!canWrite) return;
    roadmapService
      .fetchRoadmapBySlug(topicSlug, { mode: "outline" })
      .then((data) => {
        const next = toOwnerStatusMap(data.items);
        setCachedOwnerStatuses(topicSlug, next);
        setOwnerStatusById(next);
      })
      .catch(() => {});
  }, [canWrite, topicSlug]);

  useEffect(() => {
    loadOwnerStatuses();
  }, [loadOwnerStatuses]);

  useEffect(() => {
    let isDisposed = false;
    const handleUpdate = (event: Event) => {
      invalidateCachedOwnerStatuses(topicSlug);
      const detail = (
        event as CustomEvent<RoadmapUpdatedEventDetail | undefined>
      ).detail;
      recordPendingDeletion(detail);
      if (detail?.skipRefresh) {
        return;
      }
      if (detail?.deletedTopicSlug === topicSlug) {
        markRoadmapRefreshPending({ deletedTopicSlug: topicSlug });
        router.push("/");
        return;
      }
      if (currentLessonId && detail?.deletedLessonId === currentLessonId) {
        markRoadmapRefreshPending({ deletedLessonId: currentLessonId });
        router.push(topicPath(topicSlug));
        return;
      }
      if (detail?.toolName && DELETE_TOOL_NAMES.has(detail.toolName)) {
        roadmapService
          .fetchRoadmapBySlug(topicSlug, { mode: "outline" })
          .then((data) => {
            if (isDisposed) return;
            if (canWrite) {
              const next = toOwnerStatusMap(data.items);
              setCachedOwnerStatuses(topicSlug, next);
              setOwnerStatusById(next);
            }
            if (
              currentLessonId &&
              !data.items.some((it) => it.id === currentLessonId)
            ) {
              markRoadmapRefreshPending({ deletedLessonId: currentLessonId });
              router.push(topicPath(topicSlug));
              return;
            }
            router.refresh();
          })
          .catch((err) => {
            if (isDisposed) return;
            if (isNotFoundError(err)) {
              markRoadmapRefreshPending({ deletedTopicSlug: topicSlug });
              router.push("/");
              return;
            }
            router.refresh();
          });
        return;
      }
      router.refresh();
      loadOwnerStatuses();
    };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => {
      isDisposed = true;
      window.removeEventListener("roadmap:updated", handleUpdate);
    };
  }, [router, loadOwnerStatuses, topicSlug, canWrite, currentLessonId]);

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
