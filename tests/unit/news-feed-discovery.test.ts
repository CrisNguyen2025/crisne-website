import { describe, expect, it, vi } from "vitest";
import {
  FeedDiscoveryError,
  extractAlternateFeedLinksFromHtml,
  resolveFeedUrl,
} from "@/lib/news/feed-discovery";
import { UrlGuardError } from "@/lib/news/url-guard";

const publicLookup = vi.fn(async (hostname: string) => {
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return [{ address: "127.0.0.1", family: 4 }];
  }
  return [{ address: "93.184.216.34", family: 4 }];
});

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Solo Playbook</title>
  <item><title>Post 1</title><link>https://goonnguyen.substack.com/p/post-1</link></item>
</channel></rss>`;

describe("extractAlternateFeedLinksFromHtml", () => {
  it("extracts relative RSS link, handles attribute ordering/entities, and ignores comments/non-feeds", () => {
    const html = `<!doctype html>
      <html>
        <head>
          <!-- <link rel="alternate" type="application/rss+xml" href="/commented-out.xml" /> -->
          <link rel="alternate" type="application/json+oembed" href="/oembed.json" />
          <link rel="alternate" type="application/opensearchdescription+xml" href="/search.xml" />
          <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed" />
          <link href='/atom.xml?a=1&amp;b=2' type='application/atom+xml' rel='alternate'>
          <link rel="alternate" type="application/rss+xml" href="/feed" title="Main Feed" />
        </head>
        <body></body>
      </html>`;

    expect(extractAlternateFeedLinksFromHtml(html, "https://goonnguyen.substack.com/")).toEqual([
      "https://goonnguyen.substack.com/feed",
      "https://goonnguyen.substack.com/atom.xml?a=1&b=2",
      "https://goonnguyen.substack.com/comments/feed",
    ]);
  });
});

describe("resolveFeedUrl", () => {
  it("keeps direct RSS/Atom URLs as-is (including empty feeds)", async () => {
    const emptyRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const fetchFn = vi.fn(
      async () =>
        new Response(emptyRss, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })
    );

    const res = await resolveFeedUrl("https://example.com/feed.xml", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({
      feedUrl: "https://example.com/feed.xml",
      discovered: false,
      siteHost: "example.com",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("discovers RSS feed from blog homepage <link rel='alternate'>", async () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed" title="Goon" />
    </head><body>Welcome</body></html>`;

    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://goonnguyen.substack.com/") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://goonnguyen.substack.com/feed") {
        return new Response(SAMPLE_RSS, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await resolveFeedUrl("https://goonnguyen.substack.com/", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({
      feedUrl: "https://goonnguyen.substack.com/feed",
      discovered: true,
      siteHost: "goonnguyen.substack.com",
    });
  });

  it("falls back to probing common feed paths when HTML has no alternate link", async () => {
    const html = `<!doctype html><html><head><title>Plain Blog</title></head><body>Hello</body></html>`;

    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://plainblog.dev/") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://plainblog.dev/rss.xml") {
        return new Response(SAMPLE_RSS, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await resolveFeedUrl("https://plainblog.dev", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({
      feedUrl: "https://plainblog.dev/rss.xml",
      discovered: true,
      siteHost: "plainblog.dev",
    });
  });

  it("blocks SSRF when HTML alternate link points to a private host", async () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/secret.xml" />
    </head><body></body></html>`;

    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://evil.example/") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not Found", { status: 404 });
    });

    await expect(
      resolveFeedUrl("https://evil.example/", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlGuardError);

    expect(fetchFn.mock.calls.some(([url]) => String(url).includes("127.0.0.1"))).toBe(false);
  });

  it("throws FeedDiscoveryError when HTML page has no discoverable feed", async () => {
    const html = `<!doctype html><html><head><title>No RSS</title></head><body>SPA</body></html>`;
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (String(input) === "https://spa.example/") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not Found", { status: 404 });
    });

    await expect(
      resolveFeedUrl("https://spa.example/", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(FeedDiscoveryError);
  });

  it("keeps original URL when upstream returns non-HTML HTTP 500", async () => {
    const fetchFn = vi.fn(async () => new Response("Server Error", { status: 500 }));
    const res = await resolveFeedUrl("https://broken-feed.blog/rss.xml", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({
      feedUrl: "https://broken-feed.blog/rss.xml",
      discovered: false,
      siteHost: "broken-feed.blog",
    });
  });
});
