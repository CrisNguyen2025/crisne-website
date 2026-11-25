import { trimTrailingChar } from "@/lib/utils";
import {
  type FeedFormat,
  extractYouTubeChannelFeedFromHtml,
  resolvePlatformFeedCandidates,
} from "./platform-feeds";
import {
  type FeedErrorCode,
  classifyFeedError,
  fetchFeedWithCacheSafely,
  isJsonFeedDocument,
  parseFeedDocument,
  parseRssOrAtomXml,
} from "./rss-fetcher";
import type {
  NewsSourcePreviewCandidateDto,
  NewsSourcePreviewDto,
} from "./schemas";
import {
  type HostLookupFn,
  UrlGuardError,
  assertPublicHostname,
  getAllowedDomains,
  isDomainAllowed,
} from "./url-guard";

const MAX_HEAD_SCAN_BYTES = 131_072;
const DISCOVERY_PROBE_TIMEOUT_MS = 5_000;
const DEFAULT_DISCOVERY_DEADLINE_MS = 9_000;
const PROBE_BATCH_SIZE = 3;
const MAX_ALTERNATE_CANDIDATES = 5;

const FEED_MIME_REGEX =
  /^(?:application\/feed\+json|(?:application|text)\/(?:rss\+xml|atom\+xml|xml))$/i;
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

// Feed suggestions when the pasted page has none: section pages on the same site and GitHub repos it links to
const SUGGESTION_DEADLINE_MS = 6_000;
const MAX_SUGGESTION_SECTION_PAGES = 3;
const MAX_SUGGESTION_GITHUB_REPOS = 2;
const SECTION_NAME_REGEX =
  /^(?:news|newsroom|blog|blogs|changelog|releases|updates|articles|posts|engineering|research|press)$/i;

export class FeedDiscoveryError extends Error {
  readonly status: number;
  readonly code: FeedErrorCode | "FEED_NOT_FOUND";
  /** Verified feeds found on pages the failed page links to; empty when none. */
  readonly suggestions: NewsSourcePreviewCandidateDto[];

  constructor(
    message = "Trang này là HTML và không tìm thấy RSS/Atom/JSON feed tự động. Vui lòng nhập trực tiếp Feed URL.",
    code: FeedErrorCode | "FEED_NOT_FOUND" = "FEED_NOT_FOUND",
    status = 400,
    suggestions: NewsSourcePreviewCandidateDto[] = []
  ) {
    super(message);
    this.name = "FeedDiscoveryError";
    this.code = code;
    this.status = status;
    this.suggestions = suggestions;
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
  if (/^<(?:rss|feed|rdf:RDF|RDF)(?=[\s>])/i.test(afterProlog)) {
    return true;
  }

  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return false;
  }
  try {
    return parseRssOrAtomXml(withoutBom, baseUrl).length > 0;
  } catch {
    return false;
  }
}

export function isFeedDocument(
  body: string,
  baseUrl?: string,
  contentType?: string | null
): boolean {
  return isJsonFeedDocument(body) || isRssOrAtomDocument(body, baseUrl, contentType);
}

export function isHtmlDocument(body: string, contentType?: string | null): boolean {
  if (isFeedDocument(body, undefined, contentType)) return false;
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return true;
  }
  const headSlice = body.replace(/^\uFEFF/, "").trimStart().slice(0, 2048);
  return /^(?:<!doctype\s+html\b|<html(?=[\s>])|<head(?=[\s>]))/i.test(headSlice);
}

function readAttributeValue(attrText: string, start: number): { value: string; nextIndex: number } {
  let pos = start;
  while (pos < attrText.length && /\s/.test(attrText[pos])) pos++;
  if (attrText[pos] !== "=") {
    return { value: "", nextIndex: pos };
  }
  pos++;
  while (pos < attrText.length && /\s/.test(attrText[pos])) pos++;
  const quote = attrText[pos];
  if (quote === '"' || quote === "'") {
    const endQuote = attrText.indexOf(quote, pos + 1);
    const valEnd = endQuote === -1 ? attrText.length : endQuote;
    return { value: attrText.slice(pos + 1, valEnd), nextIndex: endQuote === -1 ? attrText.length : endQuote + 1 };
  }
  let valEnd = pos;
  while (valEnd < attrText.length && !/[\s"'=<>`]/.test(attrText[valEnd])) valEnd++;
  return { value: attrText.slice(pos, valEnd), nextIndex: valEnd };
}

function parseLinkAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  const len = attrText.length;

  while (pos < len) {
    while (pos < len && /[\s/]/.test(attrText[pos])) pos++;
    if (pos >= len) break;
    const keyStart = pos;
    while (pos < len && /[a-zA-Z0-9_.:-]/.test(attrText[pos])) pos++;
    if (pos === keyStart) {
      pos++;
      continue;
    }
    const key = attrText.slice(keyStart, pos).toLowerCase();
    const { value, nextIndex } = readAttributeValue(attrText, pos);
    attrs[key] = decodeHtmlEntities(value).trim();
    pos = nextIndex;
  }
  return attrs;
}

function isFeedMimeType(rawType: string, href: string): boolean {
  const mediaType = rawType.split(";")[0]?.trim() ?? "";
  if (!mediaType) return false;
  if (FEED_MIME_REGEX.test(mediaType) || FEED_MIME_SUFFIX_REGEX.test(mediaType)) {
    return true;
  }
  if (/^application\/json$/i.test(mediaType) && /feed\.json$/i.test(href)) {
    return true;
  }
  return false;
}

function inferMimeFormat(rawType: string): FeedFormat | undefined {
  const lower = rawType.toLowerCase();
  if (lower.includes("json")) return "json";
  if (lower.includes("atom")) return "atom";
  if (lower.includes("rss") || lower.includes("xml")) return "rss";
  return undefined;
}

function scoreCandidate(url: string, mimeType: string, title: string): number {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const isCommentsFeed =
    /\/comments\/feed\/?(?:$|\?)/i.test(lowerUrl) ||
    /\bcomments\b|bình luận/i.test(lowerTitle);
  if (isCommentsFeed) return 4;

  const lowerType = mimeType.toLowerCase();
  if (lowerType.includes("rss")) return 0;
  if (lowerType.includes("atom")) return 1;
  if (lowerType.includes("feed+json") || lowerType.includes("json")) return 2;
  return 3;
}

interface ScoredAlternateCandidate {
  url: string;
  title?: string;
  format?: FeedFormat;
  score: number;
  order: number;
}

function parseAlternateLinkCandidate(
  attrText: string,
  baseUrl: string,
  order: number
): ScoredAlternateCandidate | null {
  const attrs = parseLinkAttributes(attrText);
  const relTokens = (attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!relTokens.includes("alternate") || !attrs.href) return null;
  if (!isFeedMimeType(attrs.type ?? "", attrs.href)) return null;

  let resolved: URL;
  try {
    resolved = new URL(attrs.href, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;

  const resolvedUrl = resolved.toString();
  const cleanTitle = (attrs.title ?? "").trim() || undefined;
  return {
    url: resolvedUrl,
    title: cleanTitle,
    format: inferMimeFormat(attrs.type ?? ""),
    score: scoreCandidate(resolvedUrl, attrs.type ?? "", attrs.title ?? ""),
    order,
  };
}

export function extractAlternateFeedCandidatesFromHtml(
  html: string,
  baseUrl: string
): NewsSourcePreviewCandidateDto[] {
  const headEnd = html.search(/<\/head>/i);
  const headChunk = (headEnd !== -1 ? html.slice(0, headEnd) : html).slice(0, MAX_HEAD_SCAN_BYTES);
  const sanitizedHead = headChunk
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const scored: ScoredAlternateCandidate[] = [];
  const linkTagRegex = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = linkTagRegex.exec(sanitizedHead)) !== null) {
    const candidate = parseAlternateLinkCandidate(match[1], baseUrl, order++);
    if (candidate) scored.push(candidate);
  }

  scored.sort((a, b) => a.score - b.score || a.order - b.order);

  const seen = new Set<string>();
  const results: NewsSourcePreviewCandidateDto[] = [];
  for (const item of scored) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push({
      url: item.url,
      ...(item.title ? { title: item.title } : {}),
      ...(item.format ? { format: item.format } : {}),
    });
  }
  return results;
}

export function extractAlternateFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  return extractAlternateFeedCandidatesFromHtml(html, baseUrl).map((item) => item.url);
}

function tryAddGithubSuggestion(
  segments: string[],
  siteName: string,
  seen: Set<string>,
  githubRepos: string[]
): void {
  if (segments.length < 2) return;
  const repoUrl = `https://github.com/${segments[0]}/${segments[1].replace(/\.git$/i, "")}`;
  const key = repoUrl.toLowerCase();
  if (seen.has(key) || !key.includes(siteName.toLowerCase())) return;
  if (resolvePlatformFeedCandidates(repoUrl).length === 0) return;
  seen.add(key);
  githubRepos.push(repoUrl);
}

function resolveSectionPageUrl(
  url: URL,
  host: string,
  pageHost: string,
  segments: string[]
): string | null {
  if (host === pageHost && segments.length === 1 && SECTION_NAME_REGEX.test(segments[0])) {
    return `${url.origin}/${segments[0]}/`;
  }
  if (host.endsWith(`.${pageHost}`) && segments.length === 0) {
    const label = host.slice(0, -(pageHost.length + 1));
    if (SECTION_NAME_REGEX.test(label)) return `${url.origin}/`;
  }
  return null;
}

function classifySuggestionAnchor(
  attrText: string,
  pageUrl: string,
  pageHost: string,
  siteName: string,
  seen: Set<string>,
  sectionPages: string[],
  githubRepos: string[]
): void {
  const href = parseLinkAttributes(attrText).href;
  if (!href) return;
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  url.hash = "";
  url.search = "";
  const host = normalizeHost(url.toString());
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "github.com") {
    tryAddGithubSuggestion(segments, siteName, seen, githubRepos);
    return;
  }

  const sectionPage = resolveSectionPageUrl(url, host, pageHost, segments);
  if (!sectionPage) return;
  const key = sectionPage.toLowerCase();
  if (seen.has(key) || seen.has(trimTrailingChar(key, "/"))) return;
  seen.add(key);
  sectionPages.push(sectionPage);
}

/**
 * Pages worth checking for a feed when `pageUrl` has none: same-site section pages
 * (`/news`, `/blog`, `blog.example.com`, ...) and GitHub repos named after the site
 * (nestjs.com → github.com/nestjs/nest); unrelated repos such as sponsors are skipped.
 */
export function extractFeedSuggestionPagesFromHtml(
  html: string,
  pageUrl: string
): { sectionPages: string[]; githubRepos: string[] } {
  const pageHost = normalizeHost(pageUrl);
  const pageCanonical = new URL(pageUrl).toString();
  // "nestjs" for nestjs.com, "openai" for openai.com: only repos under that name are suggested
  const siteName = pageHost.split(".").slice(-2)[0] ?? pageHost;
  const sanitized = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const sectionPages: string[] = [];
  const githubRepos: string[] = [];
  const seen = new Set<string>([pageCanonical]);
  const anchorRegex = /<a\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(sanitized)) !== null) {
    classifySuggestionAnchor(match[1], pageUrl, pageHost, siteName, seen, sectionPages, githubRepos);
  }

  return {
    sectionPages: sectionPages.slice(0, MAX_SUGGESTION_SECTION_PAGES),
    githubRepos: githubRepos.slice(0, MAX_SUGGESTION_GITHUB_REPOS),
  };
}

export function buildCommonFeedCandidates(pageUrl: string): string[] {
  const parsed = new URL(pageUrl);
  const basePath = trimTrailingChar(parsed.pathname, "/");
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
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<
  | { feedUrl: string; body: string; contentType: string | null }
  | { ssrfError: UrlGuardError }
  | null
> {
  try {
    const res = await fetchFeedWithCacheSafely(candidateUrl, {
      lookupFn: options.lookupFn,
      fetchFn: options.fetchFn,
      timeoutMs: DISCOVERY_PROBE_TIMEOUT_MS,
      signal: options.signal,
    });
    if (res.kind !== "ok") return null;
    if (!isFeedDocument(res.xml, res.finalUrl, res.contentType)) return null;
    return { feedUrl: res.finalUrl, body: res.xml, contentType: res.contentType };
  } catch (error) {
    if (error instanceof UrlGuardError && error.code === "SSRF_BLOCKED") {
      return { ssrfError: error };
    }
    return null;
  }
}

function readFeedTitle(body: string, feedUrl: string): { title?: string; format?: FeedFormat } {
  try {
    const parsed = parseFeedDocument(body, feedUrl);
    return { title: parsed.title, format: parsed.format };
  } catch {
    return {};
  }
}

/** Light feed lookup on one suggested page: platform mapping, the page itself, its alternate links, then its own path. */
async function findFeedOnPage(
  pageUrl: string,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch; signal?: AbortSignal }
): Promise<NewsSourcePreviewCandidateDto | null> {
  const toCandidate = (
    probed: Awaited<ReturnType<typeof probeFeedCandidate>>,
    fallbackTitle?: string
  ): NewsSourcePreviewCandidateDto | null => {
    if (!probed || "ssrfError" in probed) return null;
    const { title, format } = readFeedTitle(probed.body, probed.feedUrl);
    const finalTitle = title ?? fallbackTitle;
    return {
      url: probed.feedUrl,
      ...(finalTitle ? { title: finalTitle } : {}),
      ...(format ? { format } : {}),
    };
  };

  const platform = resolvePlatformFeedCandidates(pageUrl)[0];
  if (platform) {
    return toCandidate(await probeFeedCandidate(platform.url, options), platform.title);
  }

  let res;
  try {
    res = await fetchFeedWithCacheSafely(pageUrl, {
      ...options,
      timeoutMs: DISCOVERY_PROBE_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
  if (res.kind !== "ok") return null;
  if (isFeedDocument(res.xml, res.finalUrl, res.contentType)) {
    return toCandidate({ feedUrl: res.finalUrl, body: res.xml, contentType: res.contentType });
  }
  if (!isHtmlDocument(res.xml, res.contentType)) return null;

  for (const alternate of extractAlternateFeedCandidatesFromHtml(res.xml, res.finalUrl).slice(0, 2)) {
    const found = toCandidate(await probeFeedCandidate(alternate.url, options), alternate.title);
    if (found) return found;
  }

  // Only the section's own paths (/news/rss.xml, ...); the site root was already tried
  const hasPath = trimTrailingChar(new URL(res.finalUrl).pathname, "/") !== "";
  if (!hasPath) return null;
  const sectionCandidates = buildCommonFeedCandidates(res.finalUrl).slice(0, 3);
  const probed = await Promise.all(
    sectionCandidates.map((candidate) => probeFeedCandidate(candidate, options))
  );
  for (const item of probed) {
    const found = toCandidate(item);
    if (found) return found;
  }
  return null;
}

/** Verified feeds behind the section pages and GitHub repos that a feed-less HTML page links to. */
export async function suggestFeedsFromHtml(
  html: string,
  pageUrl: string,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch; deadlineMs?: number } = {}
): Promise<NewsSourcePreviewCandidateDto[]> {
  const { sectionPages, githubRepos } = extractFeedSuggestionPagesFromHtml(html, pageUrl);
  const pages = [...sectionPages, ...githubRepos];
  if (pages.length === 0) return [];

  const lookupOptions = {
    lookupFn: options.lookupFn,
    fetchFn: options.fetchFn,
    signal: AbortSignal.timeout(options.deadlineMs ?? SUGGESTION_DEADLINE_MS),
  };
  const found = await Promise.all(
    pages.map((page) => findFeedOnPage(page, lookupOptions).catch(() => null))
  );

  const seen = new Set<string>();
  const suggestions: NewsSourcePreviewCandidateDto[] = [];
  for (const candidate of found) {
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    suggestions.push(candidate);
  }
  return suggestions;
}

type ProbeSharedOptions = { lookupFn?: HostLookupFn; fetchFn?: typeof fetch; signal: AbortSignal };

async function probeCommonCandidatesBatch(
  candidates: string[],
  sharedOptions: ProbeSharedOptions
): Promise<{ feedUrl: string; body: string } | null> {
  for (let i = 0; i < candidates.length; i += PROBE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + PROBE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((candidate) => probeFeedCandidate(candidate, sharedOptions))
    );
    for (const probed of results) {
      if (probed && "feedUrl" in probed) {
        return { feedUrl: probed.feedUrl, body: probed.body };
      }
    }
  }
  return null;
}

async function resolveHtmlFeedCandidates(
  initialRes: { xml: string; finalUrl: string },
  finalHost: string,
  sharedOptions: ProbeSharedOptions
): Promise<string> {
  if (finalHost === "youtube.com" || finalHost === "m.youtube.com") {
    const ytFeed = extractYouTubeChannelFeedFromHtml(initialRes.xml);
    if (ytFeed) {
      const probedYt = await probeFeedCandidate(ytFeed, sharedOptions);
      if (probedYt && "feedUrl" in probedYt) return probedYt.feedUrl;
    }
  }

  const alternateLinks = extractAlternateFeedLinksFromHtml(
    initialRes.xml,
    initialRes.finalUrl
  ).slice(0, MAX_ALTERNATE_CANDIDATES);
  let explicitSsrfError: UrlGuardError | null = null;

  for (const candidate of alternateLinks) {
    const probed = await probeFeedCandidate(candidate, sharedOptions);
    if (!probed) continue;
    if ("ssrfError" in probed) {
      explicitSsrfError ??= probed.ssrfError;
      continue;
    }
    return probed.feedUrl;
  }

  const alternateSet = new Set(alternateLinks);
  const commonCandidates = buildCommonFeedCandidates(initialRes.finalUrl).filter(
    (url) => !alternateSet.has(url)
  );
  const commonMatch = await probeCommonCandidatesBatch(commonCandidates, sharedOptions);
  if (commonMatch) return commonMatch.feedUrl;

  if (explicitSsrfError) throw explicitSsrfError;
  throw new FeedDiscoveryError();
}

export async function resolveFeedUrl(
  rawUrl: string,
  options: {
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
    deadlineMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ResolvedFeedResult> {
  const normalizedInput = rawUrl.trim();
  const canonicalInput = new URL(normalizedInput).toString();
  const inputHost = normalizeHost(normalizedInput);
  const deadlineSignal =
    options.signal ?? AbortSignal.timeout(options.deadlineMs ?? DEFAULT_DISCOVERY_DEADLINE_MS);
  const sharedOptions: ProbeSharedOptions = {
    lookupFn: options.lookupFn,
    fetchFn: options.fetchFn,
    signal: deadlineSignal,
  };

  for (const candidate of resolvePlatformFeedCandidates(normalizedInput).slice(0, 3)) {
    const probed = await probeFeedCandidate(candidate.url, sharedOptions);
    if (!probed) continue;
    if ("ssrfError" in probed) throw probed.ssrfError;
    return {
      feedUrl: probed.feedUrl,
      discovered: probed.feedUrl !== canonicalInput,
      siteHost: inputHost,
    };
  }

  let initialRes;
  try {
    initialRes = await fetchFeedWithCacheSafely(normalizedInput, {
      ...sharedOptions,
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
  if (isFeedDocument(initialRes.xml, initialRes.finalUrl, initialRes.contentType)) {
    return {
      feedUrl: initialRes.finalUrl,
      discovered: initialRes.finalUrl !== canonicalInput,
      siteHost: finalHost,
    };
  }
  if (!isHtmlDocument(initialRes.xml, initialRes.contentType)) {
    return { feedUrl: normalizedInput, discovered: false, siteHost: inputHost };
  }

  const discoveredUrl = await resolveHtmlFeedCandidates(initialRes, finalHost, sharedOptions);
  return { feedUrl: discoveredUrl, discovered: true, siteHost: finalHost };
}

function buildPreviewWarnings(
  entries: Array<{ url: string }>,
  siteHost: string,
  resolvedFeedUrl: string
): string[] {
  const warnings: string[] = [];
  if (entries.length === 0) {
    warnings.push("Feed hợp lệ nhưng hiện chưa có bài viết nào.");
    return warnings;
  }

  const feedHost = normalizeHost(resolvedFeedUrl);
  const allowed = getAllowedDomains([siteHost, feedHost]);
  const sample = entries.slice(0, 10);
  const blockedDomains = new Set<string>();
  let blockedCount = 0;

  for (const entry of sample) {
    try {
      const host = normalizeHost(entry.url);
      if (!isDomainAllowed(host, allowed)) {
        blockedCount++;
        blockedDomains.add(host);
      }
    } catch {
      continue;
    }
  }

  if (blockedCount > 0) {
    const examples = Array.from(blockedDomains).slice(0, 3).join(", ");
    warnings.push(
      `Phát hiện ${blockedCount}/${sample.length} link trỏ ra domain ngoài whitelist (${examples}). Nếu đây là nguồn tổng hợp (aggregator), hãy điền Domain bài viết hoặc thêm vào NEWS_ALLOWED_DOMAINS để không bị bỏ qua khi quét.`
    );
  }
  return warnings;
}

function buildPreviewDto(
  feedUrl: string,
  body: string,
  siteHost: string,
  candidates?: NewsSourcePreviewCandidateDto[],
  fallbackTitle?: string
): NewsSourcePreviewDto {
  const parsed = parseFeedDocument(body, feedUrl);
  return {
    resolvedFeedUrl: feedUrl,
    siteHost,
    feedTitle: parsed.title ?? fallbackTitle,
    format: parsed.format,
    candidates: candidates ?? [{ url: feedUrl, title: parsed.title, format: parsed.format }],
    itemCount: parsed.entries.length,
    sampleItems: parsed.entries.slice(0, 5),
    warnings: buildPreviewWarnings(parsed.entries, siteHost, feedUrl),
  };
}

function validatePreviewInputUrl(rawUrl: string): URL {
  const normalizedInput = rawUrl.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedInput);
  } catch {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không hợp lệ.");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Feed URL phải dùng http hoặc https.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không được chứa thông tin đăng nhập.");
  }
  return parsedUrl;
}

async function previewPlatformFeeds(
  normalizedInput: string,
  inputHost: string,
  sharedOptions: ProbeSharedOptions
): Promise<NewsSourcePreviewDto | null> {
  const platformCandidates = resolvePlatformFeedCandidates(normalizedInput);
  if (platformCandidates.length === 0) return null;

  const verifiedPlatform: Array<{
    candidate: NewsSourcePreviewCandidateDto;
    body: string;
    finalUrl: string;
  }> = [];
  for (const candidate of platformCandidates.slice(0, 3)) {
    const probed = await probeFeedCandidate(candidate.url, sharedOptions);
    if (!probed) continue;
    if ("ssrfError" in probed) throw probed.ssrfError;
    verifiedPlatform.push({
      candidate: { url: probed.feedUrl, title: candidate.title, format: candidate.format },
      body: probed.body,
      finalUrl: probed.feedUrl,
    });
  }
  if (verifiedPlatform.length === 0) return null;

  const primary = verifiedPlatform[0];
  return buildPreviewDto(
    primary.finalUrl,
    primary.body,
    inputHost,
    verifiedPlatform.map((item) => item.candidate),
    primary.candidate.title
  );
}

async function previewHtmlAlternatesAndCommon(
  xml: string,
  finalUrl: string,
  finalHost: string,
  sharedOptions: ProbeSharedOptions,
  suggestionOptions: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch }
): Promise<NewsSourcePreviewDto> {
  const htmlCandidates = extractAlternateFeedCandidatesFromHtml(xml, finalUrl).slice(
    0,
    MAX_ALTERNATE_CANDIDATES
  );
  if (finalHost === "youtube.com" || finalHost === "m.youtube.com") {
    const ytFeed = extractYouTubeChannelFeedFromHtml(xml);
    if (ytFeed && !htmlCandidates.some((c) => c.url === ytFeed)) {
      htmlCandidates.unshift({ url: ytFeed, title: "YouTube Channel Feed", format: "atom" });
    }
  }

  let explicitSsrfError: UrlGuardError | null = null;
  const verifiedAlternates: Array<{ candidate: NewsSourcePreviewCandidateDto; body: string; finalUrl: string }> = [];

  for (const candidate of htmlCandidates) {
    const probed = await probeFeedCandidate(candidate.url, sharedOptions);
    if (!probed) continue;
    if ("ssrfError" in probed) {
      explicitSsrfError ??= probed.ssrfError;
      continue;
    }
    const doc = parseFeedDocument(probed.body, probed.feedUrl);
    verifiedAlternates.push({
      candidate: { url: probed.feedUrl, title: candidate.title ?? doc.title, format: doc.format },
      body: probed.body,
      finalUrl: probed.feedUrl,
    });
  }

  if (verifiedAlternates.length > 0) {
    const primary = verifiedAlternates[0];
    return buildPreviewDto(
      primary.finalUrl,
      primary.body,
      finalHost,
      verifiedAlternates.map((item) => item.candidate),
      primary.candidate.title
    );
  }

  const alternateSet = new Set(htmlCandidates.map((c) => c.url));
  const commonCandidates = buildCommonFeedCandidates(finalUrl).filter((url) => !alternateSet.has(url));
  const commonMatch = await probeCommonCandidatesBatch(commonCandidates, sharedOptions);
  if (commonMatch) return buildPreviewDto(commonMatch.feedUrl, commonMatch.body, finalHost);

  if (explicitSsrfError) throw explicitSsrfError;
  const suggestions = await suggestFeedsFromHtml(xml, finalUrl, suggestionOptions);
  if (suggestions.length > 0) {
    throw new FeedDiscoveryError(
      `Trang này không có RSS/Atom/JSON feed, nhưng tìm thấy ${suggestions.length} feed liên quan. Chọn một feed bên dưới để kiểm tra.`,
      "FEED_NOT_FOUND",
      400,
      suggestions
    );
  }
  throw new FeedDiscoveryError();
}

export async function previewFeedSource(
  rawUrl: string,
  options: {
    lookupFn?: HostLookupFn;
    fetchFn?: typeof fetch;
    deadlineMs?: number;
  } = {}
): Promise<NewsSourcePreviewDto> {
  const normalizedInput = rawUrl.trim();
  const parsedUrl = validatePreviewInputUrl(normalizedInput);
  await assertPublicHostname(parsedUrl.hostname, options.lookupFn);

  const sharedOptions: ProbeSharedOptions = {
    lookupFn: options.lookupFn,
    fetchFn: options.fetchFn,
    signal: AbortSignal.timeout(options.deadlineMs ?? DEFAULT_DISCOVERY_DEADLINE_MS),
  };
  const inputHost = normalizeHost(normalizedInput);

  const platformPreview = await previewPlatformFeeds(normalizedInput, inputHost, sharedOptions);
  if (platformPreview) return platformPreview;

  let initialRes;
  try {
    initialRes = await fetchFeedWithCacheSafely(normalizedInput, { ...sharedOptions, timeoutMs: 8_000 });
  } catch (error) {
    if (error instanceof UrlGuardError) throw error;
    const classified = classifyFeedError(error);
    throw new FeedDiscoveryError(classified.message, classified.code, classified.status);
  }

  if (initialRes.kind !== "ok") {
    throw new FeedDiscoveryError("Nguồn không trả nội dung feed.", "EMPTY_FEED", 400);
  }

  const finalHost = normalizeHost(initialRes.finalUrl);
  if (isFeedDocument(initialRes.xml, initialRes.finalUrl, initialRes.contentType)) {
    return buildPreviewDto(initialRes.finalUrl, initialRes.xml, finalHost);
  }
  if (!isHtmlDocument(initialRes.xml, initialRes.contentType)) {
    throw new FeedDiscoveryError(
      "[MALFORMED_XML] URL này không phải RSS, Atom hay JSON Feed hợp lệ.",
      "MALFORMED_XML",
      400
    );
  }

  return previewHtmlAlternatesAndCommon(initialRes.xml, initialRes.finalUrl, finalHost, sharedOptions, {
    lookupFn: options.lookupFn,
    fetchFn: options.fetchFn,
  });
}
