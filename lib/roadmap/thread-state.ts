// Thread state of the Owner (ADR-0012): what the routes under /api/v1/threads accept and keep.

/** Messages kept per Thread; older ones are deleted on every write. */
export const MAX_THREAD_MESSAGES = 50;

/** A message or Thread older than this is deleted on the next write. */
export const THREAD_RETENTION_MS = 30 * 24 * 3600 * 1000;

/** One message is clipped to this length (a bulk-import paste or a long answer). */
export const MAX_MESSAGE_CONTENT_CHARS = 20_000;

const MAX_THREAD_ID_CHARS = 200;
const MAX_TOPIC_FIELD_CHARS = 300;

export const THREAD_ROLES = ["user", "assistant"] as const;
export type ThreadRole = (typeof THREAD_ROLES)[number];

/**
 * Only an Owner Thread is stored. The proxy prefixes every Thread id with its Actor ("owner:" or
 * "visitor:"), so a Visitor's Thread is refused here even if the caller forgot to filter it.
 */
export function isOwnerThreadId(threadId: string): boolean {
  return threadId.startsWith("owner:") && threadId.length > "owner:".length && threadId.length <= MAX_THREAD_ID_CHARS;
}

export function isThreadRole(value: unknown): value is ThreadRole {
  return typeof value === "string" && (THREAD_ROLES as readonly string[]).includes(value);
}

export function clipMessageContent(content: string): string {
  return content.slice(0, MAX_MESSAGE_CONTENT_CHARS);
}

/** A topic field (slug or title): trimmed and clipped, or null when empty or not a string. */
export function cleanTopicField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_TOPIC_FIELD_CHARS);
  return trimmed || null;
}
