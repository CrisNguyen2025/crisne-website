import { describe, expect, it, vi } from "vitest";
import { fetchFeedXmlSafely, parseRssOrAtomXml } from "@/lib/news/rss-fetcher";

describe("RSS & Atom XML parser", () => {
  it("parses RSS 2.0 feeds with multiple items, CDATA titles, and guid fallbacks", () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Tech Blog</title>
          <item>
            <title><![CDATA[Next.js 16.2: Faster Builds & Turbopack]]></title>
            <link>https://vercel.com/blog/nextjs-16-2</link>
            <pubDate>Sun, 22 Nov 2026 07:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Item using PermaLink GUID</title>
            <guid isPermaLink="true">https://vercel.com/blog/guid-only</guid>
          </item>
          <item>
            <title>Duplicate URL should be ignored</title>
            <link>https://vercel.com/blog/nextjs-16-2</link>
          </item>
          <item>
            <title>Unsafe scheme ignored</title>
            <link>javascript:alert(1)</link>
          </item>
        </channel>
      </rss>`;

    const entries = parseRssOrAtomXml(rssXml);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: "https://vercel.com/blog/nextjs-16-2",
      title: "Next.js 16.2: Faster Builds & Turbopack",
      publishedAt: "2026-11-22T07:00:00.000Z",
    });
    expect(entries[1]).toEqual({
      url: "https://vercel.com/blog/guid-only",
      title: "Item using PermaLink GUID",
      publishedAt: undefined,
    });
  });

  it("parses Atom feeds with alternate link attributes and relative paths", () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Simon Willison's Weblog</title>
        <entry>
          <title>Structured Outputs with Gemini</title>
          <link rel="self" href="https://simonwillison.net/atom/entries/1.xml" />
          <link rel="alternate" type="text/html" href="/2026/Nov/22/structured-outputs/" />
          <published>2026-11-22T09:30:00Z</published>
        </entry>
      </feed>`;

    const entries = parseRssOrAtomXml(atomXml, "https://simonwillison.net/atom/everything/");
    expect(entries).toEqual([
      {
        url: "https://simonwillison.net/2026/Nov/22/structured-outputs/",
        title: "Structured Outputs with Gemini",
        publishedAt: "2026-11-22T09:30:00.000Z",
      },
    ]);
  });

  it("parses RSS 1.0 RDF feeds", () => {
    const rdfXml = `<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <item>
          <title>ArXiv Paper on RAG</title>
          <link>https://arxiv.org/abs/2611.12345</link>
        </item>
      </rdf:RDF>`;

    const entries = parseRssOrAtomXml(rdfXml);
    expect(entries).toEqual([
      {
        url: "https://arxiv.org/abs/2611.12345",
        title: "ArXiv Paper on RAG",
        publishedAt: undefined,
      },
    ]);
  });
});

describe("fetchFeedXmlSafely size limit", () => {
  const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  const TWO_MB = 2 * 1024 * 1024;

  function streamOf(chunkCount: number, chunkSize: number) {
    let sent = 0;
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pull();
        if (sent >= chunkCount) {
          controller.close();
          return;
        }
        sent++;
        controller.enqueue(new Uint8Array(chunkSize).fill(97));
      },
    });
    return { body, pull };
  }

  it("returns small feeds unchanged", async () => {
    const xml = "<rss><channel><title>Tiny</title></channel></rss>";
    const fetchFn = vi.fn(async () => new Response(xml, { status: 200 }));
    await expect(
      fetchFeedXmlSafely("https://example.com/feed.xml", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).resolves.toBe(xml);
  });

  it("rejects a declared content-length above 2MB without reading the body", async () => {
    const { body, pull } = streamOf(10, 1024);
    const fetchFn = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": String(TWO_MB + 1) },
        })
    );
    await expect(
      fetchFeedXmlSafely("https://example.com/feed.xml", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toThrow("2MB");
    expect(pull.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("stops reading an undeclared stream once it passes 2MB", async () => {
    // 100 chunks of 64KB = 6.25MB available; reading must stop shortly after 2MB
    const { body, pull } = streamOf(100, 64 * 1024);
    const fetchFn = vi.fn(async () => new Response(body, { status: 200 }));
    await expect(
      fetchFeedXmlSafely("https://example.com/feed.xml", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toThrow("2MB");
    expect(pull.mock.calls.length).toBeLessThan(40);
  });
});
