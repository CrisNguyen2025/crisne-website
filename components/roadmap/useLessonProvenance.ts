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

/**
 * Provenance of a Lesson for the Owner (ADR-0017). Nothing is requested when `canWrite` is false, so
 * a Visitor never calls the API. Reloads when the content changes (markers may have moved) and on
 * `roadmap:updated`.
 */
export function useLessonProvenance(lessonId: string, canWrite: boolean, content: string | undefined) {
  const [data, setData] = useState<LessonProvenanceResponse>(() => {
    const cached = cache.get(lessonId);
    const currentVersion = getRoadmapMutationVersion();
    return cached && cached.version === currentVersion ? cached.data : EMPTY;
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
        if (!cancelled) setData(next);
      })
      // Sources are extra information: the Lesson still reads fine without them
      .catch(() => {});
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

  return canWrite ? data : EMPTY;
}
