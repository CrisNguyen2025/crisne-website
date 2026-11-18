let pendingLessonSlug: string | null = null;

export function markPendingLessonWrite(slug: string): void {
  pendingLessonSlug = slug;
}

export function peekPendingLessonWrite(slug: string): boolean {
  return pendingLessonSlug === slug;
}

export function clearPendingLessonWrite(slug: string): void {
  if (pendingLessonSlug === slug) {
    pendingLessonSlug = null;
  }
}
