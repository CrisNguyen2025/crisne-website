import dns from "node:dns";
import { isIP } from "node:net";
import type { NewsPlatform } from "./schemas";

export type UrlGuardErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "DOMAIN_NOT_ALLOWED"
  | "SSRF_BLOCKED"
  | "TOO_MANY_REDIRECTS";

export class UrlGuardError extends Error {
  readonly code: UrlGuardErrorCode;
  readonly status: 400 | 403;

  constructor(code: UrlGuardErrorCode, status: 400 | 403, message: string) {
    super(message);
    this.name = "UrlGuardError";
    this.code = code;
    this.status = status;
  }
}

export const DEFAULT_ALLOWED_DOMAINS: readonly string[] = [
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "m.tiktok.com",
  "github.com",
  "arxiv.org",
  "dev.to",
  "substack.com",
  "medium.com",
  "vercel.com",
  "nextjs.org",
  "react.dev",
  "openai.com",
  "anthropic.com",
  "blog.google",
  "huggingface.co",
  "news.ycombinator.com",
  "x.com",
  "twitter.com",
  "web.dev",
  "developer.mozilla.org",
  "simonwillison.net",
];

export const SHORT_LINK_DOMAINS: readonly string[] = [
  "youtu.be",
  "vt.tiktok.com",
  "vm.tiktok.com",
  "t.co",
  "bit.ly",
];

const TRACKING_QUERY_PARAMS = new Set([
  "si",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "feature",
  "pp",
  "is_from_webapp",
  "sender_device",
  "sender_web_id",
  "_r",
  "_t",
  "checksum",
  "sec_uid",
  "share_app_id",
  "share_item_id",
  "share_link_id",
  "u_code",
  "timestamp",
  "social_sharing",
  "tt_from",
]);

const MAX_REDIRECT_HOPS = 5;
const REDIRECT_TIMEOUT_MS = 5_000;
const MAX_URL_LENGTH = 2048;

export interface LookupAddress {
  address: string;
  family: number;
}

export type HostLookupFn = (hostname: string) => Promise<LookupAddress[]>;

export interface ResolveUrlOptions {
  extraAllowedDomains?: string[];
  resolveRedirects?: boolean;
  lookupFn?: HostLookupFn;
  fetchFn?: typeof fetch;
}

export interface ValidatedUrlResult {
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  platform: NewsPlatform;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^www\./, "").replace(/\.$/, "");
}

export function getAllowedDomains(extraDomains: string[] = []): string[] {
  const envDomains = (process.env.NEWS_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => normalizeHost(d))
    .filter(Boolean);

  const merged = new Set<string>();
  for (const domain of [...DEFAULT_ALLOWED_DOMAINS, ...envDomains, ...extraDomains]) {
    const clean = normalizeHost(domain);
    if (clean) merged.add(clean);
  }
  return Array.from(merged);
}

export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  const cleanHost = normalizeHost(hostname);
  if (!cleanHost) return false;
  return allowedDomains.some((allowed) => {
    const cleanAllowed = normalizeHost(allowed);
    return cleanHost === cleanAllowed || cleanHost.endsWith(`.${cleanAllowed}`);
  });
}

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

export function assertNoUrlCredentials(
  parsed: URL,
  message = "URL không được chứa thông tin đăng nhập."
): void {
  if (parsed.username || parsed.password) {
    throw new UrlGuardError("INVALID_URL", 400, message);
  }
}

function isPrivateIpv4(ip: string): boolean {
  const num = parseIpv4ToInt(ip);
  if (num === null) return true;
  const first = (num >>> 24) & 0xff;
  const second = (num >>> 16) & 0xff;
  const third = (num >>> 8) & 0xff;

  if (first === 0) return true; // 0.0.0.0/8
  if (first === 10) return true; // 10.0.0.0/8
  if (first === 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 CGNAT
  if (first === 127) return true; // 127.0.0.0/8 loopback
  if (first === 169 && second === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (first === 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
  if (first === 192 && second === 0 && third === 0) return true; // 192.0.0.0/24
  if (first === 192 && second === 0 && third === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (first === 192 && second === 88 && third === 99) return true; // 192.88.99.0/24 6to4 relay
  if (first === 192 && second === 168) return true; // 192.168.0.0/16
  if (first === 198 && (second === 18 || second === 19)) return true; // 198.18.0.0/15 benchmark
  if (first === 198 && second === 51 && third === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (first === 203 && second === 0 && third === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (first >= 224) return true; // multicast & reserved (224.0.0.0/4, 240.0.0.0/4)
  return false;
}

function expandIpv6Words(ip: string): number[] | null {
  const withoutZone = ip.split("%")[0];
  const halves = withoutZone.split("::");
  if (halves.length > 2) return null;

  const parsePart = (part: string): number[] | null => {
    if (!part) return [];
    const tokens = part.split(":");
    const words: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.includes(".")) {
        if (i !== tokens.length - 1) return null;
        const ipv4Int = parseIpv4ToInt(token);
        if (ipv4Int === null) return null;
        words.push((ipv4Int >>> 16) & 0xffff, ipv4Int & 0xffff);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(token)) return null;
        words.push(parseInt(token, 16));
      }
    }
    return words;
  };

  if (halves.length === 1) {
    const words = parsePart(halves[0]);
    return words && words.length === 8 ? words : null;
  }

  const left = parsePart(halves[0]);
  const right = parsePart(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}

function isPrivateIpv6(ip: string): boolean {
  const words = expandIpv6Words(ip);
  if (!words) return true;

  if (words.slice(0, 6).every((w) => w === 0)) return true;

  // IPv4-mapped IPv6 (::ffff:0:0/96)
  const isIpv4Mapped = words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff;
  if (isIpv4Mapped) {
    const hi = words[6];
    const lo = words[7];
    const mappedIpv4 = `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(mappedIpv4);
  }

  // NAT64 (64:ff9b::/96 and 64:ff9b:1::/48)
  if (words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((w) => w === 0)) {
    const hi = words[6];
    const lo = words[7];
    const mappedIpv4 = `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(mappedIpv4);
  }
  if (words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 0x0001) return true;

  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;
  if (words[0] === 0x2001 && words[1] === 0x0000) return true;
  if (words[0] === 0x2001 && words[1] === 0x0002 && words[2] === 0) return true;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
  if (words[0] === 0x2002) return true;

  if ((words[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique Local
  if ((words[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-local
  if ((words[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 Site-local
  if ((words[0] & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
  return false;
}

export function isPrivateIp(rawIp: string): boolean {
  const clean = rawIp.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(clean);
  if (version === 4) return isPrivateIpv4(clean);
  if (version === 6) return isPrivateIpv6(clean);
  return true;
}

async function defaultLookupFn(hostname: string): Promise<LookupAddress[]> {
  return dns.promises.lookup(hostname, { all: true });
}

export async function assertPublicHostname(
  hostname: string,
  lookupFn: HostLookupFn = defaultLookupFn
): Promise<void> {
  const clean = normalizeHost(hostname);
  if (
    !clean ||
    clean === "localhost" ||
    clean === "localhost.localdomain" ||
    clean === "ip6-localhost" ||
    clean.endsWith(".localhost") ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal")
  ) {
    throw new UrlGuardError("SSRF_BLOCKED", 403, `Hostname bị chặn vì lý do bảo mật: ${hostname}`);
  }

  if (isIP(clean) !== 0) {
    if (isPrivateIp(clean)) {
      throw new UrlGuardError("SSRF_BLOCKED", 403, `Địa chỉ IP nội bộ không được phép: ${clean}`);
    }
    return;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookupFn(clean);
  } catch {
    throw new UrlGuardError("SSRF_BLOCKED", 403, `Không thể phân giải DNS cho tên miền: ${clean}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new UrlGuardError("SSRF_BLOCKED", 403, `Không tìm thấy bản ghi DNS công khai cho: ${clean}`);
  }

  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new UrlGuardError("SSRF_BLOCKED", 403, `Tên miền trỏ về IP nội bộ không được phép: ${clean}`);
    }
  }
}

function detectPlatform(domain: string): NewsPlatform {
  if (domain === "youtube.com" || domain.endsWith(".youtube.com") || domain === "youtu.be") {
    return "youtube";
  }
  if (domain === "tiktok.com" || domain.endsWith(".tiktok.com")) {
    return "tiktok";
  }
  return "article";
}

function extractYoutubeVideoId(url: URL, domain: string): string | null {
  if (domain === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id || null;
  }
  if (domain === "youtube.com" || domain.endsWith(".youtube.com")) {
    const v = url.searchParams.get("v");
    if (v) return v;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && (segments[0] === "shorts" || segments[0] === "live" || segments[0] === "embed")) {
      return segments[1];
    }
  }
  return null;
}

export function normalizeCanonicalUrl(rawUrl: string): {
  canonicalUrl: string;
  domain: string;
  platform: NewsPlatform;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new UrlGuardError("INVALID_URL", 400, "URL không hợp lệ.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Chỉ hỗ trợ URL http hoặc https.");
  }
  assertNoUrlCredentials(parsed);

  const rawDomain = normalizeHost(parsed.hostname);
  const domain = rawDomain.startsWith("m.") ? rawDomain.slice(2) : rawDomain;
  const platform = detectPlatform(domain);

  if (platform === "youtube") {
    const videoId = extractYoutubeVideoId(parsed, rawDomain);
    if (videoId) {
      return {
        canonicalUrl: `https://youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        domain: "youtube.com",
        platform: "youtube",
      };
    }
  }

  // arXiv PDF links fail HTML extraction; normalize to the abstract page so both dedupe together
  if (domain === "arxiv.org") {
    const pdfMatch = parsed.pathname.match(/^\/pdf\/(.+?)(?:\.pdf)?$/i);
    if (pdfMatch?.[1]) {
      return {
        canonicalUrl: `https://arxiv.org/abs/${pdfMatch[1]}`,
        domain: "arxiv.org",
        platform: "article",
      };
    }
  }

  const cleanUrl = new URL(parsed.toString());
  cleanUrl.protocol = "https:";
  cleanUrl.hostname = domain;
  cleanUrl.username = "";
  cleanUrl.password = "";
  cleanUrl.hash = "";

  for (const key of Array.from(cleanUrl.searchParams.keys())) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(lower)) {
      cleanUrl.searchParams.delete(key);
    }
  }
  cleanUrl.searchParams.sort();

  if (cleanUrl.pathname.length > 1 && cleanUrl.pathname.endsWith("/")) {
    cleanUrl.pathname = cleanUrl.pathname.replace(/\/+$/, "");
  }

  return {
    canonicalUrl: cleanUrl.toString(),
    domain,
    platform,
  };
}

function isShortLinkHostname(hostname: string): boolean {
  const clean = normalizeHost(hostname);
  return SHORT_LINK_DOMAINS.some((d) => clean === d || clean.endsWith(`.${d}`));
}

async function followRedirectsSafely(
  initialUrl: URL,
  allowedDomains: string[],
  lookupFn: HostLookupFn,
  fetchFn: typeof fetch
): Promise<URL> {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let response: Response;
    try {
      response = await fetchFn(current.toString(), {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      });

      const shouldRetryWithGet =
        response.status === 405 ||
        response.status === 501 ||
        (response.status === 403 && isShortLinkHostname(current.hostname));
      if (shouldRetryWithGet) {
        await response.body?.cancel();
        response = await fetchFn(current.toString(), {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          redirect: "manual",
          signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
        });
      }
      await response.body?.cancel();
    } catch {
      // Transient fetch failure on an already-validated whitelisted host falls back to current URL
      return current;
    }

    if (response.status < 300 || response.status >= 400) {
      return current;
    }

    const location = response.headers.get("location");
    if (!location) {
      return current;
    }

    if (hop === MAX_REDIRECT_HOPS) {
      throw new UrlGuardError("TOO_MANY_REDIRECTS", 400, "Link rút gọn chuyển hướng quá nhiều lần.");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, current);
    } catch {
      throw new UrlGuardError("INVALID_URL", 400, "Redirect trả về URL đích không hợp lệ.");
    }

    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Redirect tới protocol không được hỗ trợ.");
    }
    assertNoUrlCredentials(nextUrl, "Redirect trả về URL chứa thông tin đăng nhập không hợp lệ.");

    await assertPublicHostname(nextUrl.hostname, lookupFn);
    // Chained short links (t.co → bit.ly → …) are allowed as hops; the final target is checked by the caller
    if (!isShortLinkHostname(nextUrl.hostname) && !isDomainAllowed(nextUrl.hostname, allowedDomains)) {
      throw new UrlGuardError(
        "DOMAIN_NOT_ALLOWED",
        403,
        `Domain đích "${nextUrl.hostname}" không nằm trong whitelist.`
      );
    }
    current = nextUrl;
  }

  return current;
}

export async function resolveAndValidateUrl(
  rawUrl: string,
  options: ResolveUrlOptions = {}
): Promise<ValidatedUrlResult> {
  const sourceUrl = rawUrl.trim();
  if (sourceUrl.length > MAX_URL_LENGTH) {
    throw new UrlGuardError("INVALID_URL", 400, "URL vượt quá độ dài tối đa 2048 ký tự.");
  }
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new UrlGuardError("INVALID_URL", 400, "URL không hợp lệ.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Chỉ hỗ trợ URL http hoặc https.");
  }
  assertNoUrlCredentials(parsed);

  const allowedDomains = getAllowedDomains(options.extraAllowedDomains);
  const lookupFn = options.lookupFn ?? defaultLookupFn;
  const fetchFn = options.fetchFn ?? fetch;

  const isShortLink = isShortLinkHostname(parsed.hostname);
  // Short-link hosts (t.co, bit.ly) are only a hop: the whitelist applies to where they lead,
  // checked below. If resolving fails, the final URL is still the short link and gets rejected.
  if (!isShortLink && !isDomainAllowed(parsed.hostname, allowedDomains)) {
    throw new UrlGuardError(
      "DOMAIN_NOT_ALLOWED",
      403,
      `Domain "${parsed.hostname}" chưa nằm trong whitelist.`
    );
  }

  await assertPublicHostname(parsed.hostname, lookupFn);

  const shouldResolve = options.resolveRedirects ?? isShortLink;
  const finalUrl = shouldResolve
    ? await followRedirectsSafely(parsed, allowedDomains, lookupFn, fetchFn)
    : parsed;

  if (!isDomainAllowed(finalUrl.hostname, allowedDomains)) {
    throw new UrlGuardError(
      "DOMAIN_NOT_ALLOWED",
      403,
      `Domain đích "${finalUrl.hostname}" không nằm trong whitelist.`
    );
  }
  await assertPublicHostname(finalUrl.hostname, lookupFn);

  const normalized = normalizeCanonicalUrl(finalUrl.toString());
  return {
    sourceUrl,
    canonicalUrl: normalized.canonicalUrl,
    domain: normalized.domain,
    platform: normalized.platform,
  };
}
