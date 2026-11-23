// Must stay the first import: gives this file its own SQLite DB before @/lib/prisma loads
import "../setup/isolated-test-db";
import dns from "node:dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { PATCH as newsItemPatch } from "@/app/api/news/[id]/route";
import { GET as cronGet, POST as cronPost } from "@/app/api/news/cron/route";
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
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        if (url === "https://custom-eng.blog/feed.xml") {
          if (headers.get("if-none-match") === '"etag-v1"') {
            return new Response(null, {
              status: 304,
              headers: { etag: '"etag-v1"' },
            });
          }
          return new Response(SAMPLE_RSS_XML, {
            status: 200,
            headers: {
              "Content-Type": "application/rss+xml",
              etag: '"etag-v1"',
              "last-modified": "Sun, 22 Nov 2026 07:05:00 GMT",
            },
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

    // Verify queued items are in draft status with source's defaultTags, stripped utm_source, and pubDate preserved
    const items = await prisma.newsItem.findMany({ orderBy: { canonicalUrl: "asc" } });
    expect(items).toHaveLength(2);
    expect(items[0].canonicalUrl).toBe("https://custom-eng.blog/posts/post-1");
    expect(items[0].reviewStatus).toBe("draft");
    expect(items[0].origin).toBe("cron");
    expect(items[0].sourceId).toBe(okSource.id);
    expect(items[0].publishedAt?.toISOString()).toBe("2026-11-22T06:00:00.000Z");
    expect(JSON.parse(items[0].tags)).toEqual(["eng"]);

    // Subsequent GET /api/news/cron with CRON_SECRET uses stored ETag -> 304 Not Modified
    const cachedGetCron = await cronGet(
      jsonRequest(
        `http://localhost/api/news/cron?sourceId=${encodeURIComponent(okSource.id)}`,
        "GET",
        undefined,
        { authorization: "Bearer super-cron-secret" }
      )
    );
    expect(cachedGetCron.status).toBe(200);
    const cachedSummary = await cachedGetCron.json();
    expect(cachedSummary.totalQueued).toBe(0);
    expect(cachedSummary.results[0].notModified).toBe(true);

    // Dismiss post-1, then clear etag and run POST cron again -> both post-1 (dismissed) and post-2 are duplicates
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await prisma.newsSource.update({
      where: { id: okSource.id },
      data: { etag: null, lastModified: null },
    });
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

  it("uses NEWS_CRON_MAX_ITEMS_PER_SOURCE when maxItemsPerSource is omitted", async () => {
    const manyItemsXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><title>Bulk</title>
      ${Array.from({ length: 4 }, (_, i) => `<item><title>Item ${i}</title><link>https://custom-eng.blog/p-${i}</link></item>`).join("")}
      </channel></rss>`;

    vi.stubEnv("NEWS_CRON_MAX_ITEMS_PER_SOURCE", "2");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(manyItemsXml, { status: 200 }))
    );

    const createRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Bulk",
        feedUrl: "https://custom-eng.blog/bulk.xml",
      })
    );
    const source = (await createRes.json()).source;

    const res = await cronPost(
      jsonRequest("http://localhost/api/news/cron", "POST", { sourceId: source.id })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).totalQueued).toBe(2);
  });

  it("auto-discovers RSS XML from a blog homepage URL on POST and PATCH, rejecting HTML without feeds", async () => {
    const substackHomeHtml = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed" title="Goon" />
    </head><body>Blog</body></html>`;
    const emptyHomeHtml = `<!doctype html><html><head><title>No Feed</title></head><body></body></html>`;
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Updated Atom</title>
        <entry><title>Hello</title><link rel="alternate" href="https://atom-blog.dev/hello" /></entry>
      </feed>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://goonnguyen.substack.com/") {
          return new Response(substackHomeHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        if (url === "https://goonnguyen.substack.com/feed") {
          return new Response(SAMPLE_RSS_XML, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          });
        }
        if (url === "https://atom-blog.dev/") {
          return new Response(emptyHomeHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        if (url === "https://atom-blog.dev/atom.xml") {
          return new Response(atomXml, {
            status: 200,
            headers: { "Content-Type": "application/atom+xml" },
          });
        }
        if (url === "https://no-rss.example/") {
          return new Response(emptyHomeHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response("Not Found", { status: 404 });
      })
    );

    const createRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Goon Substack",
        feedUrl: "https://goonnguyen.substack.com/",
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).source;
    expect(created.feedUrl).toBe("https://goonnguyen.substack.com/feed");
    expect(created.domain).toBe("goonnguyen.substack.com");

    // Re-adding either the homepage URL or the resolved XML URL hits 409 conflict
    const dupHomeRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "Goon Again",
        feedUrl: "https://goonnguyen.substack.com/",
      })
    );
    expect(dupHomeRes.status).toBe(409);

    // HTML page with no discoverable feed returns 400 FEED_NOT_FOUND
    const noFeedRes = await sourcesPost(
      jsonRequest("http://localhost/api/news/sources", "POST", {
        name: "No RSS",
        feedUrl: "https://no-rss.example/",
      })
    );
    expect(noFeedRes.status).toBe(400);
    expect((await noFeedRes.json()).code).toBe("FEED_NOT_FOUND");

    // PATCH with a homepage URL also auto-discovers via fallback path (/atom.xml)
    const patchRes = await sourcePatch(
      jsonRequest(`http://localhost/api/news/sources/${created.id}`, "PATCH", {
        feedUrl: "https://atom-blog.dev/",
      }),
      idContext(created.id)
    );
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()).source;
    expect(updated.feedUrl).toBe("https://atom-blog.dev/atom.xml");
    expect(updated.domain).toBe("atom-blog.dev");
  });
});
