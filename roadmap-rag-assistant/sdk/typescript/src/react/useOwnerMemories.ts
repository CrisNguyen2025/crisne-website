import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoadmapChatClient } from '../client';
import type {
  CreateOwnerMemoryInput,
  OwnerMemoryItem,
  UpdateOwnerMemoryInput,
} from '../types';

export interface UseOwnerMemoriesReturn {
  activeItems: OwnerMemoryItem[];
  pendingItems: OwnerMemoryItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CreateOwnerMemoryInput) => Promise<boolean>;
  update: (id: string, input: UpdateOwnerMemoryInput) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

export function useOwnerMemories(baseUrl: string): UseOwnerMemoriesReturn {
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const [activeItems, setActiveItems] = useState<OwnerMemoryItem[]>([]);
  const [pendingItems, setPendingItems] = useState<OwnerMemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [active, pending] = await Promise.all([
        client.listMemories('active'),
        client.listMemories('pending'),
      ]);
      setActiveItems(active);
      setPendingItems(pending);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chưa tải được bộ nhớ. Bạn thử lại nhé.');
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const create = useCallback(
    async (input: CreateOwnerMemoryInput): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        await client.createMemory(input);
        await refresh();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Chưa lưu được mục bộ nhớ.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [client, refresh]
  );

  const update = useCallback(
    async (id: string, input: UpdateOwnerMemoryInput): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        await client.updateMemory(id, input);
        await refresh();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Chưa cập nhật được mục bộ nhớ.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [client, refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        await client.deleteMemory(id);
        await refresh();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Chưa xoá được mục bộ nhớ.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [client, refresh]
  );

  return {
    activeItems,
    pendingItems,
    isLoading,
    isSaving,
    error,
    refresh,
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

  const fetchCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const items = await client.listMemories('pending');
      setCount(items.length);
    } catch {
      // Fail-open: badge stays at last known count when offline or unauthenticated
    }
  }, [client, enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    void fetchCount();
  }, [enabled, fetchCount]);

  // Refresh after each Owner streaming reply finishes (immediate for Quiz notes + delayed for async extractor)
  useEffect(() => {
    if (!enabled) {
      wasStreamingRef.current = isStreaming;
      return;
    }
    if (wasStreamingRef.current && !isStreaming) {
      void fetchCount();
      const timer = window.setTimeout(() => {
        void fetchCount();
      }, 2000);
      wasStreamingRef.current = false;
      return () => window.clearTimeout(timer);
    }
    wasStreamingRef.current = isStreaming;
  }, [enabled, isStreaming, fetchCount]);

  return [count, setCount];
}
