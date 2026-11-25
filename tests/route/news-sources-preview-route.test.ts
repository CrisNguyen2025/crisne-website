import "../setup/isolated-test-db";
import dns from "node:dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { POST as cronPost } from "@/app/api/news/cron/route";
import { POST as sourcesPost } from "@/app/api/news/sources/route";
import { POST as previewPost } from "@/app/api/news/sources/preview/route";

const jsonRequest = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/news/sources/preview & cron HTML/skipped diagnostics", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    await prisma.ingestJob.deleteMany();
    await prisma.newsItem.deleteMany();
    await prisma.newsSource.deleteMany();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await prisma.ingestJob.deleteMany();
    await prisma.newsItem.deleteMany();
    await prisma.newsSource.deleteMany();
    await prisma.$disconnect();
  });

  it("enforces requireWriteAccess and previews JSON Feed without DB writes", async () => {
    writeAccess.requireWriteAccess.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );
    const unauth = await previewPost(
      jsonRequest("http://localhost/api/news/sources/preview", {
        feedUrl: "https://indie.dev/feed.json",
      })
    );
    expect(unauth.status).toBe(401);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            version: "https://jsonfeed.org/version/1.1",
            title: "Indie JSON",
            items: [{ id: "1", url: "https://indie.dev/p/1", title: "Hello JSON" }],
          }),
          { status: 200, headers: { "content-type": "application/feed+json" } }
        )
      )
    );

    const res = await previewPost(
      jsonRequest("http://localhost/api/news/sources/preview", {
        feedUrl: "https://indie.dev/feed.json",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("json");
    expect(body.feedTitle).toBe("Indie JSON");
    expect(body.itemCount).toBe(1);
    expect(await prisma.newsSource.count()).toBe(0);
  });

  it("records BOT_BLOCKED on HTTP 200 HTML challenge and skippedReasons on aggregator links", async () => {
    const challengeHtml = `<!doctype html><html><head><title>Just a moment...</title></head><body>Cloudflare</body></html>`;
    const aggregatorXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Agg</title>
      <item><title>Ext</title><link>https://random-outside.org/article</link></item>
    </channel></rss>`;

    let serveHtml = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://cf-blog.dev/rss.xml") {
          return serveHtml
            ? new Response(challengeHtml, {
                status: 200,
                headers: { "content-type": "text/html" },
              })
            : new Response(aggregatorXml, {
                status: 200,
                headers: { "content-type": "application/rss+xml" },
              });
        }
        return new Response(aggregatorXml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      })
    );

    const s1 = await (
      await sourcesPost(
        jsonRequest("http://localhost/api/news/sources", {
          name: "CF Blog",
          feedUrl: "https://cf-blog.dev/rss.xml",
        })
      )
    ).json();

    serveHtml = true;
    const cronRes = await cronPost(jsonRequest("http://localhost/api/news/cron", {}));
    const summary = await cronRes.json();
    expect(summary.results[0].error).toContain("BOT_BLOCKED");

    const updatedSource = await prisma.newsSource.findUniqueOrThrow({
      where: { id: s1.source.id },
    });
    expect(updatedSource.lastError).toContain("BOT_BLOCKED");

    serveHtml = false;
    const cronRes2 = await cronPost(jsonRequest("http://localhost/api/news/cron", {}));
    const summary2 = await cronRes2.json();
    expect(summary2.results[0].skippedErrors).toBe(1);
    expect(summary2.results[0].skippedReasons).toEqual([
      { url: "https://random-outside.org/article", code: "DOMAIN_NOT_ALLOWED" },
    ]);
  });
  it("suggests feeds from same-site section pages and site-named GitHub repos when the page has none", async () => {
    const homeHtml = `<!doctype html><html><head><title>Acme</title></head><body>
      <nav>
        <a href="/pricing">Pricing</a>
        <a href="/news">News</a>
        <a href="https://github.com/acme/acme-sdk">GitHub</a>
        <a href="https://github.com/sponsor-co/widget">Sponsor</a>
      </nav></body></html>`;
    const newsHtml = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" title="Acme News" href="/news/rss.xml">
      </head><body>News</body></html>`;
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Acme News</title>
      <item><title>Launch</title><link>https://acme.dev/news/launch</link></item></channel></rss>`;
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Release notes from acme-sdk</title>
      <entry><title>v1</title><link rel="alternate" href="https://github.com/acme/acme-sdk/releases/tag/v1"/></entry></feed>`;

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      const html = (body: string) =>
        new Response(body, { status: 200, headers: { "content-type": "text/html" } });
      if (url === "https://acme.dev/") return html(homeHtml);
      if (url === "https://acme.dev/news/") return html(newsHtml);
      if (url === "https://acme.dev/news/rss.xml") {
        return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
      }
      if (url === "https://github.com/acme/acme-sdk/releases.atom") {
        return new Response(atom, { status: 200, headers: { "content-type": "application/atom+xml" } });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await previewPost(
      jsonRequest("http://localhost/api/news/sources/preview", { feedUrl: "https://acme.dev/" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("FEED_NOT_FOUND");
    expect(body.error).toContain("tìm thấy 2 feed liên quan");
    expect(body.suggestions).toEqual([
      { url: "https://acme.dev/news/rss.xml", title: "Acme News", format: "rss" },
      {
        url: "https://github.com/acme/acme-sdk/releases.atom",
        title: "Release notes from acme-sdk",
        format: "atom",
      },
    ]);

    // Only the section page and the site-named repo are checked: no sponsor repo, no /pricing
    const fetched = fetchMock.mock.calls.map(([input]) => String(input));
    expect(fetched.some((url) => url.includes("sponsor-co"))).toBe(false);
    expect(fetched.some((url) => url.includes("/pricing"))).toBe(false);
    expect(await prisma.newsSource.count()).toBe(0);
  });
});
