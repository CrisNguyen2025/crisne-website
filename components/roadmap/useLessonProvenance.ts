"use client";

import { useEffect, useState } from "react";
import type { LessonProvenanceResponse } from "@/lib/provenance/dto";
import * as roadmapService from "@/logic/roadmap/roadmapService";

const EMPTY: LessonProvenanceResponse = { provenances: [], orphans: [] };

// In-memory only (ADR-0015 rules out browser storage for Owner data): gone on reload or sign-out
const cache = new Map<string, LessonProvenanceResponse>();

/**
 * Provenance of a Lesson for the Owner (ADR-0017). Nothing is requested when `canWrite` is false, so
 * a Visitor never calls the API. Reloads when the content changes (markers may have moved) and on
 * `roadmap:updated`.
 */
export function useLessonProvenance(lessonId: string, canWrite: boolean, content: string | undefined) {
  const [data, setData] = useState<LessonProvenanceResponse>(() => cache.get(lessonId) ?? EMPTY);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    roadmapService
      .fetchLessonProvenance(lessonId)
      .then((next) => {
        cache.set(lessonId, next);
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
    const reload = () => setReloadCount((n) => n + 1);
    window.addEventListener("roadmap:updated", reload);
    return () => window.removeEventListener("roadmap:updated", reload);
  }, [canWrite]);

  return canWrite ? data : EMPTY;
}
