// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import dns from "node:dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { POST as ingestPost } from "@/app/api/ingest/route";
import { GET as newsListGet } from "@/app/api/news/route";
import { POST as markReadPost } from "@/app/api/news/mark-read/route";
import {
  DELETE as newsItemDelete,
  GET as newsItemGet,
  PATCH as newsItemPatch,
} from "@/app/api/news/[id]/route";

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });

const idContext = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanNewsTables() {
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
}

describe("news feed query & item [id] GET/PATCH routes", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await cleanNewsTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await cleanNewsTables();
    await prisma.$disconnect();
  });

  it("rejects unauthorized callers on GET and PATCH /api/news/[id]", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const [getRes, patchRes, deleteRes, markReadRes] = await Promise.all([
      newsItemGet(jsonRequest("http://localhost/api/news/item-1", "GET"), idContext("item-1")),
      newsItemPatch(
        jsonRequest("http://localhost/api/news/item-1", "PATCH", { readState: "read" }),
        idContext("item-1")
      ),
      newsItemDelete(jsonRequest("http://localhost/api/news/item-1", "DELETE"), idContext("item-1")),
      markReadPost(jsonRequest("http://localhost/api/news/mark-read", "POST", {})),
    ]);

    expect(getRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
    expect(markReadRes.status).toBe(401);
  });

  it("filters GET /api/news by view, origin, tag, accent-insensitive q, and sort=curated_first", async () => {
    const t0 = new Date("2026-11-20T08:00:00Z");
    const t1 = new Date("2026-11-20T09:00:00Z");
    const t2 = new Date("2026-11-20T10:00:00Z");
    const t3 = new Date("2026-11-20T11:00:00Z");

    const itemCronNewest = await prisma.newsItem.create({
      data: {
        sourceUrl: "https://github.com/vercel/next.js",
        canonicalUrl: "https://github.com/vercel/next.js",
        domain: "github.com",
        platform: "article",
        origin: "cron",
        title: "Cập nhật Next.js 16.2 mới nhất",
        tldr: "Tối ưu Turbopack và caching.",
        tags: JSON.stringify(["nextjs", "frontend"]),
        ingestStatus: "ready",
        reviewStatus: "published",
        readState: "unread",
        isSaved: false,
        createdAt: t3,
      },
    });

    const itemShareOlder = await prisma.newsItem.create({
      data: {
        sourceUrl: "https://youtube.com/watch?v=vidShare1",
        canonicalUrl: "https://youtube.com/watch?v=vidShare1",
        domain: "youtube.com",
        platform: "youtube",
        origin: "share",
        title: "Hướng dẫn Agentic RAG",
        tldr: "Tối ưu truy vấn vector.",
        tags: JSON.stringify(["ai", "rag"]),
        ingestStatus: "ready",
        reviewStatus: "published",
        readState: "unread",
        isSaved: true,
        possibleDuplicateOfId: itemCronNewest.id,
        createdAt: t1,
      },
    });

    await prisma.newsItem.create({
      data: {
        sourceUrl: "https://dev.to/post-read",
        canonicalUrl: "https://dev.to/post-read",
        domain: "dev.to",
        platform: "article",
        origin: "manual",
        title: "Bài đã đọc và đã lưu",
        tags: JSON.stringify(["ai"]),
        ingestStatus: "ready",
        reviewStatus: "published",
        readState: "read",
        isSaved: true,
        createdAt: t2,
      },
    });

    await prisma.newsItem.create({
      data: {
        sourceUrl: "https://substack.com/draft-1",
        canonicalUrl: "https://substack.com/draft-1",
        domain: "substack.com",
        platform: "article",
        origin: "cron",
        title: "Tin cron đang chờ duyệt",
        tags: JSON.stringify(["devops"]),
        ingestStatus: "queued",
        reviewStatus: "draft",
        readState: "unread",
        isSaved: false,
        createdAt: t0,
      },
    });

    // view=unread -> 2 published unread items + duplicateTitles map populated
    const unreadRes = await newsListGet(jsonRequest("http://localhost/api/news?view=unread", "GET"));
    const unreadData = await unreadRes.json();
    expect(unreadRes.status).toBe(200);
    expect(unreadData.items.map((i: { id: string }) => i.id)).toEqual([
      itemCronNewest.id,
      itemShareOlder.id,
    ]);
    expect(unreadData.duplicateTitles[itemCronNewest.id]).toBe("Cập nhật Next.js 16.2 mới nhất");
    // total counts every item, drafts included, to match the "Tất cả" tab
    expect(unreadData.counts).toMatchObject({
      total: 4,
      unread: 2,
      saved: 2,
      draft: 1,
      queue: 1,
    });
    expect(unreadData.tags).toEqual(
      expect.arrayContaining([
        { tag: "ai", count: 1 },
        { tag: "nextjs", count: 1 },
      ])
    );

    // sort=curated_first puts share before newer cron
    const curatedRes = await newsListGet(
      jsonRequest("http://localhost/api/news?view=unread&sort=curated_first", "GET")
    );
    const curatedData = await curatedRes.json();
    expect(curatedData.items.map((i: { id: string }) => i.id)).toEqual([
      itemShareOlder.id,
      itemCronNewest.id,
    ]);

    // view=saved + tag=ai
    const savedAiRes = await newsListGet(
      jsonRequest("http://localhost/api/news?view=saved&tag=ai", "GET")
    );
    const savedAiData = await savedAiRes.json();
    expect(savedAiData.items).toHaveLength(2);
    expect(savedAiData.tags).toEqual(expect.arrayContaining([{ tag: "ai", count: 2 }]));

    // view=draft
    const draftRes = await newsListGet(jsonRequest("http://localhost/api/news?view=draft", "GET"));
    const draftData = await draftRes.json();
    expect(draftData.items).toHaveLength(1);
    expect(draftData.items[0].origin).toBe("cron");

    // view=queue
    const queueRes = await newsListGet(jsonRequest("http://localhost/api/news?view=queue", "GET"));
    expect((await queueRes.json()).items).toHaveLength(1);

    // Accent-insensitive search q="huong dan"
    const searchRes = await newsListGet(
      jsonRequest("http://localhost/api/news?view=all&q=huong%20dan", "GET")
    );
    const searchData = await searchRes.json();
    expect(searchData.items).toHaveLength(1);
    expect(searchData.items[0].id).toBe(itemShareOlder.id);
  });

  it("validates PATCH /api/news/[id], updates state/tags/note, and keeps dismissed URLs deduped", async () => {
    const created = await prisma.newsItem.create({
      data: {
        sourceUrl: "https://github.com/vercel/ai",
        canonicalUrl: "https://github.com/vercel/ai",
        domain: "github.com",
        platform: "article",
        origin: "cron",
        title: "Vercel AI SDK",
        tags: JSON.stringify(["ai"]),
        ingestStatus: "ready",
        reviewStatus: "draft",
        readState: "unread",
        isSaved: false,
      },
    });

    // Empty body -> 400
    const emptyPatch = await newsItemPatch(
      jsonRequest(`http://localhost/api/news/${created.id}`, "PATCH", {}),
      idContext(created.id)
    );
    expect(emptyPatch.status).toBe(400);

    // Missing id -> 404
    const missingGet = await newsItemGet(
      jsonRequest("http://localhost/api/news/nonexistent", "GET"),
      idContext("nonexistent")
    );
    expect(missingGet.status).toBe(404);

    // Approve draft + save + mark read + update tags + save personalNote
    const updateRes = await newsItemPatch(
      jsonRequest(`http://localhost/api/news/${created.id}`, "PATCH", {
        reviewStatus: "published",
        readState: "read",
        isSaved: true,
        tags: ["AI", " SDK ", "ai"],
        personalNote: "  Dùng tham khảo cho Phase 3  ",
      }),
      idContext(created.id)
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()).item;
    expect(updated.reviewStatus).toBe("published");
    expect(updated.readState).toBe("read");
    expect(updated.isSaved).toBe(true);
    expect(updated.tags).toEqual(["ai", "sdk"]);
    expect(updated.personalNote).toBe("Dùng tham khảo cho Phase 3");

    // Whitespace personalNote clears to null
    const clearNoteRes = await newsItemPatch(
      jsonRequest(`http://localhost/api/news/${created.id}`, "PATCH", {
        personalNote: "   ",
      }),
      idContext(created.id)
    );
    expect((await clearNoteRes.json()).item.personalNote).toBeNull();

    // Dismiss moves the item from the inbox to done while POST /api/ingest still reports duplicate
    const dismissRes = await newsItemPatch(
      jsonRequest(`http://localhost/api/news/${created.id}`, "PATCH", {
        reviewStatus: "dismissed",
      }),
      idContext(created.id)
    );
    expect(dismissRes.status).toBe(200);

    const listInbox = await newsListGet(jsonRequest("http://localhost/api/news?view=inbox", "GET"));
    expect((await listInbox.json()).items).toHaveLength(0);
    const listDone = await newsListGet(jsonRequest("http://localhost/api/news?view=done", "GET"));
    expect((await listDone.json()).items).toHaveLength(1);

    const reIngest = await ingestPost(
      jsonRequest("http://localhost/api/ingest", "POST", {
        url: "https://github.com/vercel/ai",
        origin: "cron",
      })
    );
    expect(reIngest.status).toBe(200);
    expect((await reIngest.json()).status).toBe("duplicate");

    // View=dismissed exposes dismissed items, and DELETE /api/news/[id] removes the item permanently
    const listDismissed = await newsListGet(
      jsonRequest("http://localhost/api/news?view=dismissed", "GET")
    );
    expect((await listDismissed.json()).items).toHaveLength(1);

    const deleteRes = await newsItemDelete(
      jsonRequest(`http://localhost/api/news/${created.id}`, "DELETE"),
      idContext(created.id)
    );
    expect(deleteRes.status).toBe(200);
    expect(await prisma.newsItem.count()).toBe(0);

    const missingDelete = await newsItemDelete(
      jsonRequest(`http://localhost/api/news/${created.id}`, "DELETE"),
      idContext(created.id)
    );
    expect(missingDelete.status).toBe(404);
  });

  it("supports contentType, readState, and POST /api/news/mark-read", async () => {
    await prisma.newsItem.createMany({
      data: [
        {
          sourceUrl: "https://github.com/a/tip",
          canonicalUrl: "https://github.com/a/tip",
          domain: "github.com",
          platform: "article",
          origin: "manual",
          title: "Tip 1",
          tags: JSON.stringify(["tip", "nextjs"]),
          reviewStatus: "published",
          readState: "unread",
          isSaved: false,
        },
        {
          sourceUrl: "https://github.com/a/tut",
          canonicalUrl: "https://github.com/a/tut",
          domain: "github.com",
          platform: "article",
          origin: "manual",
          title: "Tutorial 1",
          tags: JSON.stringify(["tutorial", "ai"]),
          reviewStatus: "published",
          readState: "read",
          isSaved: false,
        },
      ],
    });

    const byType = await newsListGet(
      jsonRequest("http://localhost/api/news?view=inbox&contentType=tip&readState=unread", "GET")
    );
    const byTypeData = await byType.json();
    expect(byTypeData.items.map((i: { title: string }) => i.title)).toEqual(["Tip 1"]);

    const markRes = await markReadPost(
      jsonRequest("http://localhost/api/news/mark-read", "POST", { view: "inbox" })
    );
    expect(markRes.status).toBe(200);
    expect((await markRes.json()).updated).toBe(1);

    const unreadAfter = await newsListGet(
      jsonRequest("http://localhost/api/news?view=inbox&readState=unread", "GET")
    );
    expect((await unreadAfter.json()).items).toHaveLength(0);
  });

  it("toggles isPublic with publicAt and rejects publishing unfinished or dismissed items", async () => {
    const createItem = (overrides: { canonicalUrl: string; ingestStatus: string; reviewStatus?: string }) =>
      prisma.newsItem.create({
        data: {
          sourceUrl: overrides.canonicalUrl,
          canonicalUrl: overrides.canonicalUrl,
          domain: "nextjs.org",
          platform: "article",
          origin: "cron",
          title: "Next.js 16.4",
          ingestStatus: overrides.ingestStatus,
          reviewStatus: overrides.reviewStatus ?? "draft",
        },
      });
    const ready = await createItem({ canonicalUrl: "https://nextjs.org/blog/a", ingestStatus: "ready" });
    const queued = await createItem({ canonicalUrl: "https://nextjs.org/blog/b", ingestStatus: "queued" });
    const dismissed = await createItem({
      canonicalUrl: "https://nextjs.org/blog/c",
      ingestStatus: "ready",
      reviewStatus: "dismissed",
    });
    const patch = (id: string, body: unknown) =>
      newsItemPatch(jsonRequest(`http://localhost/api/news/${id}`, "PATCH", body), idContext(id));

    const publishRes = await patch(ready.id, { isPublic: true });
    expect(publishRes.status).toBe(200);
    const published = (await publishRes.json()).item;
    expect(published.isPublic).toBe(true);
    expect(published.publicAt).not.toBeNull();

    const unpublishRes = await patch(ready.id, { isPublic: false });
    const unpublished = (await unpublishRes.json()).item;
    expect(unpublished.isPublic).toBe(false);
    expect(unpublished.publicAt).toBeNull();

    expect((await patch(queued.id, { isPublic: true })).status).toBe(400);
    expect((await patch(dismissed.id, { isPublic: true })).status).toBe(400);
    const stillPrivate = await prisma.newsItem.findUniqueOrThrow({ where: { id: queued.id } });
    expect(stillPrivate.isPublic).toBe(false);
  });
});
