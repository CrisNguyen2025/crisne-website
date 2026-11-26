import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoadmapChatClient } from '../client';
import type { ThreadSummary } from '../types';

const SEARCH_DEBOUNCE_MS = 250;
const SHORT_WORD_TOKEN_MAX = 3;
const CONFIRMATION_ACTIONS = new Set([
  'ok',
  'oki',
  'okay',
  'huy',
  'huy bo',
  'cancel',
  'xac nhan',
  'dong y',
]);

function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWordBoundary(ch: string | undefined): boolean {
  if (!ch) return true;
  return !/[a-z0-9]/.test(ch);
}

function hasWordToken(haystack: string, token: string): boolean {
  if (!token) return false;
  if (token.length > SHORT_WORD_TOKEN_MAX) return haystack.includes(token);
  let pos = 0;
  while (pos <= haystack.length - token.length) {
    const idx = haystack.indexOf(token, pos);
    if (idx < 0) return false;
    if (isWordBoundary(haystack[idx - 1]) && isWordBoundary(haystack[idx + token.length])) {
      return true;
    }
    pos = idx + 1;
  }
  return false;
}

export function filterThreadsLocally(threads: readonly ThreadSummary[], query: string): ThreadSummary[] {
  const folded = foldSearchText(query);
  if (!folded) return [...threads];
  const tokens = folded.split(' ').filter(Boolean);

  return threads.filter((thread) => {
    const cleanTitle = foldSearchText(thread.title).replace(/[!?.~,]+$/g, '').trim();
    const searchableTitle = CONFIRMATION_ACTIONS.has(cleanTitle) ? '' : thread.title;
    const haystack = foldSearchText(
      [searchableTitle, thread.activeTopicTitle, thread.activeTopicSlug, thread.activeLessonTitle]
        .filter(Boolean)
        .join(' ')
    );
    if (!haystack) return false;
    if (tokens.length === 1) return hasWordToken(haystack, tokens[0]);
    return haystack.includes(folded) || tokens.every((token) => hasWordToken(haystack, token));
  });
}

export interface UseThreadHistoryOptions {
  baseUrl: string;
  isOpen: boolean;
  enabled: boolean;
}

export interface UseThreadHistoryReturn {
  threads: ThreadSummary[];
  query: string;
  setQuery: (next: string) => void;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  deletingId: string | null;
  refresh: () => Promise<void>;
  removeThread: (threadId: string) => Promise<boolean>;
}

export function useThreadHistory({
  baseUrl,
  isOpen,
  enabled,
}: UseThreadHistoryOptions): UseThreadHistoryReturn {
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const [recentThreads, setRecentThreads] = useState<ThreadSummary[]>([]);
  const [searchState, setSearchState] = useState<{ query: string; items: ThreadSummary[] } | null>(null);
  const [query, setQueryState] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const listAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !enabled) return;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    void client
      .listThreads(undefined, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setRecentThreads(items);
        setHasLoaded(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        setHasLoaded(true);
        setError(err instanceof Error ? err.message : 'Chưa tải được lịch sử chat.');
      });

    return () => {
      controller.abort();
    };
  }, [client, isOpen, enabled]);

  useEffect(() => {
    if (!isOpen || !enabled) {
      searchAbortRef.current?.abort();
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      searchAbortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;

    const timer = setTimeout(() => {
      setIsSearching(true);
      setError(null);
      void client
        .listThreads(trimmed, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) {
            setSearchState({ query: trimmed, items });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setError(err instanceof Error ? err.message : 'Chưa tìm được lịch sử chat.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, isOpen, enabled, query]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    if (!next.trim()) {
      setIsSearching(false);
      setSearchState(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const trimmed = query.trim();
    if (!trimmed) {
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      setIsRetrying(true);
      setError(null);
      try {
        const items = await client.listThreads(undefined, controller.signal);
        if (!controller.signal.aborted) {
          setRecentThreads(items);
          setHasLoaded(true);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Chưa tải được lịch sử chat.');
      } finally {
        if (!controller.signal.aborted) {
          setIsRetrying(false);
        }
      }
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    setError(null);
    try {
      const items = await client.listThreads(trimmed, controller.signal);
      if (!controller.signal.aborted) {
        setSearchState({ query: trimmed, items });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Chưa tìm được lịch sử chat.');
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [client, enabled, query]);

  const removeThread = useCallback(
    async (threadId: string): Promise<boolean> => {
      setDeletingId(threadId);
      setError(null);
      try {
        await client.deleteThread(threadId);
        setRecentThreads((prev) => prev.filter((item) => item.threadId !== threadId));
        setSearchState((prev) =>
          prev
            ? { ...prev, items: prev.items.filter((item) => item.threadId !== threadId) }
            : null
        );
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Chưa xoá được cuộc trò chuyện.');
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [client]
  );

  const trimmedQuery = query.trim();
  const threads = useMemo(() => {
    if (!trimmedQuery) return recentThreads;
    if (searchState?.query === trimmedQuery) return searchState.items;
    return filterThreadsLocally(recentThreads, trimmedQuery);
  }, [recentThreads, searchState, trimmedQuery]);

  const isLoading = (isOpen && enabled && !hasLoaded && !error) || isRetrying;

  return {
    threads,
    query,
    setQuery,
    isLoading,
    isSearching,
    error,
    deletingId,
    refresh,
    removeThread,
  };
}
