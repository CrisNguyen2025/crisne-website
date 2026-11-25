import { describe, expect, it, vi } from "vitest";
import {
  FeedDiscoveryError,
  previewFeedSource,
  resolveFeedUrl,
} from "@/lib/news/feed-discovery";
import {
  extractYouTubeChannelFeedFromHtml,
  resolvePlatformFeedCandidates,
} from "@/lib/news/platform-feeds";
import {
  classifyFeedError,
  FeedFetchHttpError,
  isJsonFeedDocument,
  parseFeedDocument,
  parseRssOrAtomXml,
} from "@/lib/news/rss-fetcher";

const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

describe("platform URL feed mapping", () => {
  it("maps GitHub repo, Medium, Dev.to, Substack subdomain, Hashnode, Bluesky, and Mastodon URLs", () => {
    expect(resolvePlatformFeedCandidates("https://github.com/vercel/next.js")[0]?.url).toBe(
      "https://github.com/vercel/next.js/releases.atom"
    );
    expect(resolvePlatformFeedCandidates("https://medium.com/@dan_abramov")[0]?.url).toBe(
      "https://medium.com/feed/@dan_abramov"
    );
    expect(resolvePlatformFeedCandidates("https://dev.to/t/nextjs")[0]?.url).toBe(
      "https://dev.to/feed/tag/nextjs"
    );
    expect(resolvePlatformFeedCandidates("https://pragmaticengineer.substack.com/p/ai")[0]?.url).toBe(
      "https://pragmaticengineer.substack.com/feed"
    );
    expect(resolvePlatformFeedCandidates("https://substack.com/@author")).toEqual([]);
    expect(resolvePlatformFeedCandidates("https://bsky.app/profile/danabra.mov")[0]?.url).toBe(
      "https://bsky.app/profile/danabra.mov/rss"
    );
    expect(resolvePlatformFeedCandidates("https://fosstodon.org/@tauri")[0]?.url).toBe(
      "https://fosstodon.org/@tauri.rss"
    );
  });

  it("keeps a pasted GitHub feed as is instead of mapping it to commits.atom", () => {
    expect(resolvePlatformFeedCandidates("https://github.com/nestjs/nest/releases.atom")).toEqual([]);
    expect(resolvePlatformFeedCandidates("https://github.com/vercel/next.js/tags.atom")).toEqual([]);
    expect(
      resolvePlatformFeedCandidates("https://github.com/vercel/next.js/commits/canary.atom")
    ).toEqual([]);
  });

  it("extracts YouTube channel RSS from @handle HTML containing externalId", () => {
    const html = `<!doctype html><html><head><title>YT</title></head><body><script>var ytInitialData = {"externalId":"UC_x5XG1OV2P6uZZ5FSM9Ttw"};</script></body></html>`;
    expect(extractYouTubeChannelFeedFromHtml(html)).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw"
    );
  });
});

describe("JSON Feed & newest-first sorting", () => {
  it("detects and parses JSON Feed 1.1 and sorts newest items first", () => {
    const jsonFeed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Indie Tech Notes",
      items: [
        {
          id: "1",
          url: "https://indie.dev/older",
          title: "Older Post",
          date_published: "2026-11-20T10:00:00Z",
        },
        {
          id: "2",
          url: "https://indie.dev/newer",
          title: "Newer Post",
          date_published: "2026-11-24T10:00:00Z",
        },
      ],
    });

    expect(isJsonFeedDocument(jsonFeed)).toBe(true);
    const parsed = parseFeedDocument(jsonFeed, "https://indie.dev/feed.json");
    expect(parsed.format).toBe("json");
    expect(parsed.title).toBe("Indie Tech Notes");
    expect(parsed.entries.map((e) => e.url)).toEqual([
      "https://indie.dev/newer",
      "https://indie.dev/older",
    ]);
  });

  it("resolves relative permaLink guid against baseFeedUrl and sorts RSS pubDate descending", () => {
    const rss = `<?xml version="1.0"?>
      <rss version="2.0"><channel><title>Changelog</title>
        <item><title>Old</title><guid>/posts/old</guid><pubDate>Mon, 01 Nov 2026 00:00:00 GMT</pubDate></item>
        <item><title>New</title><guid>/posts/new</guid><pubDate>Tue, 24 Nov 2026 00:00:00 GMT</pubDate></item>
      </channel></rss>`;
    const entries = parseRssOrAtomXml(rss, "https://changelog.dev/rss.xml");
    expect(entries.map((e) => e.url)).toEqual([
      "https://changelog.dev/posts/new",
      "https://changelog.dev/posts/old",
    ]);
  });
});

describe("previewFeedSource & error classification", () => {
  it("classifies Cloudflare 403 as BOT_BLOCKED and 429 as RATE_LIMITED", () => {
    const botErr = classifyFeedError(
      new FeedFetchHttpError({
        status: 403,
        cfMitigated: true,
        server: "cloudflare",
        retryAfter: null,
      })
    );
    expect(botErr.code).toBe("BOT_BLOCKED");

    const rateErr = classifyFeedError(
      new FeedFetchHttpError({
        status: 429,
        cfMitigated: false,
        server: "nginx",
        retryAfter: "120",
      })
    );
    expect(rateErr.code).toBe("RATE_LIMITED");
    expect(rateErr.message).toContain("120s");
  });

  it("returns multiple candidates and warns on external aggregator domains in previewFeedSource", async () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" title="Aggregator Main" href="/rss" />
      <link rel="alternate" type="application/feed+json" title="Aggregator JSON" href="/feed.json" />
    </head><body></body></html>`;
    const aggregatorRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Tech Links</title>
      <item><title>External</title><link>https://unlisted-thirdparty.org/post-1</link></item>
    </channel></rss>`;
    const aggregatorJson = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Tech Links JSON",
      items: [{ id: "1", url: "https://unlisted-thirdparty.org/post-1", title: "External" }],
    });

    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://curator.example/") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://curator.example/rss") {
        return new Response(aggregatorRss, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }
      if (url === "https://curator.example/feed.json") {
        return new Response(aggregatorJson, {
          status: 200,
          headers: { "content-type": "application/feed+json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const preview = await previewFeedSource("https://curator.example/", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(preview.resolvedFeedUrl).toBe("https://curator.example/rss");
    expect(preview.candidates).toHaveLength(2);
    expect(preview.warnings[0]).toContain("unlisted-thirdparty.org");
  });

  it("discovers GitHub releases.atom without fetching HTML first and rejects broken preview URLs", async () => {
    const atomXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Release notes from next.js</title>
      <entry><title>v16.1.0</title><link href="https://github.com/vercel/next.js/releases/tag/v16.1.0"/></entry>
    </feed>`;
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (String(input) === "https://github.com/vercel/next.js/releases.atom") {
        return new Response(atomXml, {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        });
      }
      return new Response("Forbidden", { status: 403, headers: { "cf-mitigated": "challenge" } });
    });

    const resolved = await resolveFeedUrl("https://github.com/vercel/next.js", {
      lookupFn: publicLookup,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(resolved.feedUrl).toBe("https://github.com/vercel/next.js/releases.atom");

    await expect(
      previewFeedSource("https://blocked.example/rss.xml", {
        lookupFn: publicLookup,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(FeedDiscoveryError);
  });
});
