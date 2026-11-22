// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import dns from "node:dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { PATCH as newsItemPatch } from "@/app/api/news/[id]/route";
import { POST as cronPost } from "@/app/api/news/cron/route";
import {
  GET as sourcesGet,
  POST as sourcesPost,
} from "@/app/api/news/sources/route";
import {
  DELETE as sourceDelete,
  PATCH as sourcePatch,
} from "@/app/api/news/sources/[id]/route";

const jsonRequest = (
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const idContext = (id: string) => ({ params: Promise.resolve({ id }) });

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Custom Eng Blog</title>
    <item>
      <title>Bài số 1 từ RSS</title>
      <link>https://custom-eng.blog/posts/post-1?utm_source=rss</link>
      <pubDate>Sun, 22 Nov 2026 06:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Bài số 2 từ RSS</title>
      <link>https://custom-eng.blog/posts/post-2</link>
      <pubDate>Sun, 22 Nov 2026 07:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

async function cleanNewsTables() {
  await prisma.ingestJob.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.newsSource.deleteMany();
}

describe("news sources CRUD & cron RSS sync routes", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://custom-eng.blog/feed.xml") {
          return new Response(SAMPLE_RSS_XML, {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          });
        }
        if (url === "https://broken-feed.blog/rss.xml") {
          return new Response("Server Error", { status: 500 });
        }
        return new Response(null, { status: 200 });
      })
    );
    await cleanNewsTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await cleanNewsTables();
    await prisma.$disconnect();
  });

  it("rejects unauthorized callers on sources CRUD and cron endpoints", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const responses = await Promise.all([
      sourcesGet(jsonRequest("http://localhost/api/news/sources", "GET")),
      sourcesPost(
        jsonRequest("http://localhost/api/news/sources", "POST", {
          name: "X",
          feedUrl: "https://vercel.com/atom",
        })
      ),
      sourcePatch(
        jsonRequest("http://localhost/api/news/sources/s1", "PATCH", { enabled: false }),
        idContext("s1")
      ),
      sourceDelete(
        jsonRequest("http://localhost/api/news/sources/s1", "DELETE"),
        idContext("s1")
      ),
      cronPost(jsonRequest("http://localhost/api/news/cron", "POST")),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });

  it("creates, lists, updates, and deletes NewsSource with duplicate and SSRF protection", async () => {
    const createRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Custom Eng Blog",
        feedUrl: "https://www.custom-eng.blog/feed.xml",
        defaultTags: ["Backend", "Architecture", "backend"],
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).source;
    expect(created.domain).toBe("custom-eng.blog");
    expect(created.defaultTags).toEqual(["backend", "architecture"]);
    expect(created.enabled).toBe(true);

    // Duplicate feedUrl -> 409
    const dupRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Duplicate",
        feedUrl: "https://www.custom-eng.blog/feed.xml",
      })
    );
    expect(dupRes.status).toBe(409);

    // SSRF feedUrl -> 403
    const ssrfRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Local SSRF",
        feedUrl: "http://127.0.0.1/feed.xml",
      })
    );
    expect(ssrfRes.status).toBe(403);

    // Update source
    const patchRes = await sourcePatch(
      jsonRequest(`http://localhost/api/news/sources/${created.id}`, "PATCH", {
        name: "Updated Blog",
        enabled: false,
      }),
      idContext(created.id)
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).source).toMatchObject({
      name: "Updated Blog",
      enabled: false,
    });

    // List sources
    const listRes = await sourcesGet(jsonRequest("http://localhost/api/news/sources", "GET"));
    expect((await listRes.json()).sources).toHaveLength(1);

    // Delete source
    const delRes = await sourceDelete(
      jsonRequest(`http://localhost/api/news/sources/${created.id}`, "DELETE"),
      idContext(created.id)
    );
    expect(delRes.status).toBe(200);
    expect(await prisma.newsSource.count()).toBe(0);
  });

  it("syncs enabled RSS sources into draft items, skips dismissed URLs, and isolates feed errors", async () => {
    const createOk = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Custom Eng Blog",
        feedUrl: "https://custom-eng.blog/feed.xml",
        defaultTags: ["eng"],
      })
    );
    const okSource = (await createOk.json()).source;

    const createBroken = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Broken Feed",
        feedUrl: "https://broken-feed.blog/rss.xml",
      })
    );
    const brokenSource = (await createBroken.json()).source;

    // Authenticate cron using CRON_SECRET bearer header even when requireWriteAccess would reject
    vi.stubEnv("CRON_SECRET", "super-cron-secret");
    writeAccess.requireWriteAccess.mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const firstCron = await cronPost(
      jsonRequest(
        "http://localhost/api/news/cron",
        "POST",
        {},
        { authorization: "Bearer super-cron-secret" }
      )
    );
    expect(firstCron.status).toBe(200);
    const firstSummary = await firstCron.json();
    expect(firstSummary.sourcesProcessed).toBe(2);
    expect(firstSummary.totalQueued).toBe(2);
    expect(firstSummary.totalDuplicates).toBe(0);

    const brokenResult = firstSummary.results.find(
      (r: { sourceId: string }) => r.sourceId === brokenSource.id
    );
    expect(brokenResult.error).toContain("HTTP 500");

    // Verify queued items are in draft status with source's defaultTags and stripped utm_source
    const items = await prisma.newsItem.findMany({ orderBy: { canonicalUrl: "asc" } });
    expect(items).toHaveLength(2);
    expect(items[0].canonicalUrl).toBe("https://custom-eng.blog/posts/post-1");
    expect(items[0].reviewStatus).toBe("draft");
    expect(items[0].origin).toBe("cron");
    expect(items[0].sourceId).toBe(okSource.id);
    expect(JSON.parse(items[0].tags)).toEqual(["eng"]);

    // Dismiss post-1, then run cron again -> both post-1 (dismissed) and post-2 are counted as duplicates
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await newsItemPatch(
      jsonRequest(`http://localhost/api/news/${items[0].id}`, "PATCH", {
        reviewStatus: "dismissed",
      }),
      idContext(items[0].id)
    );

    const secondCron = await cronPost(
      jsonRequest("http://localhost/api/news/cron", "POST", { sourceId: okSource.id })
    );
    expect(secondCron.status).toBe(200);
    const secondSummary = await secondCron.json();
    expect(secondSummary.totalQueued).toBe(0);
    expect(secondSummary.totalDuplicates).toBe(2);
    expect(await prisma.newsItem.count()).toBe(2);
  });
});
