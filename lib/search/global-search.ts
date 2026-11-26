import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NEWS_PATH } from "@/lib/news/paths";
import { parseJsonStringArray } from "@/lib/news/schemas";
import { lessonChunks } from "@/lib/roadmap/content-utils";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import { DEFAULT_LESSON_STATUS, isLessonStatus, type LessonStatus } from "@/lib/roadmap/status";
import { extractHighlightedSnippet, scoreTextMatch, type SearchSnippet } from "./text-match";

export const SEARCH_SCOPES = ["all", "lessons", "news"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const GlobalSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  scope: z.enum(SEARCH_SCOPES).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

export interface SearchTopicHit {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  lessonCount: number;
  href: string;
  snippet: SearchSnippet | null;
}

export interface SearchLessonHit {
  id: string;
  slug: string;
  title: string;
  topicSlug: string;
  topicTitle: string;
  section: string | null;
  status: LessonStatus;
  href: string;
  matchedHeading: string | null;
  snippet: SearchSnippet | null;
}

export interface SearchNewsHit {
  id: string;
  title: string;
  domain: string;
  platform: string;
  isSaved: boolean;
  tags: string[];
  href: string;
  snippet: SearchSnippet | null;
}

export interface GlobalSearchResponseDto {
  query: string;
  scope: SearchScope;
  isZeroQuery: boolean;
  topics: SearchTopicHit[];
  lessons: SearchLessonHit[];
  news: SearchNewsHit[];
}

const MAX_TOPIC_LIMIT = 5;
const MAX_NEWS_SCAN = 500;
const SNIPPET_MAX_CHARS = 115;

const STATUS_PRIORITY: Record<LessonStatus, number> = {
  learning: 2,
  target: 1,
  known: 0,
};

function newsItemHref(id: string): string {
  return `${NEWS_PATH}?view=all&item=${encodeURIComponent(id)}`;
}

function normalizeStatus(raw: string): LessonStatus {
  return isLessonStatus(raw) ? raw : DEFAULT_LESSON_STATUS;
}

function snippetFromText(text: string | null | undefined, maxChars = SNIPPET_MAX_CHARS): SearchSnippet | null {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return {
    text: clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1).trimEnd()}…`,
    highlightStart: 0,
    highlightEnd: 0,
  };
}

export async function getZeroQuerySuggestions(
  scope: SearchScope,
  limit: number
): Promise<GlobalSearchResponseDto> {
  const includeRoadmaps = scope === "all" || scope === "lessons";
  const includeNews = scope === "all" || scope === "news";

  const [roadmaps, lessons, news] = await Promise.all([
    scope === "all"
      ? prisma.roadmap.findMany({
          orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
          take: MAX_TOPIC_LIMIT,
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            _count: { select: { items: true } },
          },
        })
      : Promise.resolve([]),
    includeRoadmaps
      ? prisma.roadmapItem.findMany({
          orderBy: [{ updatedAt: "desc" }],
          take: Math.max(limit * 4, 24),
          select: {
            id: true,
            slug: true,
            section: true,
            title: true,
            description: true,
            status: true,
            updatedAt: true,
            roadmap: { select: { slug: true, title: true } },
          },
        })
      : Promise.resolve([]),
    includeNews
      ? prisma.newsItem.findMany({
          where: { reviewStatus: { not: "dismissed" } },
          orderBy: [{ isSaved: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: Math.min(limit, 5),
          select: {
            id: true,
            title: true,
            domain: true,
            platform: true,
            isSaved: true,
            tags: true,
            tldr: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const sortedLessons = [...lessons]
    .sort((a, b) => {
      const pDiff = STATUS_PRIORITY[normalizeStatus(b.status)] - STATUS_PRIORITY[normalizeStatus(a.status)];
      if (pDiff !== 0) return pDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, limit);

  return {
    query: "",
    scope,
    isZeroQuery: true,
    topics: roadmaps.map((topic) => ({
      id: topic.id,
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      lessonCount: topic._count.items,
      href: topicPath(topic.slug),
      snippet: snippetFromText(topic.description),
    })),
    lessons: sortedLessons.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      topicSlug: item.roadmap.slug,
      topicTitle: item.roadmap.title,
      section: item.section,
      status: normalizeStatus(item.status),
      href: lessonPath(item.roadmap.slug, item.slug),
      matchedHeading: null,
      snippet: snippetFromText(item.description),
    })),
    news: news.map((item) => ({
      id: item.id,
      title: item.title,
      domain: item.domain,
      platform: item.platform,
      isSaved: item.isSaved,
      tags: parseJsonStringArray(item.tags),
      href: newsItemHref(item.id),
      snippet: snippetFromText(item.tldr),
    })),
  };
}

export async function searchGlobalWorkspace(params: {
  q?: string;
  scope?: SearchScope;
  limit?: number;
}): Promise<GlobalSearchResponseDto> {
  const query = (params.q ?? "").trim().slice(0, 120);
  const scope: SearchScope = params.scope ?? "all";
  const limit = Math.min(Math.max(1, params.limit ?? 8), 20);

  if (!query) {
    return getZeroQuerySuggestions(scope, limit);
  }

  const includeRoadmaps = scope === "all" || scope === "lessons";
  const includeNews = scope === "all" || scope === "news";

  const [roadmaps, lessons, newsItems] = await Promise.all([
    scope === "all"
      ? prisma.roadmap.findMany({
          orderBy: [{ order: "asc" }],
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            updatedAt: true,
            _count: { select: { items: true } },
          },
        })
      : Promise.resolve([]),
    includeRoadmaps
      ? prisma.roadmapItem.findMany({
          select: {
            id: true,
            slug: true,
            section: true,
            title: true,
            description: true,
            content: true,
            status: true,
            updatedAt: true,
            roadmap: { select: { slug: true, title: true } },
          },
        })
      : Promise.resolve([]),
    includeNews
      ? prisma.newsItem.findMany({
          where: { reviewStatus: { not: "dismissed" } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_NEWS_SCAN,
          select: {
            id: true,
            title: true,
            tldr: true,
            tags: true,
            domain: true,
            personalNote: true,
            platform: true,
            isSaved: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const rankedTopics = roadmaps
    .map((topic) => {
      const score =
        scoreTextMatch(topic.title, query) * 4 +
        scoreTextMatch(topic.description, query) * 1.5 +
        scoreTextMatch(topic.slug, query);
      if (score <= 0) return null;
      const snippet = extractHighlightedSnippet(topic.description ?? "", query, SNIPPET_MAX_CHARS);
      return {
        score,
        updatedAt: topic.updatedAt.getTime(),
        hit: {
          id: topic.id,
          slug: topic.slug,
          title: topic.title,
          description: topic.description,
          lessonCount: topic._count.items,
          href: topicPath(topic.slug),
          snippet: snippet ?? snippetFromText(topic.description),
        } satisfies SearchTopicHit,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, Math.min(limit, MAX_TOPIC_LIMIT))
    .map((entry) => entry.hit);

  const rankedLessons = lessons
    .map((item) => {
      const titleScore = scoreTextMatch(item.title, query) * 4;
      const sectionScore = scoreTextMatch(item.section, query) * 2.5;
      const descScore = scoreTextMatch(item.description, query) * 1.5;

      let bestChunkScore = 0;
      let bestAnchor: string | null = null;
      let bestHeading: string | null = null;
      let bestChunkSnippet: SearchSnippet | null = null;

      if (item.content) {
        const chunks = lessonChunks(item.content);
        for (const chunk of chunks) {
          const headingScore = scoreTextMatch(chunk.heading, query) * 1.5;
          const bodyScore = scoreTextMatch(chunk.text, query);
          const chunkScore = Math.max(headingScore, bodyScore);
          if (chunkScore > bestChunkScore) {
            bestChunkScore = chunkScore;
            bestAnchor = chunk.anchor;
            bestHeading = chunk.heading;
            bestChunkSnippet = extractHighlightedSnippet(chunk.text, query, SNIPPET_MAX_CHARS);
          }
        }
      }

      const rawScore = titleScore + sectionScore + descScore + bestChunkScore;
      if (rawScore <= 0) return null;

      const status = normalizeStatus(item.status);
      const totalScore = rawScore + STATUS_PRIORITY[status] * 2;
      const basePath = lessonPath(item.roadmap.slug, item.slug);
      const href = bestAnchor ? `${basePath}#${bestAnchor}` : basePath;
      const descSnippet = extractHighlightedSnippet(item.description ?? "", query, SNIPPET_MAX_CHARS);

      return {
        score: totalScore,
        updatedAt: item.updatedAt.getTime(),
        hit: {
          id: item.id,
          slug: item.slug,
          title: item.title,
          topicSlug: item.roadmap.slug,
          topicTitle: item.roadmap.title,
          section: item.section,
          status,
          href,
          matchedHeading: bestHeading,
          snippet: bestChunkSnippet ?? descSnippet ?? snippetFromText(item.description),
        } satisfies SearchLessonHit,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((entry) => entry.hit);

  const rankedNews = newsItems
    .map((item) => {
      const tags = parseJsonStringArray(item.tags);
      const score =
        scoreTextMatch(item.title, query) * 4 +
        scoreTextMatch(tags.join(" "), query) * 2.5 +
        scoreTextMatch(item.domain, query) * 2 +
        scoreTextMatch(item.tldr, query) * 1.5 +
        scoreTextMatch(item.personalNote, query) * 1.2;
      if (score <= 0) return null;

      const tldrSnippet = extractHighlightedSnippet(item.tldr ?? "", query, SNIPPET_MAX_CHARS);
      const noteSnippet = !tldrSnippet
        ? extractHighlightedSnippet(item.personalNote ?? "", query, SNIPPET_MAX_CHARS)
        : null;

      return {
        score: score + (item.isSaved ? 5 : 0),
        createdAt: item.createdAt.getTime(),
        hit: {
          id: item.id,
          title: item.title,
          domain: item.domain,
          platform: item.platform,
          isSaved: item.isSaved,
          tags,
          href: newsItemHref(item.id),
          snippet: tldrSnippet ?? noteSnippet ?? snippetFromText(item.tldr),
        } satisfies SearchNewsHit,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((entry) => entry.hit);

  return {
    query,
    scope,
    isZeroQuery: false,
    topics: rankedTopics,
    lessons: rankedLessons,
    news: rankedNews,
  };
}
