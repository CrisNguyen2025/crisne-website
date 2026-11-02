import { NextResponse } from 'next/server';

export { findDuplicate, normalizeTitle } from './titles';

export type DuplicateKind = 'topic' | 'item';

const KIND_LABEL: Record<DuplicateKind, string> = {
  topic: 'Topic',
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
