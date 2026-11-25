import { afterEach, describe, expect, it } from 'vitest';
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  patchCachedOwnerStatus,
  setCachedOwnerStatuses,
} from '@/lib/roadmap/owner-status-cache';
import {
  clearDeletedTopicSlug,
  clearPendingLessonWrite,
  consumeRoadmapRefreshPending,
  getDeletedLessonIdsSnapshot,
  getDeletedTopicSlugsSnapshot,
  getRoadmapMutationVersion,
  markPendingLessonWrite,
  markRoadmapRefreshPending,
  peekPendingLessonWrite,
  reconcileDeletedLessonIds,
  reconcileDeletedTopicSlugs,
  recordPendingDeletion,
  subscribePendingWrites,
} from '@/lib/roadmap/pending-write';
import { splitSectionLabel } from '@/lib/roadmap/section-label';

describe('owner-status-cache', () => {
  afterEach(() => {
    invalidateCachedOwnerStatuses();
  });

  it('stores, patches, and invalidates statuses by topicSlug', () => {
    expect(getCachedOwnerStatuses('ai')).toBeUndefined();

    setCachedOwnerStatuses('ai', { l1: 'learning', l2: 'target' });
    expect(getCachedOwnerStatuses('ai')).toEqual({ l1: 'learning', l2: 'target' });

    patchCachedOwnerStatus('ai', 'l1', 'known');
    expect(getCachedOwnerStatuses('ai')).toEqual({ l1: 'known', l2: 'target' });

    patchCachedOwnerStatus('backend', 'l9', 'learning');
    expect(getCachedOwnerStatuses('backend')).toEqual({ l9: 'learning' });

    invalidateCachedOwnerStatuses('ai');
    expect(getCachedOwnerStatuses('ai')).toBeUndefined();
    expect(getCachedOwnerStatuses('backend')).toEqual({ l9: 'learning' });
  });
});

describe('pending-write', () => {
  afterEach(() => {
    clearPendingLessonWrite('speculative-decoding');
  });

  it('peeks idempotently until cleared for the matching slug', () => {
    expect(peekPendingLessonWrite('speculative-decoding')).toBe(false);

    markPendingLessonWrite('speculative-decoding');
    expect(peekPendingLessonWrite('speculative-decoding')).toBe(true);
    expect(peekPendingLessonWrite('speculative-decoding')).toBe(true);
    expect(peekPendingLessonWrite('other-slug')).toBe(false);

    clearPendingLessonWrite('other-slug');
    expect(peekPendingLessonWrite('speculative-decoding')).toBe(true);

    clearPendingLessonWrite('speculative-decoding');
    expect(peekPendingLessonWrite('speculative-decoding')).toBe(false);
  });

  it('tracks pending refresh flag once, bumps mutation version, and reconciles tombstones', () => {
    consumeRoadmapRefreshPending();
    reconcileDeletedLessonIds([]);
    reconcileDeletedTopicSlugs([]);

    const events: number[] = [];
    const unsubscribe = subscribePendingWrites(() => {
      events.push(getDeletedLessonIdsSnapshot().size + getDeletedTopicSlugsSnapshot().size);
    });

    const v0 = getRoadmapMutationVersion();
    expect(consumeRoadmapRefreshPending()).toBe(false);

    markRoadmapRefreshPending({ deletedLessonId: 'l-deleted', deletedTopicSlug: 't-deleted' });
    expect(getRoadmapMutationVersion()).toBeGreaterThan(v0);
    expect(getDeletedLessonIdsSnapshot().has('l-deleted')).toBe(true);
    expect(getDeletedTopicSlugsSnapshot().has('t-deleted')).toBe(true);

    // Consumes refresh flag exactly once, but ignores when still on origin route
    expect(consumeRoadmapRefreshPending()).toBe(true);
    expect(consumeRoadmapRefreshPending()).toBe(false);

    markRoadmapRefreshPending({ originRouteKey: '/ai/lesson-1' });
    expect(consumeRoadmapRefreshPending('/ai/lesson-1')).toBe(false);
    expect(consumeRoadmapRefreshPending('/ai/lesson-2')).toBe(false);

    markRoadmapRefreshPending({ originRouteKey: '/ai/lesson-1' });
    expect(consumeRoadmapRefreshPending('/ai/lesson-2')).toBe(true);

    // Keeps tombstones while stale props still include them; prunes once fresh props arrive
    reconcileDeletedLessonIds(['l-deleted', 'l-other']);
    expect(getDeletedLessonIdsSnapshot().has('l-deleted')).toBe(true);
    reconcileDeletedLessonIds(['l-other']);
    expect(getDeletedLessonIdsSnapshot().has('l-deleted')).toBe(false);

    reconcileDeletedTopicSlugs(['t-deleted']);
    expect(getDeletedTopicSlugsSnapshot().has('t-deleted')).toBe(true);
    clearDeletedTopicSlug('t-deleted');
    expect(getDeletedTopicSlugsSnapshot().has('t-deleted')).toBe(false);

    recordPendingDeletion({ deletedTopicSlug: 't-temp' });
    expect(getDeletedTopicSlugsSnapshot().has('t-temp')).toBe(true);
    reconcileDeletedTopicSlugs([]);
    expect(getDeletedTopicSlugsSnapshot().has('t-temp')).toBe(false);

    expect(events.length).toBeGreaterThanOrEqual(3);
    unsubscribe();
  });
});

describe('splitSectionLabel', () => {
  it('splits primary label and level suffix on last separator', () => {
    expect(splitSectionLabel('01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core')).toEqual({
      primary: '01. Tầng Dữ liệu & Tri thức (Knowledge Base)',
      sub: 'Core',
    });
    expect(splitSectionLabel('RAG · Trung cấp · Phần 2')).toEqual({
      primary: 'RAG · Trung cấp',
      sub: 'Phần 2',
    });
  });

  it('handles plain labels and null sections cleanly', () => {
    expect(splitSectionLabel('Foundations')).toEqual({
      primary: 'Foundations',
      sub: null,
    });
    expect(splitSectionLabel(null)).toEqual({
      primary: 'Chung',
      sub: null,
    });
    expect(splitSectionLabel('   ')).toEqual({
      primary: 'Chung',
      sub: null,
    });
  });
});
