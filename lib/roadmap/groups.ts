import type { Prisma, PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { findDuplicate } from './duplicates';

// Same rule as roadmap-rag-assistant/rag_service/adapters/groups.py; both read tests/data/group_cases.json.

export interface GroupRef {
  groupId?: string | null;
  groupTitle?: string | null;
}

export type GroupPick<T> =
  | { kind: 'existing'; group: T }
  | { kind: 'create'; title: string }
  | { kind: 'ask'; titles: string[] };

/**
 * The group a lesson goes to (ADR-0008): the named one, a new one when the title is not taken yet,
 * the layer's only group when none is named; otherwise the caller must ask.
 */
export function pickGroup<T extends { id: string; title: string }>(groups: T[], ref: GroupRef): GroupPick<T> {
  if (ref.groupId) {
    const byId = groups.find((g) => g.id === ref.groupId);
    return byId ? { kind: 'existing', group: byId } : { kind: 'ask', titles: groups.map((g) => g.title) };
  }
  const title = ref.groupTitle?.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (title) {
    const byTitle = findDuplicate(groups, title);
    return byTitle ? { kind: 'existing', group: byTitle } : { kind: 'create', title };
  }
  if (groups.length === 1) return { kind: 'existing', group: groups[0] };
  return { kind: 'ask', titles: groups.map((g) => g.title) };
}

/** Thrown when a lesson names no group and the layer does not settle it. */
export class GroupChoiceRequired extends Error {
  constructor(readonly titles: string[]) {
    super(
      titles.length
        ? `Choose a group: ${titles.join(', ')}, or name a new one.`
        : 'This layer has no group yet. Name one.'
    );
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

/** The group a lesson goes to, created when the named title is new; throws GroupChoiceRequired otherwise. */
export async function resolveGroup(db: Db, layerId: string, ref: GroupRef) {
  const groups = await db.roadmapGroup.findMany({ where: { layerId }, orderBy: { order: 'asc' } });
  const pick = pickGroup(groups, ref);
  if (pick.kind === 'existing') return pick.group;
  if (pick.kind === 'ask') throw new GroupChoiceRequired(pick.titles);
  return db.roadmapGroup.create({ data: { layerId, title: pick.title, order: groups.length + 1 } });
}

/** 400 that lists the layer's groups, so the UI and the assistant can offer them. */
export function groupChoiceResponse(err: GroupChoiceRequired) {
  return NextResponse.json({ error: err.message, code: 'GROUP_REQUIRED', groups: err.titles }, { status: 400 });
}
