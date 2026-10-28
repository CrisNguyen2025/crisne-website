"use client";

import { useEffect, useState } from "react";
import { ROADMAP_ASSISTANT_BASE_URL } from "@/logic/roadmap/roadmapAssistantService";

/**
 * Whether this reader may change roadmap data. Only hides write controls: every write is still
 * checked on the server. Starts false (fail closed); the owner's status arrives a moment later.
 */
export function useCanWrite(): boolean {
  const [canWrite, setCanWrite] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${ROADMAP_ASSISTANT_BASE_URL}/me`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { canWrite: false }))
      .then((data: { canWrite?: unknown }) =>
        setCanWrite(data.canWrite === true)
      )
      .catch(() => setCanWrite(false));
    return () => controller.abort();
  }, []);
  return canWrite;
}
