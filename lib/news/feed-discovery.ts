import { fetchFeedWithCacheSafely, parseRssOrAtomXml } from "./rss-fetcher";
import { type HostLookupFn, UrlGuardError } from "./url-guard";

const MAX_HEAD_SCAN_BYTES = 131_072;
const DISCOVERY_PROBE_TIMEOUT_MS = 5_000;
const PROBE_BATCH_SIZE = 3;
const MAX_ALTERNATE_CANDIDATES = 5;

const FEED_MIME_REGEX = /^(?:application|text)\/(?:rss\+xml|atom\+xml|xml)$/i;
const FEED_MIME_SUFFIX_REGEX = /\+(?:rss|atom)\b/i;

const COMMON_FEED_PATHS = [
  "/feed",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/atom",
  "/rss",
  "/index.xml",
] as const;

export class FeedDiscoveryError extends Error {
  readonly status = 400;
  readonly code = "FEED_NOT_FOUND";

  constructor(
    message = "Trang này là HTML và không tìm thấy RSS/Atom feed tự động. Vui lòng nhập trực tiếp RSS/Atom XML URL."
  ) {
    super(message);
    this.name = "FeedDiscoveryError";
  }
}

export interface ResolvedFeedResult {
  feedUrl: string;
  discovered: boolean;
  siteHost: string;
}

function normalizeHost(rawUrl: string): string {
  return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;|&#x26;/gi, "&")
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'");
}

function stripLeadingXmlProlog(text: string): string {
  let remaining = text.replace(/^\uFEFF/, "").trimStart();
  while (remaining.startsWith("<?") || remaining.startsWith("<!--")) {
    if (remaining.startsWith("<?")) {
      const end = remaining.indexOf("?>");
      if (end === -1) break;
      remaining = remaining.slice(end + 2).trimStart();
    } else {
      const end = remaining.indexOf("-->");
      if (end === -1) break;
      remaining = remaining.slice(end + 3).trimStart();
    }
  }
  return remaining;
}

export function isRssOrAtomDocument(
  body: string,
  baseUrl?: string,
  contentType?: string | null
): boolean {
  const withoutBom = body.replace(/^\uFEFF/, "").trim();
  if (!withoutBom) return false;

  const afterProlog = stripLeadingXmlProlog(withoutBom);
  if (
    /^<(?:rss|feed|rdf:RDF|RDF)(?=[\s>])/i.test(afterProlog)
  ) {
    return true;
  }

  // Fallback to full XML parser for non-standard wrappers containing RSS/Atom entries
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return false;
  }
  try {
    return parseRssOrAtomXml(withoutBom, baseUrl).length > 0;
  } catch {
    return false;
  }
}

export function isHtmlDocument(body: string, contentType?: string | null): boolean {
  if (isRssOrAtomDocument(body, undefined, contentType)) return false;
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return true;
  }
  const headSlice = body.replace(/^\uFEFF/, "").trimStart().slice(0, 2048);
  return /^(?:<!doctype\s+html\b|<html(?=[\s>])|<head(?=[\s>]))/i.test(headSlice);
}

function parseLinkAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrText)) !== null) {
    const key = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtmlEntities(rawValue).trim();
  }
  return attrs;
}

function isFeedMimeType(rawType: string): boolean {
  const mediaType = rawType.split(";")[0]?.trim() ?? "";
  if (!mediaType) return false;
  return FEED_MIME_REGEX.test(mediaType) || FEED_MIME_SUFFIX_REGEX.test(mediaType);
}

function scoreCandidate(url: string, mimeType: string, title: string): number {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const isCommentsFeed =
    /\/comments\/feed\/?(?:$|\?)/i.test(lowerUrl) ||
    /\bcomments\b|bình luận/i.test(lowerTitle);
  if (isCommentsFeed) return 3;

  const lowerType = mimeType.toLowerCase();
  if (lowerType.includes("rss")) return 0;
  if (lowerType.includes("atom")) return 1;
  return 2;
}

/**
 * Extracts RSS/Atom `<link rel="alternate">` hrefs from an HTML head block,
 * prioritizing main post feeds (RSS/Atom) over generic XML or comment feeds.
 */
export function extractAlternateFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  const headEnd = html.search(/<\/head>/i);
  const headChunk = (headEnd !== -1 ? html.slice(0, headEnd) : html).slice(0, MAX_HEAD_SCAN_BYTES);
  const sanitizedHead = headChunk
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const scored: { url: string; score: number; order: number }[] = [];
  const linkTagRegex = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = linkTagRegex.exec(sanitizedHead)) !== null) {
    const attrs = parseLinkAttributes(match[1]);
    const relTokens = (attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!relTokens.includes("alternate")) continue;
    if (!isFeedMimeType(attrs.type ?? "")) continue;
    if (!attrs.href) continue;

    let resolved: URL;
    try {
      resolved = new URL(attrs.href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;

    scored.push({
      url: resolved.toString(),
      score: scoreCandidate(resolved.toString(), attrs.type ?? "", attrs.title ?? ""),
      order: order++,
    });
  }

  scored.sort((a, b) => a.score - b.score || a.order - b.order);

  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of scored) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push(item.url);
  }
  return results;
}

export function buildCommonFeedCandidates(pageUrl: string): string[] {
  const parsed = new URL(pageUrl);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  const candidates: string[] = [];

  if (basePath) {
    candidates.push(
      `${parsed.origin}${basePath}/feed`,
      `${parsed.origin}${basePath}/rss.xml`,
      `${parsed.origin}${basePath}/atom.xml`
    );
  }

  for (const suffix of COMMON_FEED_PATHS) {
    candidates.push(`${parsed.origin}${suffix}`);
  }

  return Array.from(new Set(candidates)).filter((url) => url !== pageUrl);
}

async function probeFeedCandidate(
  candidateUrl: string,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch }
): Promise<{ feedUrl: string } | { ssrfError: UrlGuardError } | null> {
  try {
    const res = await fetchFeedWithCacheSafely(candidateUrl, {
      lookupFn: options.lookupFn,
      fetchFn: options.fetchFn,
      timeoutMs: DISCOVERY_PROBE_TIMEOUT_MS,
    });
    if (res.kind !== "ok") return null;
    if (!isRssOrAtomDocument(res.xml, res.finalUrl, res.contentType)) return null;
    return { feedUrl: res.finalUrl };
  } catch (error) {
    if (error instanceof UrlGuardError && error.code === "SSRF_BLOCKED") {
      return { ssrfError: error };
    }
    return null;
  }
}

/**
 * Resolves a user-supplied URL (direct XML feed or blog homepage HTML) into a valid RSS/Atom feed URL.
 * Non-HTML HTTP/network errors fall back to the original URL so unreachable feeds can still be saved
 * and tracked by cron `lastError`.
 */
export async function resolveFeedUrl(
  rawUrl: string,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch } = {}
): Promise<ResolvedFeedResult> {
  const normalizedInput = rawUrl.trim();
  const canonicalInput = new URL(normalizedInput).toString();
  const inputHost = normalizeHost(normalizedInput);

  let initialRes;
  try {
    initialRes = await fetchFeedWithCacheSafely(normalizedInput, {
      lookupFn: options.lookupFn,
      fetchFn: options.fetchFn,
      timeoutMs: 8_000,
    });
  } catch (error) {
    if (error instanceof UrlGuardError) throw error;
    return { feedUrl: normalizedInput, discovered: false, siteHost: inputHost };
  }

  if (initialRes.kind !== "ok") {
    return { feedUrl: normalizedInput, discovered: false, siteHost: inputHost };
  }

  const finalHost = normalizeHost(initialRes.finalUrl);

  if (isRssOrAtomDocument(initialRes.xml, initialRes.finalUrl, initialRes.contentType)) {
    return {
      feedUrl: initialRes.finalUrl,
      discovered: initialRes.finalUrl !== canonicalInput,
      siteHost: finalHost,
    };
  }

  if (!isHtmlDocument(initialRes.xml, initialRes.contentType)) {
    return { feedUrl: normalizedInput, discovered: false, siteHost: inputHost };
  }

  const alternateLinks = extractAlternateFeedLinksFromHtml(initialRes.xml, initialRes.finalUrl).slice(
    0,
    MAX_ALTERNATE_CANDIDATES
  );
  let explicitSsrfError: UrlGuardError | null = null;

  for (const candidate of alternateLinks) {
    const probed = await probeFeedCandidate(candidate, options);
    if (!probed) continue;
    if ("ssrfError" in probed) {
      explicitSsrfError ??= probed.ssrfError;
      continue;
    }
    return { feedUrl: probed.feedUrl, discovered: true, siteHost: finalHost };
  }

  const alternateSet = new Set(alternateLinks);
  const commonCandidates = buildCommonFeedCandidates(initialRes.finalUrl).filter(
    (url) => !alternateSet.has(url)
  );

  for (let i = 0; i < commonCandidates.length; i += PROBE_BATCH_SIZE) {
    const batch = commonCandidates.slice(i, i + PROBE_BATCH_SIZE);
    const results = await Promise.all(batch.map((candidate) => probeFeedCandidate(candidate, options)));
    for (const probed of results) {
      if (probed && "feedUrl" in probed) {
        return { feedUrl: probed.feedUrl, discovered: true, siteHost: finalHost };
      }
    }
  }

  if (explicitSsrfError) throw explicitSsrfError;
  throw new FeedDiscoveryError();
}
