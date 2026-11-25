import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);
vi.mock("@/lib/roadmap/rag-reindex", () => ({
  notifyRoadmapChanged: vi.fn(),
  requestRagReindex: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { canonicalLessonPair } from "@/lib/provenance/relations";
import { POST as integratePost } from "@/app/api/news/[id]/integrate/route";
import { POST as matchLessonsPost } from "@/app/api/news/[id]/match-lessons/route";
import {
  DELETE as relationsDelete,
  GET as relationsGet,
  POST as relationsPost,
} from "@/app/api/v1/roadmaps/items/[id]/relations/route";
import { GET as batchProvenanceGet } from "@/app/api/v1/roadmaps/provenance-by-lessons/route";

const jsonReq = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanDb() {
  await prisma.knowledgeRelation.deleteMany();
  await prisma.knowledgeProvenance.deleteMany();
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.roadmapItem.deleteMany();
  await prisma.roadmap.deleteMany();
}

describe("Phase 3 KnowledgeRelation, match-lessons & batch provenance routes", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanDb();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await cleanDb();
    await prisma.$disconnect();
  });

  it("canonicalizes symmetric lesson pairs and rejects self-relations", () => {
    expect(canonicalLessonPair("lesson-b", "lesson-a")).toEqual(["lesson-a", "lesson-b"]);
    expect(() => canonicalLessonPair("lesson-a", "lesson-a")).toThrow();
  });

  it("blocks unauthorized callers on relations, provenance-by-lessons, and match-lessons", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const responses = await Promise.all([
      relationsGet(jsonReq("http://localhost/api/v1/roadmaps/items/l1/relations", "GET"), idCtx("l1")),
      relationsPost(
        jsonReq("http://localhost/api/v1/roadmaps/items/l1/relations", "POST", {
          targetLessonId: "l2",
        }),
        idCtx("l1")
      ),
      batchProvenanceGet(
        jsonReq("http://localhost/api/v1/roadmaps/provenance-by-lessons?lessonIds=l1", "GET")
      ),
      matchLessonsPost(
        jsonReq("http://localhost/api/news/n1/match-lessons", "POST"),
        idCtx("n1")
      ),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });

  it("creates, deduplicates, reads symmetrically, and deletes KnowledgeRelation", async () => {
    const topic = await prisma.roadmap.create({
      data: { slug: "ai-arch", title: "AI Architecture" },
    });
    const l1 = await prisma.roadmapItem.create({
      data: { roadmapId: topic.id, slug: "hybrid-rag", title: "Hybrid RAG", section: "Retrieval" },
    });
    const l2 = await prisma.roadmapItem.create({
      data: { roadmapId: topic.id, slug: "reranking", title: "Reranking", section: "Retrieval" },
    });

    const p1 = await relationsPost(
      jsonReq(`http://localhost/api/v1/roadmaps/items/${l2.id}/relations`, "POST", {
        targetLessonId: l1.id,
      }),
      idCtx(l2.id)
    );
    expect(p1.status).toBe(201);

    const p2 = await relationsPost(
      jsonReq(`http://localhost/api/v1/roadmaps/items/${l1.id}/relations`, "POST", {
        targetLessonId: l2.id,
      }),
      idCtx(l1.id)
    );
    expect(p2.status).toBe(201);
    expect(await prisma.knowledgeRelation.count()).toBe(1);

    const fromL1 = await (
      await relationsGet(
        jsonReq(`http://localhost/api/v1/roadmaps/items/${l1.id}/relations`, "GET"),
        idCtx(l1.id)
      )
    ).json();
    expect(fromL1.relations).toEqual([
      {
        lessonId: l2.id,
        lessonSlug: "reranking",
        title: "Reranking",
        roadmapSlug: "ai-arch",
        roadmapTitle: "AI Architecture",
        section: "Retrieval",
        relationType: "relates",
      },
    ]);

    const del = await relationsDelete(
      jsonReq(
        `http://localhost/api/v1/roadmaps/items/${l1.id}/relations?targetLessonId=${l2.id}`,
        "DELETE"
      ),
      idCtx(l1.id)
    );
    expect(del.status).toBe(200);
    expect(await prisma.knowledgeRelation.count()).toBe(0);
  });

  it("integrates NewsItem with relatedLessonIds, serves batch provenance, and proxies match-lessons", async () => {
    const topic = await prisma.roadmap.create({
      data: { slug: "nextjs-topic", title: "Next.js" },
    });
    const existingLesson = await prisma.roadmapItem.create({
      data: { roadmapId: topic.id, slug: "rsc-basics", title: "RSC Basics", section: "Core" },
    });
    const news = await prisma.newsItem.create({
      data: {
        sourceUrl: "https://vercel.com/blog/next-16-2",
        canonicalUrl: "https://vercel.com/blog/next-16-2",
        domain: "vercel.com",
        platform: "article",
        origin: "manual",
        title: "Next.js 16.2 Release",
        tldr: "Faster caching",
        takeaways: JSON.stringify(["New use cache directive"]),
        tags: JSON.stringify(["nextjs"]),
        ingestStatus: "ready",
        reviewStatus: "published",
      },
    });

    const intRes = await integratePost(
      jsonReq(`http://localhost/api/news/${news.id}/integrate`, "POST", {
        mode: "create_lesson",
        roadmapSlug: "nextjs-topic",
        section: "Core",
        title: "Next.js 16.2 Caching",
        statements: [
          {
            text: "Next.js 16.2 bổ sung use cache.",
            excerpt: "New use cache directive",
            authorType: "ai_generated",
          },
        ],
        relatedLessonIds: [existingLesson.id],
      }),
      idCtx(news.id)
    );
    expect(intRes.status).toBe(201);
    const createdLessonId = (await intRes.json()).lesson.id as string;

    expect(await prisma.knowledgeRelation.count()).toBe(1);

    const provRes = await batchProvenanceGet(
      jsonReq(
        `http://localhost/api/v1/roadmaps/provenance-by-lessons?lessonIds=${createdLessonId},${existingLesson.id}`,
        "GET"
      )
    );
    expect(provRes.status).toBe(200);
    const provBody = await provRes.json();
    expect(provBody.byLessonId[createdLessonId]).toHaveLength(1);
    expect(provBody.byLessonId[createdLessonId][0]).toMatchObject({
      sourceName: "vercel.com",
      sourceUrl: "https://vercel.com/blog/next-16-2",
      sourceTitle: "Next.js 16.2 Release",
      relationType: "derived_from",
    });
    expect(provBody.byLessonId[existingLesson.id]).toBeUndefined();

    vi.stubEnv("RAG_SERVICE_URL", "http://rag.internal");
    vi.stubEnv("RAG_INTERNAL_KEY", "secret-rag-key");
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          suggested_topic_slug: "nextjs-topic",
          suggested_topic_title: "Next.js",
          suggested_section: "Core",
          matches: [
            {
              lesson_id: existingLesson.id,
              lesson_slug: "rsc-basics",
              title: "RSC Basics",
              topic_slug: "nextjs-topic",
              topic_title: "Next.js",
              section: "Core",
              score: 0.031,
              duplicate_warning: false,
              version_update_hint: true,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const matchRes = await matchLessonsPost(
      jsonReq(`http://localhost/api/news/${news.id}/match-lessons`, "POST"),
      idCtx(news.id)
    );
    expect(matchRes.status).toBe(200);
    const matchBody = await matchRes.json();
    expect(matchBody.suggestedTopicSlug).toBe("nextjs-topic");
    expect(matchBody.matches[0].versionUpdateHint).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://rag.internal/internal/match-lessons",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-internal-key": "secret-rag-key" }),
      })
    );
  });
});
