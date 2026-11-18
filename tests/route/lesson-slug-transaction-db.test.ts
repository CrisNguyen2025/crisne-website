import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  client: null as PrismaClient | null,
}));

vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return testState.client;
  },
}));

vi.mock('@/lib/auth/write-access', () => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/roadmap/rag-reindex', () => ({
  notifyRoadmapChanged: vi.fn(),
}));

import { PATCH } from '@/app/api/v1/roadmaps/items/[id]/route';
import { getAllTopicsMeta } from '@/lib/roadmap/queries';
import { resolveLessonGlobal } from '@/lib/roadmap/resolveRoadmap';

describe('Real SQLite transaction atomicity for PATCH /api/v1/roadmaps/items/[id]', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    if (testState.client) {
      await testState.client.$disconnect();
      testState.client = null;
    }
    for (const file of tempFiles.splice(0)) {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    }
  });

  function openTempPrisma(dbFile: string) {
    const libsql = createClient({ url: `file:${dbFile}` });
    const adapter = new PrismaLibSQL(libsql);
    const prisma = new PrismaClient({ adapter });
    return { libsql, prisma };
  }

  it('rolls back RoadmapItem.slug in SQLite if SlugRedirect table is missing instead of leaving partial update', async () => {
    const dbFile = path.join(os.tmpdir(), `slug-tx-rollback-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    tempFiles.push(dbFile);
    const { libsql, prisma } = openTempPrisma(dbFile);
    testState.client = prisma;

    await libsql.batch(
      [
        `CREATE TABLE "Roadmap" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "slug" TEXT NOT NULL UNIQUE,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "icon" TEXT DEFAULT 'Layers',
          "order" INTEGER NOT NULL DEFAULT 0,
          "isLocked" BOOLEAN NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE "RoadmapItem" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "roadmapId" TEXT NOT NULL,
          "slug" TEXT NOT NULL UNIQUE,
          "section" TEXT,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "content" TEXT,
          "order" INTEGER NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'known',
          "statusUpdatedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        {
          sql: `INSERT INTO "Roadmap" ("id", "slug", "title", "order") VALUES ('topic-kb', 'ai-rag', 'AI & RAG', 1)`,
          args: [],
        },
        {
          sql: `INSERT INTO "RoadmapItem" ("id", "roadmapId", "slug", "section", "title", "order")
                VALUES ('kb-core-01', 'topic-kb', 'knowledge-base-kb', 'Core', 'Knowledge Base (KB)', 1)`,
          args: [],
        },
      ],
      'write'
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PATCH(
      new NextRequest('http://localhost/api/v1/roadmaps/items/kb-core-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'knowledge-base' }),
      }),
      { params: Promise.resolve({ id: 'kb-core-01' }) }
    );
    errSpy.mockRestore();

    expect(res.status).toBe(500);

    const afterFail = await prisma.roadmapItem.findUnique({ where: { id: 'kb-core-01' } });
    expect(afterFail?.slug).toBe('knowledge-base-kb');

    libsql.close();
  });

  it('commits slug change + SlugRedirect atomically and populates sectionNames in getAllTopicsMeta', async () => {
    const dbFile = path.join(os.tmpdir(), `slug-tx-commit-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    tempFiles.push(dbFile);
    const { libsql, prisma } = openTempPrisma(dbFile);
    testState.client = prisma;

    await libsql.batch(
      [
        `CREATE TABLE "Roadmap" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "slug" TEXT NOT NULL UNIQUE,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "icon" TEXT DEFAULT 'Layers',
          "order" INTEGER NOT NULL DEFAULT 0,
          "isLocked" BOOLEAN NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE "RoadmapItem" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "roadmapId" TEXT NOT NULL,
          "slug" TEXT NOT NULL UNIQUE,
          "section" TEXT,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "content" TEXT,
          "order" INTEGER NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'known',
          "statusUpdatedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE "SlugRedirect" (
          "fromSlug" TEXT NOT NULL PRIMARY KEY,
          "entity" TEXT NOT NULL,
          "targetId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        {
          sql: `INSERT INTO "Roadmap" ("id", "slug", "title", "order") VALUES ('topic-kb', 'ai-rag', 'AI & RAG', 1)`,
          args: [],
        },
        {
          sql: `INSERT INTO "Roadmap" ("id", "slug", "title", "order") VALUES ('topic-db', 'db-internals', 'Database Internals', 2)`,
          args: [],
        },
        {
          sql: `INSERT INTO "RoadmapItem" ("id", "roadmapId", "slug", "section", "title", "order")
                VALUES ('kb-core-01', 'topic-kb', 'knowledge-base-kb', 'Core', 'Knowledge Base (KB)', 1)`,
          args: [],
        },
        {
          sql: `INSERT INTO "RoadmapItem" ("id", "roadmapId", "slug", "section", "title", "order")
                VALUES ('db-01', 'topic-db', 'btree-index', 'Indexing', 'B-Tree Index', 1)`,
          args: [],
        },
        {
          sql: `INSERT INTO "RoadmapItem" ("id", "roadmapId", "slug", "section", "title", "order")
                VALUES ('db-02', 'topic-db', 'wal-log', 'Storage Engine', 'WAL Log', 2)`,
          args: [],
        },
      ],
      'write'
    );

    const res = await PATCH(
      new NextRequest('http://localhost/api/v1/roadmaps/items/kb-core-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'knowledge-base' }),
      }),
      { params: Promise.resolve({ id: 'kb-core-01' }) }
    );
    expect(res.status).toBe(200);

    const oldResolution = await resolveLessonGlobal('knowledge-base-kb');
    expect(oldResolution).toEqual({ kind: 'redirect', toSlug: 'knowledge-base' });

    const newResolution = await resolveLessonGlobal('knowledge-base');
    expect(newResolution.kind).toBe('found');

    const topics = await getAllTopicsMeta();
    expect(topics.map((t) => ({ slug: t.slug, sectionNames: t.sectionNames }))).toEqual([
      { slug: 'ai-rag', sectionNames: ['Core'] },
      { slug: 'db-internals', sectionNames: ['Indexing', 'Storage Engine'] },
    ]);

    libsql.close();
  });
});
