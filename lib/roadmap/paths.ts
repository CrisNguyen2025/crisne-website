/**
 * Page paths of Topics and Lessons (ADR-0014): a Topic lives at `/[topicSlug]`,
 * a Lesson at `/[topicSlug]/[lessonSlug]`. Safe to import from client components.
 */

/** First path segments the app already uses, so a Topic slug must never take one. */
export const RESERVED_TOPIC_SLUGS: readonly string[] = [
  'api',
  'lessons',
  'topic',
  'notes',
  'portfolio',
  'login',
  '_next',
];

export function isReservedTopicSlug(slug: string): boolean {
  return RESERVED_TOPIC_SLUGS.includes(slug.trim().toLowerCase());
}

export function topicPath(topicSlug: string): string {
  return `/${topicSlug}`;
}

/**
 * Without a Topic slug (data still loading) this falls back to the old `/lessons/[lessonSlug]`,
 * which 308s to the canonical path, instead of building a protocol-relative `//lesson` URL.
 */
export function lessonPath(topicSlug: string, lessonSlug: string): string {
  return topicSlug ? `/${topicSlug}/${lessonSlug}` : `/lessons/${lessonSlug}`;
}
