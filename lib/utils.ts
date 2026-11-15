import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/đ/g, "d") // NFD does not split "đ", so the accent strip below dropped it ("mặc định" → "mac-inh")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s-]/g, "") // remove invalid chars
    .replace(/[\s_-]+/g, "-") // collapse whitespace and replace by -
    .replace(/^-+|-+$/g, ""); // trim - from ends
}

/** Slug of a lesson title not in `used` (adds -2, -3...), and records it in `used`. */
export function uniqueSlug(title: string, used: Set<string>): string {
  const base = slugify(title) || "lesson";
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

