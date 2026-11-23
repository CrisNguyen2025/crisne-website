import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { enqueueNewsUrl } from "./ingest";
import {
  type CronSyncSourceResult,
  type CronSyncSummary,
  parseJsonStringArray,
} from "./schemas";
import { type HostLookupFn, UrlGuardError, assertPublicHostname } from "./url-guard";
import { notifyNewsWorker } from "./worker-trigger";

const MAX_FEED_XML_BYTES = 2 * 1024 * 1024;
const FEED_FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_REDIRECTS = 3;

export interface ParsedFeedEntry {
  url: string;
  title?: string;
  publishedAt?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  processEntities: {
    enabled: true,
    maxTotalExpansions: 1000,
  },
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readNodeText(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record["#text"] === "string" || typeof record["#text"] === "number") {
      return String(record["#text"]).trim();
    }
  }
  return "";
}

function cleanEntryTitle(raw: string): string | undefined {
  if (!raw) return undefined;
  const withoutTags = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutTags ? withoutTags.slice(0, 240) : undefined;
}

function parseOptionalIsoDate(raw: unknown): string | undefined {
  const text = readNodeText(raw);
  if (!text) return undefined;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function resolveHttpUrl(rawLink: string, baseFeedUrl?: string): string | null {
  const trimmed = rawLink.trim();
  if (!trimmed) return null;
  try {
    const resolved = baseFeedUrl ? new URL(trimmed, baseFeedUrl) : new URL(trimmed);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function extractAtomEntryUrl(linkNode: unknown, baseFeedUrl?: string): string | null {
  const links = asArray(linkNode);
  for (const candidate of links) {
    if (typeof candidate === "string") {
      const url = resolveHttpUrl(candidate, baseFeedUrl);
      if (url) return url;
      continue;
    }
    if (candidate && typeof candidate === "object") {
      const rec = candidate as Record<string, unknown>;
      const rel = typeof rec["@_rel"] === "string" ? rec["@_rel"].toLowerCase() : "alternate";
      const href = typeof rec["@_href"] === "string" ? rec["@_href"] : readNodeText(rec);
      if ((rel === "alternate" || !rec["@_rel"]) && href) {
        const url = resolveHttpUrl(href, baseFeedUrl);
        if (url) return url;
      }
    }
  }

  for (const candidate of links) {
    if (candidate && typeof candidate === "object") {
      const rec = candidate as Record<string, unknown>;
      const href = typeof rec["@_href"] === "string" ? rec["@_href"] : readNodeText(rec);
      if (href) {
        const url = resolveHttpUrl(href, baseFeedUrl);
        if (url) return url;
      }
    }
  }
  return null;
}

function extractRssItemUrl(item: Record<string, unknown>, baseFeedUrl?: string): string | null {
  const directLink = extractAtomEntryUrl(item.link, baseFeedUrl);
  if (directLink) return directLink;

  const guid = item.guid;
  if (typeof guid === "string") {
    return resolveHttpUrl(guid);
  }
  if (guid && typeof guid === "object") {
    const rec = guid as Record<string, unknown>;
    const isPermaLink = String(rec["@_isPermaLink"] ?? "true").toLowerCase() !== "false";
    if (isPermaLink) {
      return resolveHttpUrl(readNodeText(rec));
    }
  }
  return null;
}

export function parseRssOrAtomXml(xml: string, baseFeedUrl?: string): ParsedFeedEntry[] {
  const trimmed = xml.trim();
  if (!trimmed) return [];

  const doc = xmlParser.parse(trimmed) as Record<string, unknown>;
  const entries: ParsedFeedEntry[] = [];
  const seenUrls = new Set<string>();

  const pushEntry = (url: string | null, rawTitle: unknown, rawDate: unknown) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    entries.push({
      url,
      title: cleanEntryTitle(readNodeText(rawTitle)),
      publishedAt: parseOptionalIsoDate(rawDate),
    });
  };

  // 1. RSS 2.0: rss.channel.item
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? doc.channel) as Record<string, unknown> | undefined;
  if (channel) {
    for (const rawItem of asArray(channel.item)) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const url = extractRssItemUrl(item, baseFeedUrl);
      pushEntry(url, item.title, item.pubDate ?? item["dc:date"] ?? item.published);
    }
  }

  // 2. RSS 1.0 / RDF: rdf:RDF.item or RDF.item
  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Record<string, unknown> | undefined;
  if (rdf) {
    for (const rawItem of asArray(rdf.item)) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const url = extractRssItemUrl(item, baseFeedUrl);
      pushEntry(url, item.title, item["dc:date"] ?? item.pubDate);
    }
  }

  // 3. Atom: feed.entry
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    for (const rawEntry of asArray(feed.entry)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      const url = extractAtomEntryUrl(entry.link, baseFeedUrl);
      pushEntry(url, entry.title, entry.published ?? entry.updated);
    }
  }

  return entries;
}

const FEED_TOO_LARGE_MESSAGE = "Feed vượt quá giới hạn 2MB.";

/**
 * Reads the feed body while counting bytes, so an oversized or endless response is cut off
 * before it is buffered. Throws instead of truncating: half an XML document does not parse.
 */
async function readFeedBodyWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_XML_BYTES) {
    await response.body?.cancel();
    throw new Error(FEED_TOO_LARGE_MESSAGE);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FEED_XML_BYTES) {
      await reader.cancel();
      throw new Error(FEED_TOO_LARGE_MESSAGE);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export type FeedFetchResult =
  | { kind: "not_modified"; etag: string | null; lastModified: string | null }
  | {
      kind: "ok";
      xml: string;
      etag: string | null;
      lastModified: string | null;
      finalUrl: string;
      contentType: string | null;
    };

export async function fetchFeedWithCacheSafely(
  feedUrl: string,
  options: {
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
    etag?: string | null;
    lastModified?: string | null;
    timeoutMs?: number;
  } = {}
): Promise<FeedFetchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? FEED_FETCH_TIMEOUT_MS;
  let current = new URL(feedUrl.trim());

  for (let hop = 0; hop <= MAX_FEED_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Feed URL phải dùng http hoặc https.");
    }
    if (current.username || current.password) {
      throw new UrlGuardError("INVALID_URL", 400, "Feed URL không được chứa thông tin đăng nhập.");
    }
    await assertPublicHostname(current.hostname, options.lookupFn);

    const headers: Record<string, string> = {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; CrisneNewsBot/1.0; +https://crisne.blog)",
    };
    if (options.etag) {
      headers["If-None-Match"] = options.etag;
    }
    if (options.lastModified) {
      headers["If-Modified-Since"] = options.lastModified;
    }

    const response = await fetchFn(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      if (response.status === 304) {
        await response.body?.cancel();
        return {
          kind: "not_modified",
          etag: response.headers.get("etag") ?? options.etag ?? null,
          lastModified: response.headers.get("last-modified") ?? options.lastModified ?? null,
        };
      }
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) {
        throw new Error(`Feed redirect (${response.status}) thiếu Location header.`);
      }
      if (hop === MAX_FEED_REDIRECTS) {
        throw new UrlGuardError("TOO_MANY_REDIRECTS", 400, "Feed URL chuyển hướng quá nhiều lần.");
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Tải feed thất bại với HTTP ${response.status}`);
    }

    const xml = await readFeedBodyWithLimit(response);
    return {
      kind: "ok",
      xml,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      finalUrl: current.toString(),
      contentType: response.headers.get("content-type"),
    };
  }

  throw new UrlGuardError("TOO_MANY_REDIRECTS", 400, "Feed URL chuyển hướng quá nhiều lần.");
}

export async function fetchFeedXmlSafely(
  feedUrl: string,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch } = {}
): Promise<string> {
  const result = await fetchFeedWithCacheSafely(feedUrl, options);
  return result.kind === "ok" ? result.xml : "";
}

function resolveDefaultCronMaxItems(): number {
  const raw = Number(process.env.NEWS_CRON_MAX_ITEMS_PER_SOURCE);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(Math.trunc(raw), 30);
  }
  return 10;
}

export async function syncNewsSourcesCron(
  options: {
    sourceId?: string;
    maxItemsPerSource?: number;
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
  } = {}
): Promise<CronSyncSummary> {
  const maxItems = Math.min(
    Math.max(1, options.maxItemsPerSource ?? resolveDefaultCronMaxItems()),
    30
  );
  const sources = await prisma.newsSource.findMany({
    where: options.sourceId ? { id: options.sourceId } : { enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const results: CronSyncSourceResult[] = [];
  let totalQueued = 0;
  let totalDuplicates = 0;

  for (const source of sources) {
    let queued = 0;
    let duplicates = 0;
    let skippedErrors = 0;
    let notModified = false;
    let sourceError: string | null = null;

    try {
      const feedRes = await fetchFeedWithCacheSafely(source.feedUrl, {
        lookupFn: options.lookupFn,
        fetchFn: options.fetchFn,
        etag: source.etag,
        lastModified: source.lastModified,
      });

      if (feedRes.kind === "not_modified") {
        notModified = true;
        await prisma.newsSource.update({
          where: { id: source.id },
          data: {
            etag: feedRes.etag ?? source.etag,
            lastModified: feedRes.lastModified ?? source.lastModified,
            lastFetchedAt: new Date(),
            lastError: null,
          },
        });
      } else {
        const entries = parseRssOrAtomXml(feedRes.xml, source.feedUrl).slice(0, maxItems);
        const feedHost = new URL(source.feedUrl).hostname.toLowerCase().replace(/^www\./, "");
        const defaultTags = parseJsonStringArray(source.defaultTags);

        for (const entry of entries) {
          try {
            const res = await enqueueNewsUrl(
              {
                url: entry.url,
                title: entry.title,
                origin: "cron",
                sourceId: source.id,
                tags: defaultTags,
                publishedAt: entry.publishedAt,
              },
              {
                extraAllowedDomains: [source.domain, feedHost],
                lookupFn: options.lookupFn,
                fetchFn: options.fetchFn,
                skipWake: true,
              }
            );
            if (res.status === "queued") {
              queued++;
              totalQueued++;
            } else {
              duplicates++;
              totalDuplicates++;
            }
          } catch {
            skippedErrors++;
          }
        }

        await prisma.newsSource.update({
          where: { id: source.id },
          data: {
            etag: feedRes.etag ?? null,
            lastModified: feedRes.lastModified ?? null,
            lastFetchedAt: new Date(),
            lastError: null,
          },
        });
      }
    } catch (error) {
      sourceError =
        error instanceof Error ? error.message.slice(0, 500) : "Lỗi không xác định khi quét feed.";
      await prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          lastError: sourceError,
        },
      });
    }

    results.push({
      sourceId: source.id,
      sourceName: source.name,
      queued,
      duplicates,
      skippedErrors,
      ...(notModified ? { notModified: true } : {}),
      error: sourceError,
    });
  }

  if (totalQueued > 0) {
    notifyNewsWorker();
  }

  return {
    sourcesProcessed: sources.length,
    totalQueued,
    totalDuplicates,
    results,
  };
}
