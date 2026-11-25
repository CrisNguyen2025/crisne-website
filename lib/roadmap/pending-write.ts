export interface PendingRoadmapDeletion {
  deletedLessonId?: string;
  deletedTopicSlug?: string;
  originRouteKey?: string;
}

let pendingLessonSlug: string | null = null;
let pendingRoadmapRefresh = false;
let pendingRefreshOriginRouteKey: string | null = null;
let roadmapMutationVersion = 0;
let deletedLessonIds: ReadonlySet<string> = new Set();
let deletedTopicSlugs: ReadonlySet<string> = new Set();

const EMPTY_PENDING_SET: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function markPendingLessonWrite(slug: string): void {
  pendingLessonSlug = slug;
}

export function peekPendingLessonWrite(slug: string): boolean {
  return pendingLessonSlug === slug;
}

export function clearPendingLessonWrite(slug: string): void {
  if (pendingLessonSlug === slug) {
    pendingLessonSlug = null;
  }
}

export function subscribePendingWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEmptyPendingSet(): ReadonlySet<string> {
  return EMPTY_PENDING_SET;
}

export function getDeletedLessonIdsSnapshot(): ReadonlySet<string> {
  return deletedLessonIds;
}

export function getDeletedTopicSlugsSnapshot(): ReadonlySet<string> {
  return deletedTopicSlugs;
}

export function getRoadmapMutationVersion(): number {
  return roadmapMutationVersion;
}

export function recordPendingDeletion(
  deletion?: PendingRoadmapDeletion
): void {
  if (!deletion) return;
  let changed = false;
  if (
    deletion.deletedLessonId &&
    !deletedLessonIds.has(deletion.deletedLessonId)
  ) {
    const next = new Set(deletedLessonIds);
    next.add(deletion.deletedLessonId);
    deletedLessonIds = next;
    changed = true;
  }
  if (
    deletion.deletedTopicSlug &&
    !deletedTopicSlugs.has(deletion.deletedTopicSlug)
  ) {
    const next = new Set(deletedTopicSlugs);
    next.add(deletion.deletedTopicSlug);
    deletedTopicSlugs = next;
    changed = true;
  }
  if (changed) {
    roadmapMutationVersion += 1;
    notifyListeners();
  }
}

export function markRoadmapRefreshPending(
  deletion?: PendingRoadmapDeletion
): void {
  pendingRoadmapRefresh = true;
  pendingRefreshOriginRouteKey = deletion?.originRouteKey ?? null;
  roadmapMutationVersion += 1;
  recordPendingDeletion(deletion);
}

export function consumeRoadmapRefreshPending(
  currentRouteKey?: string
): boolean {
  if (!pendingRoadmapRefresh) return false;
  const isOriginRoute =
    Boolean(currentRouteKey) &&
    pendingRefreshOriginRouteKey === currentRouteKey;
  pendingRoadmapRefresh = false;
  pendingRefreshOriginRouteKey = null;
  return !isOriginRoute;
}

function prunePendingSet(
  current: ReadonlySet<string>,
  presentKeys: ReadonlySet<string>
): ReadonlySet<string> | null {
  if (current.size === 0) return null;
  let changed = false;
  const next = new Set<string>();
  for (const key of current) {
    if (presentKeys.has(key)) {
      next.add(key);
    } else {
      changed = true;
    }
  }
  return changed ? next : null;
}

export function reconcileDeletedLessonIds(presentIds: Iterable<string>): void {
  if (deletedLessonIds.size === 0) return;
  const next = prunePendingSet(deletedLessonIds, new Set(presentIds));
  if (next) {
    deletedLessonIds = next;
    notifyListeners();
  }
}

export function reconcileDeletedTopicSlugs(
  presentSlugs: Iterable<string>
): void {
  if (deletedTopicSlugs.size === 0) return;
  const next = prunePendingSet(deletedTopicSlugs, new Set(presentSlugs));
  if (next) {
    deletedTopicSlugs = next;
    notifyListeners();
  }
}

export function clearDeletedTopicSlug(slug: string): void {
  if (!deletedTopicSlugs.has(slug)) return;
  const next = new Set(deletedTopicSlugs);
  next.delete(slug);
  deletedTopicSlugs = next;
  notifyListeners();
}
