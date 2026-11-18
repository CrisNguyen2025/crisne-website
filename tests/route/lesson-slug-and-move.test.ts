import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  roadmap: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  roadmapItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  slugRedirect: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

const notifyMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth/write-access', () => writeAccessMock);
vi.mock('@/lib/roadmap/rag-reindex', () => ({ notifyRoadmapChanged: notifyMock }));

import { PATCH } from '@/app/api/v1/roadmaps/items/[id]/route';
import { resolveLessonGlobal } from '@/lib/roadmap/resolveRoadmap';
import { getRoadmapPageContext } from '@/logic/roadmap/roadmapAssistantService';

const currentItem = {
  id: 'item-1',
  roadmapId: 'topic-1',
  slug: 'old-slug',
  title: 'Old Title',
  description: 'Old description',
  section: 'Core',
  order: 1,
  status: 'known',
};

const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/v1/roadmaps/items/item-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ id: 'item-1' }) };

describe('PATCH /api/v1/roadmaps/items/[id] slug, redirect, and topic move', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roadmapItem.findUnique.mockResolvedValue({ ...currentItem });
    prismaMock.roadmapItem.findMany.mockResolvedValue([]);
    prismaMock.roadmapItem.update.mockImplementation(async ({ data }) => ({
      ...currentItem,
      ...data,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves existing slug when only title changes', async () => {
    const res = await PATCH(patch({ title: 'Updated Title' }), context);
    expect(res.status).toBe(200);
    const updateData = prismaMock.roadmapItem.update.mock.calls[0][0].data;
    expect(updateData.title).toBe('Updated Title');
    expect(updateData.slug).toBeUndefined();
    expect(prismaMock.slugRedirect.upsert).not.toHaveBeenCalled();
  });

  it('updates slug, records SlugRedirect, and notifies reindex on explicit slug change', async () => {
    prismaMock.roadmapItem.findUnique
      .mockResolvedValueOnce({ ...currentItem })
      .mockResolvedValueOnce(null);

    const res = await PATCH(patch({ slug: 'New Custom Slug' }), context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.slug).toBe('new-custom-slug');
    expect(prismaMock.slugRedirect.upsert).toHaveBeenCalledWith({
      where: { fromSlug: 'old-slug' },
      update: { targetId: 'item-1', entity: 'lesson' },
      create: { fromSlug: 'old-slug', entity: 'lesson', targetId: 'item-1' },
    });
    expect(prismaMock.slugRedirect.deleteMany).toHaveBeenCalledWith({
      where: { fromSlug: 'new-custom-slug' },
    });
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it('returns 409 when custom slug belongs to another lesson', async () => {
    prismaMock.roadmapItem.findUnique
      .mockResolvedValueOnce({ ...currentItem })
      .mockResolvedValueOnce({ id: 'other-item', slug: 'taken-slug' });

    const res = await PATCH(patch({ slug: 'taken-slug' }), context);
    expect(res.status).toBe(409);
    expect(prismaMock.roadmapItem.update).not.toHaveBeenCalled();
  });

  it('moves lesson to another topic via roadmapSlug while keeping slug intact', async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({ id: 'topic-2', slug: 'backend', title: 'Backend' });
    prismaMock.roadmapItem.findMany.mockResolvedValueOnce([
      { id: 'item-9', title: 'Other', order: 4, section: 'core' },
    ]);

    const res = await PATCH(patch({ roadmapSlug: 'backend' }), context);
    expect(res.status).toBe(200);
    const updateData = prismaMock.roadmapItem.update.mock.calls[0][0].data;
    expect(updateData.roadmapId).toBe('topic-2');
    expect(updateData.order).toBe(5);
    expect(updateData.section).toBe('core');
    expect(updateData.slug).toBeUndefined();
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it('resolveLessonGlobal resolves exact slug, UUID redirect, and SlugRedirect in one hop', async () => {
    const topic = { id: 'topic-1', slug: 'ai', title: 'AI' };
    prismaMock.roadmapItem.findUnique.mockResolvedValueOnce({
      ...currentItem,
      slug: 'rag-chunking',
      roadmap: topic,
    });
    const found = await resolveLessonGlobal('rag-chunking');
    expect(found).toMatchObject({ kind: 'found', topic: { slug: 'ai' } });

    prismaMock.roadmapItem.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'item-1', slug: 'rag-chunking', roadmap: topic });
    const byId = await resolveLessonGlobal('item-1');
    expect(byId).toEqual({ kind: 'redirect', toSlug: 'rag-chunking' });

    prismaMock.roadmapItem.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ slug: 'rag-chunking' });
    prismaMock.roadmapItem.findMany.mockResolvedValueOnce([]);
    prismaMock.slugRedirect.findUnique.mockResolvedValueOnce({
      fromSlug: 'legacy-chunking',
      entity: 'lesson',
      targetId: 'item-1',
    });
    const viaRedirect = await resolveLessonGlobal('legacy-chunking');
    expect(viaRedirect).toEqual({ kind: 'redirect', toSlug: 'rag-chunking' });
  });

  it('getRoadmapPageContext extracts roadmapSlug, itemId, and section on /lessons/[slug]', () => {
    vi.stubGlobal('window', {
      location: {
        pathname: '/lessons/hybrid-search',
        search: '',
      },
    });
    vi.stubGlobal('document', {
      querySelector: vi.fn().mockReturnValue({
        dataset: {
          roadmapSlug: 'ai-architecture',
          section: 'Retrieval',
        },
      }),
    });

    expect(getRoadmapPageContext()).toEqual({
      roadmapSlug: 'ai-architecture',
      itemId: 'hybrid-search',
      section: 'Retrieval',
    });
  });
});
