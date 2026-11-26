import { type ProcessEntitiesOptions, XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { enqueueNewsUrl } from "./ingest";
import {
  type CronSkippedReasonDto,
  type CronSyncSourceResult,
  type CronSyncSummary,
} from "./schemas";
import { type HostLookupFn, UrlGuardError, assertPublicHostname } from "./url-guard";
import { notifyNewsWorker } from "./worker-trigger";
import { recordNewsSourceScans } from "./source-scans";

const MAX_FEED_XML_BYTES = 2 * 1024 * 1024;
const FEED_FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_REDIRECTS = 3;
const CRON_SOURCE_CONCURRENCY = 3;
const DEFAULT_CRON_TIME_BUDGET_MS = 50_000;

export type FeedErrorCode =
  | "SSRF_BLOCKED"
  | "BOT_BLOCKED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "MALFORMED_XML"
  | "EMPTY_FEED"
  | "UPSTREAM_ERROR";

export interface ParsedFeedEntry {
  url: string;
  title?: string;
  publishedAt?: string;
}

export interface ParsedFeedDocument {
  format: "rss" | "atom" | "json";
  title?: string;
  entries: ParsedFeedEntry[];
}

export class FeedFetchHttpError extends Error {
  readonly status: number;
  readonly cfMitigated: boolean;
  readonly server: string | null;
  readonly retryAfter: string | null;

  constructor(params: {
    status: number;
    cfMitigated: boolean;
    server: string | null;
    retryAfter: string | null;
  }) {
    super(`Tải feed thất bại với HTTP ${params.status}`);
    this.name = "FeedFetchHttpError";
    this.status = params.status;
    this.cfMitigated = params.cfMitigated;
    this.server = params.server;
    this.retryAfter = params.retryAfter;
  }
}

// fast-xml-parser 5.12 reads `appliesTo` at runtime (src/xmlparser/OptionsBuilder.js) but its .d.ts omits it
const xmlEntityOptions: ProcessEntitiesOptions & { appliesTo: "external" } = {
  enabled: true,
  maxTotalExpansions: 1000,
  // Count only DOCTYPE-declared entities (the billion-laughs vector); built-in &lt; &amp; in
  // HTML-escaped feed content (e.g. GitHub releases.atom) easily exceed 1000 and are harmless
  appliesTo: "external",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  processEntities: xmlEntityOptions,
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
    .replace(/<[^<>]+>/g, " ")
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

function sortEntriesNewestFirst(entries: ParsedFeedEntry[]): ParsedFeedEntry[] {
  const indexed = entries.map((entry, idx) => ({
    entry,
    idx,
    ts: entry.publishedAt ? Date.parse(entry.publishedAt) : Number.NaN,
  }));
  indexed.sort((a, b) => {
    const aValid = !Number.isNaN(a.ts);
    const bValid = !Number.isNaN(b.ts);
    if (aValid && bValid && b.ts !== a.ts) return b.ts - a.ts;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.idx - b.idx;
  });
  return indexed.map((item) => item.entry);
}

function pickCandidateHref(candidate: unknown, alternateOnly: boolean): string | null {
  if (typeof candidate === "string") {
    return alternateOnly ? candidate : null;
  }
  if (!candidate || typeof candidate !== "object") return null;
  const rec = candidate as Record<string, unknown>;
  const rel = typeof rec["@_rel"] === "string" ? rec["@_rel"].toLowerCase() : "alternate";
  if (alternateOnly && rel !== "alternate" && rec["@_rel"]) return null;
  const href = typeof rec["@_href"] === "string" ? rec["@_href"] : readNodeText(rec);
  return href || null;
}

function extractAtomEntryUrl(linkNode: unknown, baseFeedUrl?: string): string | null {
  const links = asArray(linkNode);
  for (const alternateOnly of [true, false]) {
    for (const candidate of links) {
      const href = pickCandidateHref(candidate, alternateOnly);
      if (!href) continue;
      const url = resolveHttpUrl(href, baseFeedUrl);
      if (url) return url;
    }
  }
  return null;
}

function extractRssItemUrl(item: Record<string, unknown>, baseFeedUrl?: string): string | null {
  const directLink = extractAtomEntryUrl(item.link, baseFeedUrl);
  if (directLink) return directLink;

  const guid = item.guid;
  if (typeof guid === "string") {
    return resolveHttpUrl(guid, baseFeedUrl);
  }
  if (guid && typeof guid === "object") {
    const rec = guid as Record<string, unknown>;
    const isPermaLink = String(rec["@_isPermaLink"] ?? "true").toLowerCase() !== "false";
    if (isPermaLink) {
      return resolveHttpUrl(readNodeText(rec), baseFeedUrl);
    }
  }
  return null;
}

export function isJsonFeedDocument(body: string): boolean {
  const trimmed = body.replace(/^\uFEFF/, "").trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return (
      typeof parsed.version === "string" &&
      /^https?:\/\/jsonfeed\.org\/version\/1(?:\.\d+)?$/i.test(parsed.version.trim()) &&
      Array.isArray(parsed.items)
    );
  } catch {
    return false;
  }
}

function resolveJsonItemUrl(item: Record<string, unknown>, baseFeedUrl?: string): string | null {
  for (const field of ["url", "external_url", "id"] as const) {
    const raw = item[field];
    if (typeof raw !== "string") continue;
    const resolved = resolveHttpUrl(raw, baseFeedUrl);
    if (resolved) return resolved;
  }
  return null;
}

export function parseJsonFeed(
  raw: string,
  baseFeedUrl?: string
): { title?: string; entries: ParsedFeedEntry[] } {
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim()) as Record<string, unknown>;
  if (
    typeof parsed.version !== "string" ||
    !/^https?:\/\/jsonfeed\.org\/version\/1(?:\.\d+)?$/i.test(parsed.version.trim()) ||
    !Array.isArray(parsed.items)
  ) {
    return { entries: [] };
  }

  const entries: ParsedFeedEntry[] = [];
  const seenUrls = new Set<string>();
  const feedTitle = typeof parsed.title === "string" ? cleanEntryTitle(parsed.title) : undefined;

  for (const rawItem of parsed.items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const candidateUrl = resolveJsonItemUrl(item, baseFeedUrl);
    if (!candidateUrl || seenUrls.has(candidateUrl)) continue;
    seenUrls.add(candidateUrl);

    const hasTitle = typeof item.title === "string" && item.title.trim();
    const fallbackTitle = typeof item.summary === "string" ? item.summary : "";
    const rawTitle = hasTitle ? (item.title as string) : fallbackTitle;
    entries.push({
      url: candidateUrl,
      title: cleanEntryTitle(rawTitle),
      publishedAt: parseOptionalIsoDate(item.date_published ?? item.date_modified),
    });
  }

  return { title: feedTitle, entries: sortEntriesNewestFirst(entries) };
}

function collectXmlRecordEntries(
  rawItems: unknown,
  extractUrl: (record: Record<string, unknown>) => string | null,
  extractDate: (record: Record<string, unknown>) => unknown,
  pushEntry: (url: string | null, rawTitle: unknown, rawDate: unknown) => void
): void {
  for (const rawItem of asArray(rawItems)) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const record = rawItem as Record<string, unknown>;
    pushEntry(extractUrl(record), record.title, extractDate(record));
  }
}

function parseXmlFeedInternal(
  xml: string,
  baseFeedUrl?: string
): { format: "rss" | "atom"; title?: string; entries: ParsedFeedEntry[]; matchedRoot: boolean } {
  const trimmed = xml.trim();
  if (!trimmed) return { format: "rss", entries: [], matchedRoot: false };

  const doc = xmlParser.parse(trimmed) as Record<string, unknown>;
  const entries: ParsedFeedEntry[] = [];
  const seenUrls = new Set<string>();
  let format: "rss" | "atom" = "rss";
  let feedTitle: string | undefined;
  let matchedRoot = false;

  const pushEntry = (url: string | null, rawTitle: unknown, rawDate: unknown) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    entries.push({
      url,
      title: cleanEntryTitle(readNodeText(rawTitle)),
      publishedAt: parseOptionalIsoDate(rawDate),
    });
  };

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? doc.channel) as Record<string, unknown> | undefined;
  if (channel) {
    matchedRoot = true;
    feedTitle = cleanEntryTitle(readNodeText(channel.title));
    collectXmlRecordEntries(
      channel.item,
      (item) => extractRssItemUrl(item, baseFeedUrl),
      (item) => item.pubDate ?? item["dc:date"] ?? item.published,
      pushEntry
    );
  }

  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Record<string, unknown> | undefined;
  if (rdf) {
    matchedRoot = true;
    const rdfChannel = rdf.channel as Record<string, unknown> | undefined;
    feedTitle ??= cleanEntryTitle(readNodeText(rdfChannel?.title));
    collectXmlRecordEntries(
      rdf.item,
      (item) => extractRssItemUrl(item, baseFeedUrl),
      (item) => item["dc:date"] ?? item.pubDate,
      pushEntry
    );
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    matchedRoot = true;
    format = "atom";
    feedTitle ??= cleanEntryTitle(readNodeText(feed.title));
    collectXmlRecordEntries(
      feed.entry,
      (entry) => extractAtomEntryUrl(entry.link, baseFeedUrl),
      (entry) => entry.published ?? entry.updated,
      pushEntry
    );
  }

  return {
    format,
    title: feedTitle,
    entries: sortEntriesNewestFirst(entries),
    matchedRoot,
  };
}

export function parseRssOrAtomXml(xml: string, baseFeedUrl?: string): ParsedFeedEntry[] {
  return parseXmlFeedInternal(xml, baseFeedUrl).entries;
}

export function parseFeedDocument(body: string, baseFeedUrl?: string): ParsedFeedDocument {
  if (isJsonFeedDocument(body)) {
    const parsedJson = parseJsonFeed(body, baseFeedUrl);
    return {
      format: "json",
      title: parsedJson.title,
      entries: parsedJson.entries,
    };
  }
  const parsedXml = parseXmlFeedInternal(body, baseFeedUrl);
  return {
    format: parsedXml.format,
    title: parsedXml.title,
    entries: parsedXml.entries,
  };
}

const FEED_TOO_LARGE_MESSAGE = "Feed vượt quá giới hạn 2MB.";

function detectCharset(contentType: string | null, firstChunk: Uint8Array | undefined): string {
  if (contentType) {
    const match = contentType.match(/charset\s*=\s*["']?([a-z0-9._-]+)["']?/i);
    if (match?.[1]) return match[1].toLowerCase();
  }
  if (firstChunk && firstChunk.byteLength > 0) {
    const asciiPrefix = new TextDecoder("latin1").decode(firstChunk.subarray(0, 256));
    const xmlMatch = asciiPrefix.match(/<\?xml[^<>]*encoding\s*=\s*["']([a-z0-9._-]+)["']/i);
    if (xmlMatch?.[1]) return xmlMatch[1].toLowerCase();
  }
  return "utf-8";
}

function createSafeTextDecoder(label: string): TextDecoder {
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("utf-8");
  }
}

async function readFeedBodyWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_XML_BYTES) {
    await response.body?.cancel();
    throw new Error(FEED_TOO_LARGE_MESSAGE);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  let decoder: TextDecoder | null = null;
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
    if (!decoder) {
      decoder = createSafeTextDecoder(detectCharset(response.headers.get("content-type"), value));
    }
    text += decoder.decode(value, { stream: true });
  }
  return decoder ? text + decoder.decode() : "";
}

type ClassifiedFeedError = {
  code: FeedErrorCode;
  status: 400 | 403 | 429 | 502;
  message: string;
};

function classifyFeedHttpError(error: FeedFetchHttpError): ClassifiedFeedError {
  if (error.status === 429) {
    const retryNote = error.retryAfter ? ` (Retry-After: ${error.retryAfter}s)` : "";
    return {
      code: "RATE_LIMITED",
      status: 429,
      message: `[RATE_LIMITED] Nguồn giới hạn tần suất (HTTP 429)${retryNote}. Hãy giãn lịch quét hoặc thử lại sau.`,
    };
  }
  if (error.status === 404 || error.status === 410) {
    return {
      code: "NOT_FOUND",
      status: 400,
      message: `[NOT_FOUND] Không tìm thấy feed tại URL này (HTTP ${error.status}). Hãy kiểm tra lại đường dẫn.`,
    };
  }
  if (error.status === 403 || error.status === 401) {
    const isCloudflare = error.cfMitigated || Boolean(error.server && /cloudflare/i.test(error.server));
    return {
      code: "BOT_BLOCKED",
      status: 403,
      message: isCloudflare
        ? `[BOT_BLOCKED] Site chặn bot tự động (HTTP ${error.status} Cloudflare) — thử RSSHub hoặc dán bài lẻ qua Quick Paste.`
        : `[BOT_BLOCKED] Tải feed thất bại với HTTP ${error.status} (bị từ chối truy cập hoặc chặn bot).`,
    };
  }
  return {
    code: "UPSTREAM_ERROR",
    status: 502,
    message: `[UPSTREAM_ERROR] Tải feed thất bại với HTTP ${error.status}.`,
  };
}

export function classifyFeedError(error: unknown): ClassifiedFeedError {
  if (error instanceof UrlGuardError) {
    return {
      code: error.code === "SSRF_BLOCKED" ? "SSRF_BLOCKED" : "MALFORMED_XML",
      status: error.status,
      message: error.message,
    };
  }
  if (error instanceof FeedFetchHttpError) {
    return classifyFeedHttpError(error);
  }
  if (error instanceof Error) {
    if (error.message.includes("2MB")) {
      return { code: "TOO_LARGE", status: 400, message: `[TOO_LARGE] ${FEED_TOO_LARGE_MESSAGE}` };
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return { code: "TIMEOUT", status: 502, message: "[TIMEOUT] Quá thời gian chờ phản hồi từ nguồn tin." };
    }
    return { code: "UPSTREAM_ERROR", status: 502, message: error.message.slice(0, 500) };
  }
  return { code: "UPSTREAM_ERROR", status: 502, message: "Lỗi không xác định khi quét feed." };
}

function looksLikeHtmlPayload(body: string, contentType: string | null): boolean {
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return true;
  }
  const headSlice = body.replace(/^\uFEFF/, "").trimStart().slice(0, 2048);
  return /^(?:<!doctype\s+html\b|<html(?=[\s>])|<head(?=[\s>]))/i.test(headSlice);
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

function validateFeedHopUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Feed URL phải dùng http hoặc https.");
  }
  if (url.username || url.password) {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không được chứa thông tin đăng nhập.");
  }
}

function buildFeedHeaders(etag?: string | null, lastModified?: string | null): Record<string, string> {
  return {
    Accept:
      "application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; CrisneNewsBot/1.0; +https://crisne.blog)",
    ...(etag ? { "If-None-Match": etag } : {}),
    ...(lastModified ? { "If-Modified-Since": lastModified } : {}),
  };
}

async function resolveFeedRedirectHop(
  response: Response,
  current: URL,
  hop: number
): Promise<URL> {
  const location = response.headers.get("location");
  await response.body?.cancel();
  if (!location) throw new Error(`Feed redirect (${response.status}) thiếu Location header.`);
  if (hop === MAX_FEED_REDIRECTS) {
    throw new UrlGuardError("TOO_MANY_REDIRECTS", 400, "Feed URL chuyển hướng quá nhiều lần.");
  }
  return new URL(location, current);
}

export async function fetchFeedWithCacheSafely(
  feedUrl: string,
  options: {
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
    etag?: string | null;
    lastModified?: string | null;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<FeedFetchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? FEED_FETCH_TIMEOUT_MS;
  const headers = buildFeedHeaders(options.etag, options.lastModified);
  let current = new URL(feedUrl.trim());

  for (let hop = 0; hop <= MAX_FEED_REDIRECTS; hop++) {
    validateFeedHopUrl(current);
    await assertPublicHostname(current.hostname, options.lookupFn);

    const hopSignal = options.signal
      ? AbortSignal.any([AbortSignal.timeout(timeoutMs), options.signal])
      : AbortSignal.timeout(timeoutMs);

    const response = await fetchFn(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers,
      signal: hopSignal,
    });

    if (response.status === 304) {
      await response.body?.cancel();
      return {
        kind: "not_modified",
        etag: response.headers.get("etag") ?? options.etag ?? null,
        lastModified: response.headers.get("last-modified") ?? options.lastModified ?? null,
      };
    }

    if (response.status >= 300 && response.status < 400) {
      current = await resolveFeedRedirectHop(response, current, hop);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new FeedFetchHttpError({
        status: response.status,
        cfMitigated: Boolean(response.headers.get("cf-mitigated")),
        server: response.headers.get("server"),
        retryAfter: response.headers.get("retry-after"),
      });
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

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
// The daily cron fires anywhere within its hour, so runs are 23-25h apart. A slack of 22h counts
// cron days instead of exact hours: a daily source pulls every run unless it was pulled in the last 2h,
// and a 3-day source never pulls on day 2 (at most 48h59m elapsed, below 3 days - 22h = 50h).
const FETCH_INTERVAL_SLACK_MS = 22 * HOUR_MS;

/**
 * True when the daily cron run at `now` should pull this source: roughly `fetchIntervalDays`
 * have passed since the last pull (or it was never pulled).
 */
export function isNewsSourceDue(
  source: { fetchIntervalDays: number; lastFetchedAt: Date | null },
  now: number = Date.now()
): boolean {
  if (!source.lastFetchedAt) return true;
  const elapsedMs = now - source.lastFetchedAt.getTime();
  return elapsedMs >= source.fetchIntervalDays * DAY_MS - FETCH_INTERVAL_SLACK_MS;
}

interface SyncSourceInput {
  id: string;
  name: string;
  feedUrl: string;
  domain: string;
  etag: string | null;
  lastModified: string | null;
}

interface SyncSourceOptions {
  preloadedSourceDomains: string[];
  maxItems: number;
  lookupFn?: HostLookupFn;
  fetchFn?: typeof fetch;
}

async function ingestFeedEntriesForSource(
  source: SyncSourceInput,
  entries: ParsedFeedEntry[],
  opts: SyncSourceOptions
): Promise<{ queued: number; duplicates: number; skippedErrors: number; skippedReasons: CronSkippedReasonDto[] }> {
  const feedHost = new URL(source.feedUrl).hostname.toLowerCase().replace(/^www\./, "");
  let queued = 0;
  let duplicates = 0;
  let skippedErrors = 0;
  const skippedReasons: CronSkippedReasonDto[] = [];

  for (const entry of entries) {
    try {
      const res = await enqueueNewsUrl(
        {
          url: entry.url,
          title: entry.title,
          origin: "cron",
          sourceId: source.id,
          publishedAt: entry.publishedAt,
        },
        {
          preloadedSourceDomains: opts.preloadedSourceDomains,
          extraAllowedDomains: [source.domain, feedHost],
          lookupFn: opts.lookupFn,
          fetchFn: opts.fetchFn,
          skipWake: true,
        }
      );
      if (res.status === "queued") queued++;
      else duplicates++;
    } catch (entryError) {
      skippedErrors++;
      if (skippedReasons.length < 5) {
        skippedReasons.push({
          url: entry.url,
          code: entryError instanceof UrlGuardError ? entryError.code : "INGEST_REJECTED",
        });
      }
    }
  }
  return { queued, duplicates, skippedErrors, skippedReasons };
}

async function syncSingleNewsSource(
  source: SyncSourceInput,
  opts: SyncSourceOptions
): Promise<CronSyncSourceResult> {
  let queued = 0;
  let duplicates = 0;
  let skippedErrors = 0;
  let skippedReasons: CronSkippedReasonDto[] = [];
  let notModified = false;
  let sourceError: string | null = null;

  try {
    const feedRes = await fetchFeedWithCacheSafely(source.feedUrl, {
      lookupFn: opts.lookupFn,
      fetchFn: opts.fetchFn,
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
      const isJson = isJsonFeedDocument(feedRes.xml);
      const xmlParsed = isJson ? null : parseXmlFeedInternal(feedRes.xml, source.feedUrl);
      if (!isJson && !xmlParsed?.matchedRoot && looksLikeHtmlPayload(feedRes.xml, feedRes.contentType)) {
        sourceError =
          "[BOT_BLOCKED] Nguồn trả về trang HTML thay vì RSS/Atom/JSON Feed (có thể bị chặn bot hoặc đổi URL).";
        await prisma.newsSource.update({
          where: { id: source.id },
          data: { lastFetchedAt: new Date(), lastError: sourceError },
        });
      } else {
        const parsedEntries = isJson
          ? parseJsonFeed(feedRes.xml, source.feedUrl).entries
          : (xmlParsed?.entries ?? []);
        const counts = await ingestFeedEntriesForSource(source, parsedEntries.slice(0, opts.maxItems), opts);
        queued = counts.queued;
        duplicates = counts.duplicates;
        skippedErrors = counts.skippedErrors;
        skippedReasons = counts.skippedReasons;

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
    }
  } catch (error) {
    sourceError = classifyFeedError(error).message;
    await prisma.newsSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastError: sourceError },
    });
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    queued,
    duplicates,
    skippedErrors,
    ...(skippedReasons.length > 0 ? { skippedReasons } : {}),
    ...(notModified ? { notModified: true } : {}),
    error: sourceError,
  };
}

function resolveCronScanMode(options: { onlyDue?: boolean; sourceId?: string }): "cron" | "manual" | "manual_all" {
  if (options.onlyDue) return "cron";
  return options.sourceId ? "manual" : "manual_all";
}

export async function syncNewsSourcesCron(
  options: {
    sourceId?: string;
    /** Scheduled runs only: pull just the sources due at this hour (see `isNewsSourceDue`). */
    onlyDue?: boolean;
    maxItemsPerSource?: number;
    timeBudgetMs?: number;
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
  } = {}
): Promise<CronSyncSummary> {
  const startedAt = Date.now();
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_CRON_TIME_BUDGET_MS;
  const maxItems = Math.min(Math.max(1, options.maxItemsPerSource ?? resolveDefaultCronMaxItems()), 30);
  const [candidateSources, allEnabledSources] = await Promise.all([
    prisma.newsSource.findMany({
      where: options.sourceId ? { id: options.sourceId } : { enabled: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.newsSource.findMany({
      where: { enabled: true },
      select: { domain: true },
    }),
  ]);
  const sources =
    options.onlyDue && !options.sourceId
      ? candidateSources.filter((source) => isNewsSourceDue(source, startedAt))
      : candidateSources;
  const syncOpts: SyncSourceOptions = {
    preloadedSourceDomains: allEnabledSources.map((s) => s.domain),
    maxItems,
    lookupFn: options.lookupFn,
    fetchFn: options.fetchFn,
  };

  const results: Array<CronSyncSourceResult | undefined> = new Array(sources.length);
  const processOneSource = async (source: (typeof sources)[number], index: number): Promise<void> => {
    if (index > 0 && Date.now() - startedAt >= timeBudgetMs) {
      results[index] = {
        sourceId: source.id,
        sourceName: source.name,
        queued: 0,
        duplicates: 0,
        skippedErrors: 0,
        error: "[TIMEOUT] Tạm hoãn nguồn này vì gần chạm giới hạn thời gian cron.",
      };
      return;
    }
    results[index] = await syncSingleNewsSource(source, syncOpts);
  };

  for (let i = 0; i < sources.length; i += CRON_SOURCE_CONCURRENCY) {
    const batch = sources.slice(i, i + CRON_SOURCE_CONCURRENCY);
    await Promise.allSettled(batch.map((source, offset) => processOneSource(source, i + offset)));
  }

  const finalResults = results.filter((item): item is CronSyncSourceResult => Boolean(item));
  const totalQueued = finalResults.reduce((acc, r) => acc + r.queued, 0);
  const totalDuplicates = finalResults.reduce((acc, r) => acc + r.duplicates, 0);

  if (totalQueued > 0) {
    notifyNewsWorker();
  }

  try {
    await recordNewsSourceScans(finalResults, resolveCronScanMode(options));
  } catch (error) {
    // History is best-effort: a failed write must not fail a sync that already queued items
    console.error("[news] Failed to record source scan history:", error);
  }

  return {
    sourcesProcessed: sources.length,
    totalQueued,
    totalDuplicates,
    results: finalResults,
  };
}
