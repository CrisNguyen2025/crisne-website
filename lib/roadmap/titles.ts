/**
 * Two titles are the same entry when they differ only by case or spacing.
 * Diacritics stay significant: "Cơ bản" and "Co ban" are different titles.
 *
 * Kept free of server imports so client components can use it.
 */
export function normalizeTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findDuplicate<T extends { title: string }>(siblings: T[], title: string): T | undefined {
  const wanted = normalizeTitle(title);
  return siblings.find((s) => normalizeTitle(s.title) === wanted);
}
