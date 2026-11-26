import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoadmapChatClient } from '../client';
import type {
  CreateOwnerMemoryInput,
  OwnerMemoryItem,
  UpdateOwnerMemoryInput,
} from '../types';

export const OWNER_MEMORIES_UPDATED_EVENT = 'abot:memories-updated';
const ADAPTIVE_REFRESH_DELAYS_MS = [1200, 2800, 5000] as const;

function notifyMemoriesUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OWNER_MEMORIES_UPDATED_EVENT));
  }
}

export interface UseOwnerMemoriesReturn {
  activeItems: OwnerMemoryItem[];
  pendingItems: OwnerMemoryItem[];
  archivedItems: OwnerMemoryItem[];
  isLoading: boolean;
  isLoadingArchived: boolean;
  isSaving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadArchived: () => Promise<void>;
  create: (input: CreateOwnerMemoryInput) => Promise<boolean>;
  update: (id: string, input: UpdateOwnerMemoryInput) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

export function useOwnerMemories(baseUrl: string): UseOwnerMemoriesReturn {
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const [activeItems, setActiveItems] = useState<OwnerMemoryItem[]>([]);
  const [pendingItems, setPendingItems] = useState<OwnerMemoryItem[]>([]);
  const [archivedItems, setArchivedItems] = useState<OwnerMemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivedLoadedRef = useRef(false);

  const loadArchived = useCallback(async () => {
    archivedLoadedRef.current = true;
    setIsLoadingArchived(true);
    setError(null);
    try {
      const archived = await client.listMemories('archived');
      setArchivedItems(archived);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chưa tải được mục đã gỡ. Bạn thử lại nhé.');
    } finally {
      setIsLoadingArchived(false);
    }
  }, [client]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [active, pending, archived] = await Promise.all([
        client.listMemories('active'),
        client.listMemories('pending'),
        archivedLoadedRef.current ? client.listMemories('archived') : Promise.resolve(null),
      ]);
      setActiveItems(active);
      setPendingItems(pending);
      if (archived !== null) {
        setArchivedItems(archived);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chưa tải được bộ nhớ. Bạn thử lại nhé.');
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const runMutation = useCallback(
    async (action: () => Promise<unknown>, fallbackMessage: string): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        await action();
        await refresh();
        notifyMemoriesUpdated();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : fallbackMessage);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [refresh]
  );

  const create = useCallback(
    (input: CreateOwnerMemoryInput) => runMutation(() => client.createMemory(input), 'Chưa lưu được mục bộ nhớ.'),
    [client, runMutation]
  );

  const update = useCallback(
    (id: string, input: UpdateOwnerMemoryInput) =>
      runMutation(() => client.updateMemory(id, input), 'Chưa cập nhật được mục bộ nhớ.'),
    [client, runMutation]
  );

  const remove = useCallback(
    (id: string) => runMutation(() => client.deleteMemory(id), 'Chưa xoá được mục bộ nhớ.'),
    [client, runMutation]
  );

  return {
    activeItems,
    pendingItems,
    archivedItems,
    isLoading,
    isLoadingArchived,
    isSaving,
    error,
    refresh,
    loadArchived,
    create,
    update,
    remove,
  };
}

/**
 * Tracks the count of pending Owner Memory suggestions for the header badge (ADR-0015 Phase 2).
 * Strictly no-ops when `enabled` is false (Visitors never trigger any request).
 */
export function usePendingMemoryCount(
  baseUrl: string,
  enabled: boolean,
  isStreaming: boolean
): [number, (count: number) => void] {
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const [count, setCount] = useState(0);
  const wasStreamingRef = useRef(false);
  const preStreamCountRef = useRef(0);
  const latestCountRef = useRef(0);

  useEffect(() => {
    latestCountRef.current = enabled ? count : 0;
  }, [count, enabled]);

  const updateCount = useCallback((next: number) => {
    latestCountRef.current = next;
    setCount(next);
  }, []);

  const fetchPending = useCallback(
    async (shouldCommit?: () => boolean): Promise<number | null> => {
      if (!enabled) return null;
      try {
        const items = await client.listMemories('pending');
        if (!shouldCommit || shouldCommit()) {
          updateCount(items.length);
        }
        return items.length;
      } catch {
        // Fail-open: badge stays at last known count when offline or unauthenticated
        return null;
      }
    },
    [client, enabled, updateCount]
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const isActive = () => !cancelled;
    void fetchPending(isActive);
    if (typeof window === 'undefined') {
      return () => {
        cancelled = true;
      };
    }
    const handleUpdated = () => {
      void fetchPending(isActive);
    };
    window.addEventListener(OWNER_MEMORIES_UPDATED_EVENT, handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(OWNER_MEMORIES_UPDATED_EVENT, handleUpdated);
    };
  }, [enabled, fetchPending]);

  // Refresh after each Owner streaming reply finishes (immediate for Quiz notes + bounded adaptive backoff for async extractor)
  useEffect(() => {
    if (!enabled) {
      wasStreamingRef.current = isStreaming;
      return;
    }
    if (!wasStreamingRef.current && isStreaming) {
      preStreamCountRef.current = latestCountRef.current;
      wasStreamingRef.current = true;
      return;
    }
    if (wasStreamingRef.current && !isStreaming) {
      wasStreamingRef.current = false;
      let cancelled = false;
      let timerId: number | undefined;
      const isActive = () => !cancelled;

      const pollAdaptive = async () => {
        const initial = await fetchPending(isActive);
        if (cancelled || initial === null || initial > preStreamCountRef.current) {
          return;
        }
        for (const delay of ADAPTIVE_REFRESH_DELAYS_MS) {
          await new Promise<void>((resolve) => {
            timerId = window.setTimeout(resolve, delay);
          });
          if (cancelled) return;
          const next = await fetchPending(isActive);
          if (cancelled || (next !== null && next !== initial)) {
            return;
          }
        }
      };

      void pollAdaptive();
      return () => {
        cancelled = true;
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
        }
      };
    }
    wasStreamingRef.current = isStreaming;
  }, [enabled, isStreaming, fetchPending]);

  return [enabled ? count : 0, updateCount];
}
