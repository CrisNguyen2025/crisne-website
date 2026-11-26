"use client";

import { useSyncExternalStore } from "react";
import type { GlobalSearchResponseDto, SearchScope } from "@/lib/search/global-search";

let isOpenState = false;
const listeners = new Set<() => void>();
const responseCache = new Map<string, GlobalSearchResponseDto>();
const MAX_CACHE_ENTRIES = 32;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeGlobalSearch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGlobalSearchSnapshot(): boolean {
  return isOpenState;
}

export function getServerGlobalSearchSnapshot(): boolean {
  return false;
}

export function openGlobalSearch(): void {
  if (isOpenState) return;
  isOpenState = true;
  emit();
}

export function closeGlobalSearch(): void {
  if (!isOpenState) return;
  isOpenState = false;
  emit();
}

export function toggleGlobalSearch(): void {
  isOpenState = !isOpenState;
  emit();
}

export function useGlobalSearchOpen(): boolean {
  return useSyncExternalStore(
    subscribeGlobalSearch,
    getGlobalSearchSnapshot,
    getServerGlobalSearchSnapshot
  );
}

export function searchCacheKey(query: string, scope: SearchScope): string {
  return `${scope}::${query.trim().toLowerCase()}`;
}

export function getCachedSearchResult(
  query: string,
  scope: SearchScope
): GlobalSearchResponseDto | undefined {
  return responseCache.get(searchCacheKey(query, scope));
}

export function setCachedSearchResult(
  query: string,
  scope: SearchScope,
  data: GlobalSearchResponseDto
): void {
  const key = searchCacheKey(query, scope);
  if (responseCache.has(key)) {
    responseCache.delete(key);
  } else if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    }
  }
  responseCache.set(key, data);
}

export function clearGlobalSearchCache(): void {
  responseCache.clear();
}
