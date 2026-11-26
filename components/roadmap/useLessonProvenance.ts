"use client";

import { useEffect, useState } from "react";
import type { LessonProvenanceResponse } from "@/lib/provenance/dto";
import { getRoadmapMutationVersion } from "@/lib/roadmap/pending-write";
import * as roadmapService from "@/logic/roadmap/roadmapService";

const EMPTY: LessonProvenanceResponse = { provenances: [], orphans: [] };

// In-memory only (ADR-0015 rules out browser storage for Owner data): gone on reload or sign-out
const cache = new Map<
  string,
  { version: number; data: LessonProvenanceResponse }
>();
let cacheVersion = 0;

function readCachedProvenance(lessonId: string): LessonProvenanceResponse | null {
  const cached = cache.get(lessonId);
  const currentVersion = getRoadmapMutationVersion();
  return cached && cached.version === currentVersion ? cached.data : null;
}

/**
 * Provenance of a Lesson for the Owner (ADR-0017). Nothing is requested when `canWrite` is false, so
 * a Visitor never calls the API. Reloads when the content changes (markers may have moved) and on
 * `roadmap:updated`.
 */
export function useLessonProvenance(
  lessonId: string,
  canWrite: boolean,
  content: string | undefined
): LessonProvenanceResponse & { isLoading: boolean } {
  const [resolved, setResolved] = useState<{
    lessonId: string;
    data: LessonProvenanceResponse;
  } | null>(() => {
    const initial = readCachedProvenance(lessonId);
    return initial ? { lessonId, data: initial } : null;
  });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    const requestVersion = getRoadmapMutationVersion();
    if (cacheVersion !== requestVersion) {
      cache.clear();
      cacheVersion = requestVersion;
    }
    roadmapService
      .fetchLessonProvenance(lessonId)
      .then((next) => {
        const latestVersion = getRoadmapMutationVersion();
        cache.set(lessonId, { version: latestVersion, data: next });
        if (!cancelled) setResolved({ lessonId, data: next });
      })
      // Sources are extra information: the Lesson still reads fine without them
      .catch(() => {
        if (!cancelled) {
          setResolved((prev) =>
            prev?.lessonId === lessonId ? prev : { lessonId, data: EMPTY }
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, canWrite, content, reloadCount]);

  useEffect(() => {
    if (!canWrite) return;
    const reload = () => {
      cache.clear();
      setReloadCount((n) => n + 1);
    };
    window.addEventListener("roadmap:updated", reload);
    return () => window.removeEventListener("roadmap:updated", reload);
  }, [canWrite]);

  if (!canWrite) {
    return { ...EMPTY, isLoading: false };
  }

  const hasResolvedCurrent = resolved?.lessonId === lessonId;
  const cached = hasResolvedCurrent ? null : readCachedProvenance(lessonId);
  const activeData = hasResolvedCurrent
    ? resolved.data
    : (cached ?? EMPTY);
  const isLoading = !hasResolvedCurrent && cached === null;

  return { ...activeData, isLoading };
}
