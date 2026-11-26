import {
  extractHighlightedSnippet,
  foldSearchText,
  matchesSearchText,
} from "@/lib/search/text-match";

// Thread state of the Owner (ADR-0012): what the routes under /api/v1/threads accept and keep.

/** Messages kept per Thread; older ones are deleted on every write. */
export const MAX_THREAD_MESSAGES = 50;

/** A message or Thread older than this is deleted on the next write. */
export const THREAD_RETENTION_MS = 30 * 24 * 3600 * 1000;

/** One message is clipped to this length (a bulk-import paste or a long answer). */
export const MAX_MESSAGE_CONTENT_CHARS = 20_000;

export const DEFAULT_THREAD_LIST_LIMIT = 30;
export const MAX_THREAD_LIST_LIMIT = 100;
export const MAX_THREAD_SEARCH_CHARS = 100;
export const MAX_THREAD_TITLE_CHARS = 80;
const MAX_SNIPPET_CHARS = 96;

const MAX_THREAD_ID_CHARS = 200;
const MAX_TOPIC_FIELD_CHARS = 300;
const MAX_LESSON_ID_CHARS = 120;

export const OWNER_THREAD_PREFIX = "owner:";

export const THREAD_ROLES = ["user", "assistant"] as const;
export type ThreadRole = (typeof THREAD_ROLES)[number];

export interface ThreadSummary {
  threadId: string;
  title: string;
  matchedSnippet: string | null;
  lastMessageAt: string;
  messageCount: number;
  activeTopicSlug: string | null;
  activeTopicTitle: string | null;
  activeLessonTitle: string | null;
  isClosed: boolean;
}

const TRIVIAL_GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "alo",
  "chao",
  "xin chao",
  "ok",
  "oki",
  "okay",
  "test",
]);

const CONFIRMATION_ACTIONS = new Set([
  "ok",
  "oki",
  "okay",
  "huy",
  "huy bo",
  "cancel",
  "xac nhan",
  "dong y",
]);

/**
 * Only an Owner Thread is stored. The proxy prefixes every Thread id with its Actor ("owner:" or
 * "visitor:"), so a Visitor's Thread is refused here even if the caller forgot to filter it.
 */
export function isOwnerThreadId(threadId: string): boolean {
  return (
    threadId.startsWith(OWNER_THREAD_PREFIX) &&
    threadId.length > OWNER_THREAD_PREFIX.length &&
    threadId.length <= MAX_THREAD_ID_CHARS
  );
}

export function toOwnerThreadId(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") return null;
  const scoped = trimmed.startsWith(OWNER_THREAD_PREFIX) ? trimmed : `${OWNER_THREAD_PREFIX}${trimmed}`;
  return isOwnerThreadId(scoped) ? scoped : null;
}

export function stripOwnerThreadPrefix(threadId: string): string {
  return threadId.startsWith(OWNER_THREAD_PREFIX) ? threadId.slice(OWNER_THREAD_PREFIX.length) : threadId;
}

export function isThreadRole(value: unknown): value is ThreadRole {
  return typeof value === "string" && (THREAD_ROLES as readonly string[]).includes(value);
}

export function clipMessageContent(content: string): string {
  return content.slice(0, MAX_MESSAGE_CONTENT_CHARS);
}

/** A topic, title, or section field: trimmed and clipped, or null when empty or not a string. */
export function cleanTopicField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_TOPIC_FIELD_CHARS);
  return trimmed || null;
}

/** A lesson id or slug field: trimmed and clipped, or null when empty or not a string. */
export function cleanLessonIdField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_LESSON_ID_CHARS);
  return trimmed || null;
}

export function parseThreadListLimit(raw: string | null): number {
  if (!raw) return DEFAULT_THREAD_LIST_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_THREAD_LIST_LIMIT;
  return Math.min(parsed, MAX_THREAD_LIST_LIMIT);
}

export function parseThreadSearchQuery(raw: string | null): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_THREAD_SEARCH_CHARS);
}

export function foldThreadSearchText(text: string): string {
  return foldSearchText(text);
}

function compactText(text: string): string {
  return text.replace(/[`*_#>\[\]]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

const TRAILING_PUNCTUATION = new Set(["!", "?", ".", "~", ","]);

function stripTrailingPunctuation(folded: string): string {
  let out = folded;
  while (out.length > 0 && TRAILING_PUNCTUATION.has(out[out.length - 1])) {
    out = out.slice(0, -1);
  }
  return out.trim();
}

export function isTrivialThreadGreeting(text: string): boolean {
  const folded = stripTrailingPunctuation(foldThreadSearchText(text));
  return !folded || TRIVIAL_GREETINGS.has(folded);
}

export function isConfirmationThreadMessage(text: string): boolean {
  const folded = stripTrailingPunctuation(foldThreadSearchText(text));
  return !folded || CONFIRMATION_ACTIONS.has(folded);
}

export function matchesThreadSearchText(haystack: string, query: string): boolean {
  return matchesSearchText(haystack, query);
}

export function buildThreadTitle(contents: readonly string[]): string {
  const cleaned = contents.map(compactText).filter(Boolean);
  if (cleaned.length === 0) return "Cuộc trò chuyện";
  const meaningful = cleaned.find((item) => !isTrivialThreadGreeting(item));
  return truncateText(meaningful ?? cleaned[0], MAX_THREAD_TITLE_CHARS);
}

export function extractMatchSnippet(content: string, query: string): string | null {
  return extractHighlightedSnippet(content, query, MAX_SNIPPET_CHARS)?.text ?? null;
}
