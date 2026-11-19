import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ADR-0014: Topic at /[topicSlug], Lesson at /[topicSlug]/[lessonSlug], old URLs 308 to them.

const prismaMock = vi.hoisted(() => ({
  roadmap: { findUnique: vi.fn(), findMany: vi.fn() },
  roadmapItem: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  slugRedirect: { findUnique: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/roadmap/queries', () => ({ getLessonPageData: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/roadmap/LessonEditorialReader', () => ({ LessonEditorialReader: () => null }));

import { isReservedTopicSlug, lessonPath, topicPath } from '@/lib/roadmap/paths';
import { findLessonPath, findTopicPath } from '@/lib/roadmap/resolveRoadmap';
import LessonPage from '@/app/[topicSlug]/[lessonSlug]/page';
import LegacyLessonRedirectPage from '@/app/lessons/[lessonSlug]/page';
import LegacyTopicRedirectPage from '@/app/topic/[topicSlug]/page';
import LegacyItemRedirectPage from '@/app/topic/[topicSlug]/[itemSlug]/page';
import { getRoadmapPageContext } from '@/logic/roadmap/roadmapAssistantService';

const TOPIC_AI = { id: 'topic-ai', slug: 'ai', title: 'AI' };
const LESSON_KB = { id: 'item-1', slug: 'kb', roadmapId: 'topic-ai', roadmap: TOPIC_AI };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.roadmap.findUnique.mockImplementation(async ({ where }) =>
    where.slug === 'ai' || where.id === 'topic-ai' ? TOPIC_AI : null
  );
  prismaMock.roadmap.findMany.mockResolvedValue([TOPIC_AI]);
  // Lesson 'kb' is found by slug; 'item-1' is its id (also how a SlugRedirect target is read)
  prismaMock.roadmapItem.findUnique.mockImplementation(async ({ where }) => {
    if (where.slug === 'kb') return LESSON_KB;
    if (where.id === 'item-1') return LESSON_KB;
    return null;
  });
  prismaMock.roadmapItem.findMany.mockResolvedValue([{ id: 'item-1', slug: 'kb' }]);
  prismaMock.slugRedirect.findUnique.mockImplementation(async ({ where }) =>
    where.fromSlug === 'old-kb' ? { fromSlug: 'old-kb', entity: 'lesson', targetId: 'item-1' } : null
  );
});

afterEach(() => vi.unstubAllGlobals());

const lessonParams = (topicSlug: string, lessonSlug: string) => ({
  params: Promise.resolve({ topicSlug, lessonSlug }),
});

describe('paths', () => {
  it('builds Topic and Lesson paths, and falls back to /lessons/ without a Topic slug', () => {
    expect(topicPath('ai')).toBe('/ai');
    expect(lessonPath('ai', 'kb')).toBe('/ai/kb');
    expect(lessonPath('', 'kb')).toBe('/lessons/kb');
  });

  it('reserves the first path segments the app already uses', () => {
    for (const slug of ['api', 'lessons', 'topic', 'notes', 'portfolio', 'login', '_next', ' Notes ']) {
      expect(isReservedTopicSlug(slug)).toBe(true);
    }
    expect(isReservedTopicSlug('ai')).toBe(false);
  });
});

describe('findLessonPath / findTopicPath', () => {
  it('returns the canonical path for a slug, an id and an old slug, and null when missing', async () => {
    expect(await findLessonPath('kb')).toBe('/ai/kb');
    expect(await findLessonPath('item-1')).toBe('/ai/kb');
    expect(await findLessonPath('old-kb')).toBe('/ai/kb');
    expect(await findLessonPath('nope')).toBeNull();
    expect(await findTopicPath('ai')).toBe('/ai');
    expect(await findTopicPath('nope')).toBeNull();
  });
});

describe('/[topicSlug]/[lessonSlug]', () => {
  it('308s a URL that names another Topic to the Lesson’s own Topic', async () => {
    await expect(LessonPage(lessonParams('backend', 'kb'))).rejects.toThrow('REDIRECT /ai/kb');
  });

  it('308s an old slug in one hop', async () => {
    await expect(LessonPage(lessonParams('ai', 'old-kb'))).rejects.toThrow('REDIRECT /ai/kb');
  });

  it('404s an unknown Lesson', async () => {
    await expect(LessonPage(lessonParams('ai', 'nope'))).rejects.toThrow('NOT_FOUND');
  });

  it('renders the canonical URL without redirecting', async () => {
    // getLessonPageData is mocked to null, so reaching it ends in notFound, not a redirect
    await expect(LessonPage(lessonParams('ai', 'kb'))).rejects.toThrow('NOT_FOUND');
  });
});

describe('old URLs 308 to the new ones', () => {
  it('/lessons/[lessonSlug]', async () => {
    await expect(
      LegacyLessonRedirectPage({ params: Promise.resolve({ lessonSlug: 'kb' }) })
    ).rejects.toThrow('REDIRECT /ai/kb');
    await expect(
      LegacyLessonRedirectPage({ params: Promise.resolve({ lessonSlug: 'nope' }) })
    ).rejects.toThrow('NOT_FOUND');
  });

  it('/topic/[topicSlug], keeping ?section=', async () => {
    await expect(
      LegacyTopicRedirectPage({
        params: Promise.resolve({ topicSlug: 'ai' }),
        searchParams: Promise.resolve({ section: 'RAG & Eval' }),
      })
    ).rejects.toThrow('REDIRECT /ai?section=RAG%20%26%20Eval');
  });

  it('/topic/[topicSlug]/[itemSlug]', async () => {
    prismaMock.roadmapItem.findFirst.mockResolvedValue(LESSON_KB);
    await expect(
      LegacyItemRedirectPage({ params: Promise.resolve({ topicSlug: 'ai', itemSlug: 'kb' }) })
    ).rejects.toThrow('REDIRECT /ai/kb');
  });
});

describe('getRoadmapPageContext', () => {
  const stubPage = (pathname: string, search = '', dataset?: Record<string, string>) => {
    vi.stubGlobal('window', { location: { pathname, search } });
    vi.stubGlobal('document', {
      querySelector: vi.fn().mockReturnValue(dataset ? { dataset } : null),
    });
  };

  it('reads a Lesson page, preferring the page dataset', () => {
    stubPage('/ai/kb', '', { roadmapSlug: 'ai', section: 'Retrieval' });
    expect(getRoadmapPageContext()).toEqual({ roadmapSlug: 'ai', itemId: 'kb', section: 'Retrieval' });
  });

  it('reads a Topic page with ?section=', () => {
    stubPage('/ai', '?section=RAG');
    expect(getRoadmapPageContext()).toEqual({ roadmapSlug: 'ai', itemId: undefined, section: 'RAG' });
  });

  it('ignores pages that are not a Topic or Lesson', () => {
    stubPage('/notes/some-post');
    expect(getRoadmapPageContext()).toBeUndefined();
    stubPage('/');
    expect(getRoadmapPageContext()).toBeUndefined();
  });
});
