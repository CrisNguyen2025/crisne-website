import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

export function getMediaUrl({ url }: { url: string }): string {
  if (!url) return "";
  // If already absolute, return as-is
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  // Relative path — prefix with base URL if available
  return url.startsWith("/") ? url : `/${url}`;
}

export function trimChar(value: string, char: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === char) start++;
  while (end > start && value[end - 1] === char) end--;
  return value.slice(start, end);
}

export function trimTrailingChar(value: string, char: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === char) end--;
  return end === value.length ? value : value.slice(0, end);
}

export function slugify(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/đ/g, "d") // NFD does not split "đ", so the accent strip below dropped it ("mặc định" → "mac-inh")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s-]/g, "") // remove invalid chars
    .replace(/[\s_-]+/g, "-"); // collapse whitespace and replace by -
  return trimChar(cleaned, "-");
}

/** Slug of a lesson title not in `used` (adds -2, -3...), and records it in `used`. */
export function uniqueSlug(title: string, used: Set<string>): string {
  const base = slugify(title) || "lesson";
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

export function allocateGlobalLessonSlug(
  title: string,
  used: Set<string>,
  topicSlug?: string,
  topicUsed?: Set<string>,
): string {
  const base = slugify(title) || "lesson";
  if (!used.has(base)) {
    used.add(base);
    topicUsed?.add(base);
    return base;
  }
  const takenInSameTopic = topicUsed?.has(base) ?? false;
  const cleanTopic = topicSlug ? slugify(topicSlug) : "";
  if (cleanTopic && !takenInSameTopic) {
    const withTopic = `${base}-${cleanTopic}`;
    if (!used.has(withTopic)) {
      used.add(withTopic);
      topicUsed?.add(withTopic);
      return withTopic;
    }
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) {
    n += 1;
  }
  const candidate = `${base}-${n}`;
  used.add(candidate);
  topicUsed?.add(candidate);
  return candidate;
}

