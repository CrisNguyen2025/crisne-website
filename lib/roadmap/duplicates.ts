import { NextResponse } from 'next/server';

/**
 * Two titles are the same entry when they differ only by case or spacing.
 * Diacritics stay significant: "Cơ bản" and "Co ban" are different titles.
 */
export function normalizeTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findDuplicate<T extends { title: string }>(siblings: T[], title: string): T | undefined {
  const wanted = normalizeTitle(title);
  return siblings.find((s) => normalizeTitle(s.title) === wanted);
}

export type DuplicateKind = 'topic' | 'layer' | 'group' | 'item';

const KIND_LABEL: Record<DuplicateKind, string> = {
  topic: 'Topic',
  layer: 'Layer',
  group: 'Group',
  item: 'Item',
};

/**
 * 409 with the entry that already exists, so callers (UI, assistant) can reuse it
 * instead of creating a near-identical copy.
 */
export function duplicateResponse(kind: DuplicateKind, existing: { id: string; title: string } & Record<string, unknown>) {
  return NextResponse.json(
    {
      error: `${KIND_LABEL[kind]} "${existing.title}" already exists.`,
      code: 'DUPLICATE',
      kind,
      existing,
    },
    { status: 409 }
  );
}
