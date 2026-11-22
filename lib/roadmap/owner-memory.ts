// Owner Memory contract (ADR-0015): persistent cross-Thread facts & preferences for the Owner only.

export const OWNER_MEMORY_KINDS = [
  "profile",
  "techstack",
  "goal",
  "preference",
  "learning_note",
] as const;
export type OwnerMemoryKind = (typeof OWNER_MEMORY_KINDS)[number];

export const OWNER_MEMORY_STATUSES = ["active", "pending", "archived"] as const;
export type OwnerMemoryStatus = (typeof OWNER_MEMORY_STATUSES)[number];

export const OWNER_MEMORY_SOURCES = ["explicit", "suggested"] as const;
export type OwnerMemorySource = (typeof OWNER_MEMORY_SOURCES)[number];

export const MAX_MEMORY_CONTENT_CHARS = 300;
const MAX_SCOPE_SLUG_CHARS = 120;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isOwnerMemoryKind(value: unknown): value is OwnerMemoryKind {
  return typeof value === "string" && (OWNER_MEMORY_KINDS as readonly string[]).includes(value);
}

export function isOwnerMemoryStatus(value: unknown): value is OwnerMemoryStatus {
  return typeof value === "string" && (OWNER_MEMORY_STATUSES as readonly string[]).includes(value);
}

export function isOwnerMemorySource(value: unknown): value is OwnerMemorySource {
  return typeof value === "string" && (OWNER_MEMORY_SOURCES as readonly string[]).includes(value);
}

/** Normalize memory content: collapse whitespace, trim, enforce max length. */
export function cleanMemoryContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > MAX_MEMORY_CONTENT_CHARS) return null;
  return normalized;
}

/** Normalize optional topic slug scope; returns null for global scope, undefined if invalid. */
export function parseScopeTopicSlug(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const slug = value.trim().toLowerCase();
  if (!slug) return null;
  if (slug.length > MAX_SCOPE_SLUG_CHARS || !SLUG_RE.test(slug)) return undefined;
  return slug;
}
