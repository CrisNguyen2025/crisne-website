// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const access = vi.hoisted(() => ({ asOwner: true }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/auth/write-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/write-access")>();
  return {
    ...actual,
    requireWriteAccess: vi.fn(async (req: Request) =>
      access.asOwner ? null : actual.requireWriteAccess(req)
    ),
  };
});

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/v1/search/route";
import { buildStatementsHtml, createClaimRefKey } from "@/lib/provenance/markers";

const getReq = (query = "", headers?: Record<string, string>) =>
  new NextRequest(`http://localhost/api/v1/search${query}`, { headers });

async function cleanUp() {
  await prisma.knowledgeProvenance.deleteMany();
  await prisma.roadmapItem.deleteMany();
  await prisma.roadmap.deleteMany();
  await prisma.newsItem.deleteMany();
}

describe("GET /api/v1/search", () => {
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

  it("returns 401 when unauthenticated or given an invalid admin key", async () => {
    access.asOwner = false;
    const anon = await GET(getReq("?q=rag"));
    const badKey = await GET(getReq("?q=rag", { "x-admin-key": "wrong" }));
    expect([anon.status, badKey.status]).toEqual([401, 401]);
  });

  it("returns zero-query suggestions prioritizing learning/target lessons", async () => {
    const topic = await prisma.roadmap.create({
      data: { slug: "ai-arch", title: "AI Architecture", description: "Hệ thống AI" },
    });
    await prisma.roadmapItem.createMany({
      data: [
        { roadmapId: topic.id, slug: "bai-known", title: "Bài đã nắm", status: "known", order: 1 },
        { roadmapId: topic.id, slug: "bai-learning", title: "Bài đang học", status: "learning", order: 2 },
        { roadmapId: topic.id, slug: "bai-target", title: "Bài mục tiêu", status: "target", order: 3 },
      ],
    });
    await prisma.newsItem.createMany({
      data: [
        {
          sourceUrl: "https://example.com/1",
          canonicalUrl: "https://example.com/1",
          domain: "example.com",
          platform: "article",
          origin: "share",
          title: "Tin đã lưu",
          isSaved: true,
          reviewStatus: "published",
        },
        {
          sourceUrl: "https://example.com/2",
          canonicalUrl: "https://example.com/2",
          domain: "example.com",
          platform: "article",
          origin: "cron",
          title: "Tin bỏ qua",
          reviewStatus: "dismissed",
        },
      ],
    });

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();

    expect(body.isZeroQuery).toBe(true);
    expect(body.topics.map((t: { slug: string }) => t.slug)).toEqual(["ai-arch"]);
    expect(body.lessons.map((l: { slug: string }) => l.slug)).toEqual([
      "bai-learning",
      "bai-target",
      "bai-known",
    ]);
    expect(body.news.map((n: { title: string }) => n.title)).toEqual(["Tin đã lưu"]);
  });

  it("searches diacritic-insensitively, links to heading anchors, and hides provenance markers & dismissed news", async () => {
    const topic = await prisma.roadmap.create({
      data: { slug: "llm-sys", title: "LLM Systems", description: "Kiến trúc RAG" },
    });
    const claimKey = createClaimRefKey();
    const htmlWithProvenance = `<h2>Cơ chế Vector</h2>${buildStatementsHtml([
      { text: "Tìm kiếm kết hợp BM25 và embedding", claimRefKey: claimKey },
    ])}`;

    await prisma.roadmapItem.createMany({
      data: [
        {
          roadmapId: topic.id,
          slug: "hybrid-retrieval",
          section: "Retrieval",
          title: "Hybrid Retrieval",
          content: htmlWithProvenance,
          status: "learning",
          order: 1,
        },
        {
          roadmapId: topic.id,
          slug: "bm25-basics",
          section: "Tìm kiếm",
          title: "BM25 Basics",
          description: "Cơ bản về từ khoá",
          status: "target",
          order: 2,
        },
      ],
    });

    await prisma.newsItem.createMany({
      data: [
        {
          sourceUrl: "https://example.com/bm25",
          canonicalUrl: "https://example.com/bm25",
          domain: "example.com",
          platform: "article",
          origin: "manual",
          title: "Tối ưu BM25 cho tiếng Việt",
          tldr: "Benchmark hybrid search với BM25",
          tags: JSON.stringify(["bm25", "search"]),
          reviewStatus: "published",
        },
        {
          sourceUrl: "https://example.com/dismissed",
          canonicalUrl: "https://example.com/dismissed",
          domain: "example.com",
          platform: "article",
          origin: "cron",
          title: "BM25 bị bỏ qua",
          reviewStatus: "dismissed",
        },
      ],
    });

    const res = await GET(getReq("?q=bm25"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.lessons[0].slug).toBe("bm25-basics");
    const hybridHit = body.lessons.find((l: { slug: string }) => l.slug === "hybrid-retrieval");
    expect(hybridHit).toBeDefined();
    expect(hybridHit.href).toBe("/llm-sys/hybrid-retrieval#co-che-vector");
    expect(hybridHit.matchedHeading).toBe("Cơ chế Vector");
    expect(hybridHit.snippet.text).not.toContain(claimKey);
    expect(hybridHit.snippet.text).not.toContain("data-provenance-ref");

    expect(body.news).toHaveLength(1);
    expect(body.news[0].title).toBe("Tối ưu BM25 cho tiếng Việt");
    expect(body.news[0].href).toMatch(/^\/news\?view=all&item=/);
  });
});
