import type { LessonStatus } from '@/lib/roadmap/status';

const ownerStatusCache = new Map<string, Record<string, LessonStatus>>();

export function getCachedOwnerStatuses(
  topicSlug: string
): Record<string, LessonStatus> | undefined {
  return ownerStatusCache.get(topicSlug);
}

export function setCachedOwnerStatuses(
  topicSlug: string,
  statuses: Record<string, LessonStatus>
): void {
  ownerStatusCache.set(topicSlug, statuses);
}

export function patchCachedOwnerStatus(
  topicSlug: string,
  itemId: string,
  status: LessonStatus
): void {
  const existing = ownerStatusCache.get(topicSlug);
  ownerStatusCache.set(topicSlug, { ...(existing ?? {}), [itemId]: status });
}

export function invalidateCachedOwnerStatuses(topicSlug?: string): void {
  if (topicSlug) {
    ownerStatusCache.delete(topicSlug);
    return;
  }
  ownerStatusCache.clear();
}
