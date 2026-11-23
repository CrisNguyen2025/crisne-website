import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveFeedUrl } from "./feed-discovery";
import {
  type CreateNewsSourceRequest,
  type NewsSourceDto,
  type UpdateNewsSourceRequest,
  normalizeTagList,
  serializeNewsSource,
} from "./schemas";
import { type HostLookupFn, UrlGuardError, assertPublicHostname } from "./url-guard";

export class NewsSourceConflictError extends Error {
  readonly status = 409;

  constructor(message = "Feed URL này đã tồn tại trong danh sách nguồn.") {
    super(message);
    this.name = "NewsSourceConflictError";
  }
}

function cleanDomainInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname.replace(/^www\./, "").replace(/\.$/, "");
    } catch {
      return "";
    }
  }
  return trimmed.split("/")[0].replace(/^www\./, "").replace(/\.$/, "");
}

export function extractSourceDomain(feedUrl: string, overrideDomain?: string): string {
  if (overrideDomain && overrideDomain.trim()) {
    const cleanedOverride = cleanDomainInput(overrideDomain);
    if (!cleanedOverride || !cleanedOverride.includes(".")) {
      throw new UrlGuardError("INVALID_URL", 400, "Domain nguồn không hợp lệ.");
    }
    return cleanedOverride;
  }

  let parsed: URL;
  try {
    parsed = new URL(feedUrl.trim());
  } catch {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không hợp lệ.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Feed URL phải dùng http hoặc https.");
  }

  return parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export async function listNewsSources(): Promise<NewsSourceDto[]> {
  const rows = await prisma.newsSource.findMany({
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeNewsSource);
}

function parseAndValidateFeedUrl(rawFeedUrl: string): { feedUrl: string; hostname: string } {
  const feedUrl = rawFeedUrl.trim();
  let parsedFeed: URL;
  try {
    parsedFeed = new URL(feedUrl);
  } catch {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không hợp lệ.");
  }
  if (parsedFeed.protocol !== "http:" && parsedFeed.protocol !== "https:") {
    throw new UrlGuardError("UNSUPPORTED_PROTOCOL", 400, "Feed URL phải dùng http hoặc https.");
  }
  if (parsedFeed.username || parsedFeed.password) {
    throw new UrlGuardError("INVALID_URL", 400, "Feed URL không được chứa thông tin đăng nhập.");
  }
  return { feedUrl, hostname: parsedFeed.hostname };
}

export async function createNewsSource(
  input: CreateNewsSourceRequest,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch } = {}
): Promise<NewsSourceDto> {
  const { feedUrl: rawFeedUrl, hostname } = parseAndValidateFeedUrl(input.feedUrl);
  await assertPublicHostname(hostname, options.lookupFn);

  const resolved = await resolveFeedUrl(rawFeedUrl, options);
  const feedUrl = resolved.feedUrl;
  const domain = input.domain?.trim()
    ? extractSourceDomain(feedUrl, input.domain)
    : resolved.discovered
      ? resolved.siteHost
      : extractSourceDomain(feedUrl);
  await assertPublicHostname(domain, options.lookupFn);

  const defaultTags = normalizeTagList(input.defaultTags ?? [], 5);

  try {
    const created = await prisma.newsSource.create({
      data: {
        name: input.name.trim(),
        feedUrl,
        domain,
        enabled: input.enabled ?? true,
        defaultTags: JSON.stringify(defaultTags),
      },
    });
    return serializeNewsSource(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new NewsSourceConflictError();
    }
    throw error;
  }
}

export async function updateNewsSource(
  id: string,
  input: UpdateNewsSourceRequest,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch } = {}
): Promise<NewsSourceDto | null> {
  const existing = await prisma.newsSource.findUnique({ where: { id } });
  if (!existing) return null;

  let nextFeedUrl = existing.feedUrl;
  let feedDiscovered = false;
  let resolvedSiteHost: string | undefined;
  if (input.feedUrl) {
    const validatedFeed = parseAndValidateFeedUrl(input.feedUrl);
    await assertPublicHostname(validatedFeed.hostname, options.lookupFn);
    const resolved = await resolveFeedUrl(validatedFeed.feedUrl, options);
    nextFeedUrl = resolved.feedUrl;
    feedDiscovered = resolved.discovered;
    resolvedSiteHost = resolved.siteHost;
  }

  let nextDomain = existing.domain;
  if (input.domain !== undefined) {
    nextDomain = extractSourceDomain(nextFeedUrl, input.domain);
    await assertPublicHostname(nextDomain, options.lookupFn);
  } else if (input.feedUrl) {
    nextDomain =
      feedDiscovered && resolvedSiteHost
        ? resolvedSiteHost
        : extractSourceDomain(nextFeedUrl);
    await assertPublicHostname(nextDomain, options.lookupFn);
  }

  const feedUrlChanged = input.feedUrl !== undefined && nextFeedUrl !== existing.feedUrl;
  const data: Prisma.NewsSourceUpdateInput = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.feedUrl !== undefined ? { feedUrl: nextFeedUrl } : {}),
    ...(feedUrlChanged ? { etag: null, lastModified: null, lastError: null } : {}),
    ...(input.domain !== undefined || input.feedUrl !== undefined ? { domain: nextDomain } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.defaultTags !== undefined
      ? { defaultTags: JSON.stringify(normalizeTagList(input.defaultTags, 5)) }
      : {}),
  };

  try {
    const updated = await prisma.newsSource.update({
      where: { id },
      data,
    });
    return serializeNewsSource(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new NewsSourceConflictError();
    }
    throw error;
  }
}

export async function deleteNewsSource(id: string): Promise<boolean> {
  const existing = await prisma.newsSource.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.newsSource.delete({ where: { id } });
  return true;
}
