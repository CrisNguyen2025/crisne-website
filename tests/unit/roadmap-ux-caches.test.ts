import { afterEach, describe, expect, it } from 'vitest';
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  patchCachedOwnerStatus,
  setCachedOwnerStatuses,
} from '@/lib/roadmap/owner-status-cache';
import {
  clearPendingLessonWrite,
  markPendingLessonWrite,
  peekPendingLessonWrite,
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
