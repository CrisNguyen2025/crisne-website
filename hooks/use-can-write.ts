"use client";

import { useEffect, useState } from "react";
import { ROADMAP_ASSISTANT_BASE_URL } from "@/logic/roadmap/roadmapAssistantService";

let cachedCanWrite: boolean | null = null;
let inflightCanWrite: Promise<boolean> | null = null;

function resolveCanWrite(): Promise<boolean> {
  if (cachedCanWrite !== null) {
    return Promise.resolve(cachedCanWrite);
  }
  if (!inflightCanWrite) {
    inflightCanWrite = fetch(`${ROADMAP_ASSISTANT_BASE_URL}/me`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : { canWrite: false }))
      .then((data: { canWrite?: unknown }) => {
        const value = data.canWrite === true;
        cachedCanWrite = value;
        return value;
      })
      .catch(() => {
        cachedCanWrite = false;
        return false;
      })
      .finally(() => {
        inflightCanWrite = null;
      });
  }
  return inflightCanWrite;
}

/**
 * Whether this reader may change roadmap data. Only hides write controls: every write is still
 * checked on the server. Starts false (fail closed); cached in-memory across navigations.
 */
export function useCanWrite(): boolean {
  const [canWrite, setCanWrite] = useState<boolean>(() => cachedCanWrite ?? false);

  useEffect(() => {
    if (cachedCanWrite !== null) {
      return;
    }
    let active = true;
    resolveCanWrite().then((value) => {
      if (active) {
        setCanWrite(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return canWrite;
}
