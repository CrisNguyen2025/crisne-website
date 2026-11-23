// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

const ragReindex = vi.hoisted(() => ({ notifyRoadmapChanged: vi.fn() }));
vi.mock("@/lib/roadmap/rag-reindex", () => ragReindex);

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/news/[id]/integrate/route";
import { extractProvenanceKeys } from "@/lib/provenance/markers";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (id: string, body: unknown) =>
  new NextRequest(`http://localhost/api/news/${id}/integrate`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const statements = [
  { text: "Turbopack ổn định cho cả dev và build.", excerpt: "Turbopack ổn định cho cả dev và build.", authorType: "ai_generated" },
  { text: "HMR nhanh hơn rõ rệt.", excerpt: "Cải thiện tốc độ HMR đáng kể.", authorType: "ai_assisted" },
];

async function cleanUp() {
  await prisma.knowledgeProvenance.deleteMany();
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
  await prisma.roadmapItem.deleteMany();
  await prisma.roadmap.deleteMany();
}

async function seed(overrides: { ingestStatus?: string; reviewStatus?: string } = {}) {
  const roadmap = await prisma.roadmap.create({ data: { slug: "nextjs", title: "Next.js" } });
  const source = await prisma.newsSource.create({
    data: { name: "Next.js Blog", feedUrl: "https://nextjs.org/feed.xml", domain: "nextjs.org" },
  });
  const newsItem = await prisma.newsItem.create({
    data: {
      sourceUrl: "https://nextjs.org/blog/next-16",
      canonicalUrl: "https://nextjs.org/blog/next-16",
      domain: "nextjs.org",
      platform: "article",
      origin: "cron",
      sourceId: source.id,
      title: "Next.js 16",
      ingestStatus: overrides.ingestStatus ?? "ready",
      reviewStatus: overrides.reviewStatus ?? "draft",
      extractedAt: new Date("2026-11-21T08:00:00Z"),
    },
  });
  return { roadmap, newsItem };
}

describe("POST /api/news/[id]/integrate (ADR-0017)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("rejects callers without write access before reading anything", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const res = await POST(postReq("x", { mode: "append_to_lesson", lessonId: "y", statements }), ctx("x"));
    expect(res.status).toBe(401);
  });

  it("creates a target Lesson whose content has one marker per statement", async () => {
    const { roadmap, newsItem } = await seed();
    const res = await POST(
      postReq(newsItem.id, { mode: "create_lesson", roadmapSlug: "nextjs", section: "Build", title: "Turbopack", statements }),
      ctx(newsItem.id)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.provenanceCount).toBe(2);
    expect(body.lesson.roadmapSlug).toBe("nextjs");

    const lesson = await prisma.roadmapItem.findUniqueOrThrow({ where: { id: body.lesson.id } });
    expect(lesson.roadmapId).toBe(roadmap.id);
    expect(lesson.status).toBe("target");
    expect(lesson.section).toBe("Build");
    const keys = extractProvenanceKeys(lesson.content);
    expect(keys).toHaveLength(2);

    const rows = await prisma.knowledgeProvenance.findMany({ where: { lessonId: lesson.id } });
    expect(rows.map((r) => r.claimRefKey).sort()).toEqual([...keys].sort());
    const first = rows.find((r) => r.excerpt === statements[0].excerpt)!;
    expect(first).toMatchObject({
      newsItemId: newsItem.id,
      sourceName: "Next.js Blog",
      sourceUrl: "https://nextjs.org/blog/next-16",
      sourceTitle: "Next.js 16",
      authorType: "ai_generated",
      relationType: "derived_from",
    });
    expect(first.collectedAt.toISOString()).toBe(newsItem.createdAt.toISOString());
    expect(first.extractedAt?.toISOString()).toBe("2026-11-21T08:00:00.000Z");
    expect(ragReindex.notifyRoadmapChanged).toHaveBeenCalledTimes(1);
  });

  it("does not create a second Lesson when the same request is sent twice", async () => {
    const { newsItem } = await seed();
    const body = { mode: "create_lesson", roadmapSlug: "nextjs", title: "Turbopack", statements };
    expect((await POST(postReq(newsItem.id, body), ctx(newsItem.id))).status).toBe(201);
    const second = await POST(postReq(newsItem.id, body), ctx(newsItem.id));
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("DUPLICATE");
    expect(await prisma.roadmapItem.count()).toBe(1);
    expect(await prisma.knowledgeProvenance.count()).toBe(2);
    expect(ragReindex.notifyRoadmapChanged).toHaveBeenCalledTimes(1);
  });

  it("appends to an existing Lesson, keeps its status, and refuses a second append", async () => {
    const { roadmap, newsItem } = await seed();
    const existing = await prisma.roadmapItem.create({
      data: { roadmapId: roadmap.id, slug: "app-router", title: "App Router", content: "<p>Nội dung cũ</p>", status: "known" },
    });

    const res = await POST(
      postReq(newsItem.id, { mode: "append_to_lesson", lessonId: existing.id, statements: [statements[0]] }),
      ctx(newsItem.id)
    );
    expect(res.status).toBe(201);
    const updated = await prisma.roadmapItem.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated.status).toBe("known");
    expect(updated.content?.startsWith("<p>Nội dung cũ</p><p>Turbopack")).toBe(true);
    expect(extractProvenanceKeys(updated.content)).toHaveLength(1);

    const again = await POST(
      postReq(newsItem.id, { mode: "append_to_lesson", lessonId: existing.id, statements: [statements[1]] }),
      ctx(newsItem.id)
    );
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_INTEGRATED");
    expect(await prisma.knowledgeProvenance.count()).toBe(1);
  });

  it("refuses items that are not ready or were dismissed", async () => {
    const pending = await seed({ ingestStatus: "processing" });
    const r1 = await POST(
      postReq(pending.newsItem.id, { mode: "create_lesson", roadmapSlug: "nextjs", title: "A", statements }),
      ctx(pending.newsItem.id)
    );
    await cleanUp();
    const dismissed = await seed({ reviewStatus: "dismissed" });
    const r2 = await POST(
      postReq(dismissed.newsItem.id, { mode: "create_lesson", roadmapSlug: "nextjs", title: "A", statements }),
      ctx(dismissed.newsItem.id)
    );
    expect([r1.status, r2.status]).toEqual([409, 409]);
    expect(await prisma.roadmapItem.count()).toBe(0);
  });

  it("validates the body and returns 404 for unknown targets", async () => {
    const { newsItem } = await seed();
    const tooMany = Array.from({ length: 11 }, () => statements[0]);
    const invalid = await POST(
      postReq(newsItem.id, { mode: "create_lesson", roadmapSlug: "nextjs", title: "A", statements: tooMany }),
      ctx(newsItem.id)
    );
    const noTopic = await POST(
      postReq(newsItem.id, { mode: "create_lesson", roadmapSlug: "khong-co", title: "A", statements }),
      ctx(newsItem.id)
    );
    const noLesson = await POST(
      postReq(newsItem.id, { mode: "append_to_lesson", lessonId: "khong-co", statements }),
      ctx(newsItem.id)
    );
    const noItem = await POST(postReq("khong-co", { mode: "append_to_lesson", lessonId: "x", statements }), ctx("khong-co"));
    expect([invalid.status, noTopic.status, noLesson.status, noItem.status]).toEqual([400, 404, 404, 404]);
    expect(await prisma.knowledgeProvenance.count()).toBe(0);
  });

  it("rolls the Lesson back when writing provenance fails", async () => {
    const { newsItem } = await seed();
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (fn: (tx: unknown) => Promise<unknown>) =>
      (prisma.$transaction as unknown as (f: typeof fn) => Promise<unknown>).call(prisma, async (tx: unknown) => {
        await fn(tx);
        throw new Error("boom after writes");
      })) as never);
    const res = await POST(
      postReq(newsItem.id, { mode: "create_lesson", roadmapSlug: "nextjs", title: "Rollback", statements }),
      ctx(newsItem.id)
    );
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.roadmapItem.count()).toBe(0);
    expect(await prisma.knowledgeProvenance.count()).toBe(0);
    expect(ragReindex.notifyRoadmapChanged).not.toHaveBeenCalled();
  });
});
