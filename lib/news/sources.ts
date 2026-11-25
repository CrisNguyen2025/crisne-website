import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveFeedUrl } from "./feed-discovery";
import {
  type CreateNewsSourceRequest,
  type NewsSourceDto,
  type UpdateNewsSourceRequest,
  NEWS_SOURCE_DEFAULT_FETCH_HOUR,
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

const WITH_ITEM_COUNT = { _count: { select: { items: true } } } as const;

export async function listNewsSources(): Promise<NewsSourceDto[]> {
  const rows = await prisma.newsSource.findMany({
    orderBy: { createdAt: "asc" },
    include: WITH_ITEM_COUNT,
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

function resolveCreatedSourceDomain(
  feedUrl: string,
  explicitDomain: string | undefined,
  resolved: { discovered: boolean; siteHost?: string }
): string {
  if (explicitDomain?.trim()) return extractSourceDomain(feedUrl, explicitDomain);
  if (resolved.discovered && resolved.siteHost) return resolved.siteHost;
  return extractSourceDomain(feedUrl);
}

export async function createNewsSource(
  input: CreateNewsSourceRequest,
  options: { lookupFn?: HostLookupFn; fetchFn?: typeof fetch } = {}
): Promise<NewsSourceDto> {
  const { feedUrl: rawFeedUrl, hostname } = parseAndValidateFeedUrl(input.feedUrl);
  await assertPublicHostname(hostname, options.lookupFn);

  const resolved = await resolveFeedUrl(rawFeedUrl, options);
  const feedUrl = resolved.feedUrl;
  const domain = resolveCreatedSourceDomain(feedUrl, input.domain, resolved);
  await assertPublicHostname(domain, options.lookupFn);

  try {
    const created = await prisma.newsSource.create({
      data: {
        name: input.name.trim(),
        feedUrl,
        domain,
        enabled: input.enabled ?? true,
        ...(input.fetchIntervalDays !== undefined
          ? { fetchIntervalDays: input.fetchIntervalDays }
          : {}),
        // Set explicitly: databases migrated earlier still carry the old column default (11)
        fetchHour: input.fetchHour ?? NEWS_SOURCE_DEFAULT_FETCH_HOUR,
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

function buildSourceUpdateData(
  input: UpdateNewsSourceRequest,
  nextFeedUrl: string,
  feedUrlChanged: boolean,
  nextDomain: string
): Prisma.NewsSourceUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.feedUrl !== undefined ? { feedUrl: nextFeedUrl } : {}),
    ...(feedUrlChanged ? { etag: null, lastModified: null, lastError: null } : {}),
    ...(input.domain !== undefined || input.feedUrl !== undefined ? { domain: nextDomain } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.fetchIntervalDays !== undefined ? { fetchIntervalDays: input.fetchIntervalDays } : {}),
    ...(input.fetchHour !== undefined ? { fetchHour: input.fetchHour } : {}),
  };
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
  if (input.domain !== undefined || input.feedUrl) {
    nextDomain = resolveCreatedSourceDomain(nextFeedUrl, input.domain, {
      discovered: feedDiscovered,
      siteHost: resolvedSiteHost,
    });
    await assertPublicHostname(nextDomain, options.lookupFn);
  }

  const feedUrlChanged = input.feedUrl !== undefined && nextFeedUrl !== existing.feedUrl;
  const data = buildSourceUpdateData(input, nextFeedUrl, feedUrlChanged, nextDomain);

  try {
    const updated = await prisma.newsSource.update({
      where: { id },
      data,
      include: WITH_ITEM_COUNT,
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
