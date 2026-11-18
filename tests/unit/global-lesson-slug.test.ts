import { describe, expect, it } from 'vitest';
import { allocateGlobalLessonSlug } from '@/lib/utils';

describe('allocateGlobalLessonSlug', () => {
  it('uses base slug when globally free', () => {
    const used = new Set<string>();
    const topicUsed = new Set<string>();
    expect(allocateGlobalLessonSlug('Cơ bản về Docker', used, 'backend', topicUsed)).toBe('co-ban-ve-docker');
    expect(used.has('co-ban-ve-docker')).toBe(true);
    expect(topicUsed.has('co-ban-ve-docker')).toBe(true);
  });

  it('appends topicSlug on cross-topic collision', () => {
    const used = new Set<string>(['caching']);
    const topicUsed = new Set<string>();
    expect(allocateGlobalLessonSlug('Caching', used, 'backend', topicUsed)).toBe('caching-backend');
    expect(used.has('caching-backend')).toBe(true);
  });

  it('uses numeric suffix on same-topic collision or repeated cross-topic collision', () => {
    const usedSame = new Set<string>(['kubernetes']);
    const topicUsedSame = new Set<string>(['kubernetes']);
    expect(allocateGlobalLessonSlug('Kubernetes!', usedSame, 'backend', topicUsedSame)).toBe('kubernetes-2');

    const usedCross = new Set<string>(['caching', 'caching-backend']);
    const topicUsedCross = new Set<string>();
    expect(allocateGlobalLessonSlug('Caching', usedCross, 'backend', topicUsedCross)).toBe('caching-2');
    expect(allocateGlobalLessonSlug('Caching?', usedCross, 'backend', topicUsedCross)).toBe('caching-3');
  });

  it("falls back to 'lesson' when title has no slug characters", () => {
    const used = new Set<string>();
    expect(allocateGlobalLessonSlug('!!!', used, 'ai')).toBe('lesson');
  });
});
