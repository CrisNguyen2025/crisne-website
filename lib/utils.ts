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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s-]/g, "") // remove invalid chars
    .replace(/[\s_-]+/g, "-") // collapse whitespace and replace by -
    .replace(/^-+|-+$/g, ""); // trim - from ends
}

