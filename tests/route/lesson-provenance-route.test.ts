// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Owner by default; with `asOwner = false` the real guard runs (no session, admin key checked by value)
const access = vi.hoisted(() => ({ asOwner: true }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/auth/write-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/write-access")>();
  return {
    ...actual,
    requireWriteAccess: vi.fn(async (req: Request) => (access.asOwner ? null : actual.requireWriteAccess(req))),
  };
});

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/v1/roadmaps/items/[id]/provenance/route";
import { buildStatementsHtml, createClaimRefKey } from "@/lib/provenance/markers";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const getReq = (id: string, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost/api/v1/roadmaps/items/${id}/provenance`, { headers });

async function cleanUp() {
  await prisma.knowledgeProvenance.deleteMany();
  await prisma.roadmapItem.deleteMany();
  await prisma.roadmap.deleteMany();
}

async function seedLesson(slug: string, content: string | null) {
  const roadmap = await prisma.roadmap.upsert({
    where: { slug: "topic-a" },
    update: {},
    create: { slug: "topic-a", title: "Topic A" },
  });
  return prisma.roadmapItem.create({
    data: { roadmapId: roadmap.id, slug, title: `Bài ${slug}`, content, status: "target" },
  });
}

const provenanceRow = (lessonId: string, claimRefKey: string, sourceTitle: string) => ({
  lessonId,
  claimRefKey,
  sourceName: "nextjs.org",
  sourceUrl: "https://nextjs.org/blog/next-16",
  sourceTitle,
  excerpt: "Ý gốc do AI tóm tắt",
  authorType: "ai_generated",
  collectedAt: new Date("2026-11-20T00:00:00Z"),
});

describe("GET /api/v1/roadmaps/items/[id]/provenance (ADR-0017)", () => {
  const originalAdminKey = process.env.ADMIN_API_KEY;

  beforeEach(async () => {
    access.asOwner = true;
    process.env.ADMIN_API_KEY = "test-admin-key-123";
    await cleanUp();
  });

  afterAll(async () => {
    process.env.ADMIN_API_KEY = originalAdminKey;
    await cleanUp();
    await prisma.$disconnect();
  });

  it("returns 401 without a session and with a wrong admin key, before touching data", async () => {
    access.asOwner = false;
    const lesson = await seedLesson("bai-1", null);
    const anonymous = await GET(getReq(lesson.id), ctx(lesson.id));
    const fakeKey = await GET(getReq(lesson.id, { "x-admin-key": "not-the-key" }), ctx(lesson.id));
    expect([anonymous.status, fakeKey.status]).toEqual([401, 401]);
  });

  it("returns 404 for an unknown lesson", async () => {
    const res = await GET(getReq("missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("resolves markers in content order and moves removed markers to orphans", async () => {
    const k1 = createClaimRefKey();
    const k2 = createClaimRefKey();
    const k3 = createClaimRefKey();
    const lesson = await seedLesson(
      "bai-2",
      buildStatementsHtml([
        { text: "Câu ba", claimRefKey: k3 },
        { text: "Câu một", claimRefKey: k1 },
      ])
    );
    await prisma.knowledgeProvenance.createMany({
      data: [provenanceRow(lesson.id, k1, "Một"), provenanceRow(lesson.id, k2, "Hai"), provenanceRow(lesson.id, k3, "Ba")],
    });

    const res = await GET(getReq(lesson.id), ctx(lesson.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body.provenances.map((p: { claimRefKey: string }) => p.claimRefKey)).toEqual([k3, k1]);
    expect(body.orphans.map((p: { claimRefKey: string }) => p.claimRefKey)).toEqual([k2]);
    expect(body.provenances[0]).toEqual({
      claimRefKey: k3,
      sourceName: "nextjs.org",
      sourceUrl: "https://nextjs.org/blog/next-16",
      sourceTitle: "Ba",
      excerpt: "Ý gốc do AI tóm tắt",
      authorType: "ai_generated",
      relationType: "derived_from",
      collectedAt: "2026-11-20T00:00:00.000Z",
      extractedAt: null,
    });
    // Ids stay on the server
    for (const p of [...body.provenances, ...body.orphans]) {
      expect(p).not.toHaveProperty("newsItemId");
      expect(p).not.toHaveProperty("sourceId");
      expect(p).not.toHaveProperty("lessonId");
    }
  });

  it("finds a marker copied into another lesson by its key", async () => {
    const key = createClaimRefKey();
    const origin = await seedLesson("bai-goc", buildStatementsHtml([{ text: "Câu gốc", claimRefKey: key }]));
    await prisma.knowledgeProvenance.create({ data: provenanceRow(origin.id, key, "Gốc") });
    const copy = await seedLesson("bai-copy", buildStatementsHtml([{ text: "Câu gốc", claimRefKey: key }]));

    const body = await (await GET(getReq(copy.id), ctx(copy.id))).json();
    expect(body.provenances.map((p: { claimRefKey: string }) => p.claimRefKey)).toEqual([key]);
    expect(body.orphans).toEqual([]);
  });
});
