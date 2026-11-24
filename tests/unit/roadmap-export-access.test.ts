import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const roadmapAggregate = vi.fn();
const itemAggregate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    roadmap: { findMany: (...args: unknown[]) => findMany(...args), aggregate: (...a: unknown[]) => roadmapAggregate(...a) },
    roadmapItem: { aggregate: (...a: unknown[]) => itemAggregate(...a) },
  },
}));
// Signed out: only the admin key can open these routes
vi.mock('@/auth', () => ({ auth: vi.fn(async () => null) }));

import { GET as fullExport } from '@/app/api/v1/roadmaps/full-export/route';
import { GET as listRoadmaps } from '@/app/api/v1/roadmaps/route';
import { GET as indexVersion } from '@/app/api/v1/roadmaps/index-version/route';
import { NextRequest } from 'next/server';

const KEY = 'test-admin-key';

function request(path: string, key?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers: key ? { 'x-admin-key': key } : {} });
}

const LESSON = {
  id: 'l1',
  roadmapId: 't1',
  slug: 'vector-db',
  section: null,
  title: 'Vector DB',
  description: null,
  content: '<p>Mở đầu.</p><h2>Tinh chỉnh</h2><p>ef_search = 40.</p>',
  order: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('roadmap export routes', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_API_KEY', KEY);
    findMany.mockResolvedValue([{ id: 't1', slug: 'ai', title: 'AI', items: [LESSON] }]);
    roadmapAggregate.mockResolvedValue({ _count: { _all: 2 }, _max: { updatedAt: new Date(1000) } });
    itemAggregate.mockResolvedValue({ _count: { _all: 5 }, _max: { updatedAt: new Date(2000) } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([
    ['full-export', () => fullExport(request('/api/v1/roadmaps/full-export', 'wrong-key'))],
    ['list', () => listRoadmaps(request('/api/v1/roadmaps'))],
    ['index-version', () => indexVersion(request('/api/v1/roadmaps/index-version', 'wrong-key'))],
  ])('%s refuses a request without a valid key', async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(roadmapAggregate).not.toHaveBeenCalled();
  });

  it('full-export gives each lesson its chunks and never its status', async () => {
    const res = await fullExport(request('/api/v1/roadmaps/full-export', KEY));
    expect(res.status).toBe(200);
    const body = await res.json();
    const lesson = body.roadmaps[0].items[0];
    expect(lesson.chunks).toEqual([
      { anchor: null, heading: null, text: 'Mở đầu.' },
      { anchor: 'tinh-chinh', heading: 'Tinh chỉnh', text: 'ef_search = 40.' },
    ]);
    expect(lesson).not.toHaveProperty('status');
    const select = findMany.mock.calls[0][0].include.items.select;
    expect(select).not.toHaveProperty('status');
  });

  it('index-version fingerprints counts and latest updates of topics and lessons', async () => {
    const res = await indexVersion(request('/api/v1/roadmaps/index-version', KEY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: '2.1000.5.2000' });
  });

  it('index-version changes when a lesson is deleted', async () => {
    const before = await (await indexVersion(request('/api/v1/roadmaps/index-version', KEY))).json();
    itemAggregate.mockResolvedValue({ _count: { _all: 4 }, _max: { updatedAt: new Date(2000) } });
    const after = await (await indexVersion(request('/api/v1/roadmaps/index-version', KEY))).json();
    expect(after.version).not.toBe(before.version);
  });

  it('the topic list still answers the admin key', async () => {
    const res = await listRoadmaps(request('/api/v1/roadmaps', KEY));
    expect(res.status).toBe(200);
  });
});
