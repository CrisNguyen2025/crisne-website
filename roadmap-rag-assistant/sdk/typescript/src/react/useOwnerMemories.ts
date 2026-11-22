import { useCallback, useMemo, useState } from 'react';
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
