// Owner Memory contract (ADR-0015): persistent cross-Thread facts & preferences for the Owner only.

import { containsSecret, hasMeaningfulText, maskPII } from "@/lib/ai/pii-mask";

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

export const OWNER_MEMORY_SOURCES = ["explicit", "suggested", "observed"] as const;
export type OwnerMemorySource = (typeof OWNER_MEMORY_SOURCES)[number];

export const MAX_MEMORY_CONTENT_CHARS = 300;
export const MAX_EVIDENCE_SNIPPET_CHARS = 200;
const MAX_SCOPE_SLUG_CHARS = 120;
const MAX_SOURCE_THREAD_ID_CHARS = 120;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const THREAD_ID_RE = /^[A-Za-z0-9._:-]+$/;

export function sanitizeMemoryTextForStorage(
  value: unknown,
): { ok: true; content: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Nội dung bộ nhớ không hợp lệ." };
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { ok: false, error: "Nội dung bộ nhớ không được để trống." };
  }
  if (containsSecret(normalized)) {
    return {
      ok: false,
      error: "Không thể lưu API key, token, mật khẩu hoặc secret vào Bộ nhớ.",
    };
  }
  const masked = maskPII(normalized);
  if (!hasMeaningfulText(masked)) {
    return {
      ok: false,
      error: "Nội dung bộ nhớ quá ngắn hoặc chỉ chứa thông tin nhạy cảm đã che.",
    };
  }
  const cleaned = cleanMemoryContent(masked);
  if (!cleaned) {
    return {
      ok: false,
      error: "Nội dung bộ nhớ không hợp lệ hoặc vượt quá giới hạn cho phép.",
    };
  }
  return { ok: true, content: cleaned };
}

export function cleanEvidenceSnippet(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || containsSecret(normalized)) {
    return null;
  }
  const masked = maskPII(normalized).slice(0, MAX_EVIDENCE_SNIPPET_CHARS).trim();
  return masked || null;
}

export function parseConfidence(
  value: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, error: "confidence phải là số trong khoảng 0..1." };
  }
  return { ok: true, value: Math.round(value * 1000) / 1000 };
}

export function parseValidTo(
  value: unknown,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "validTo không hợp lệ." };
  }
  return { ok: true, value: parsed };
}

export function parseSourceThreadId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SOURCE_THREAD_ID_CHARS || !THREAD_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

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
