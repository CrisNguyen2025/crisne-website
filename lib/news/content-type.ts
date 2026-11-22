// Client-safe: no zod or Prisma imports, used by the News list and filter.

/**
 * Content-type tags; the worker puts exactly one first in `tags`.
 * Keep in sync with CONTENT_TYPE_TAGS in news-ingest-worker/news_worker/schemas.py.
 */
export const NEWS_CONTENT_TYPE_TAGS = [
  { tag: "tip", label: "Mẹo" },
  { tag: "tutorial", label: "Hướng dẫn" },
  { tag: "tin-moi", label: "Tin mới" },
  { tag: "quan-diem", label: "Quan điểm" },
] as const;

/** Display label of the item's content-type tag, or null when it has none. */
export function formatNewsContentType(tags: readonly string[]): string | null {
  const match = NEWS_CONTENT_TYPE_TAGS.find((type) => tags.includes(type.tag));
  return match ? match.label : null;
}

export function isNewsContentTypeTag(tag: string): boolean {
  return NEWS_CONTENT_TYPE_TAGS.some((type) => type.tag === tag);
}
