import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { notifyOwnerMemoryChanged } from '@/lib/roadmap/rag-reindex';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const OWNER_PREFERENCE_ID = 'default';

const PREFERENCE_SELECT = {
  id: true,
  memoryEnabled: true,
  autoObserveEnabled: true,
  lastSynthesizedAt: true,
  lastSynthesisHash: true,
  updatedAt: true,
} as const;

const DEFAULT_SETTINGS = {
  id: OWNER_PREFERENCE_ID,
  memoryEnabled: true,
  autoObserveEnabled: true,
  lastSynthesizedAt: null,
  lastSynthesisHash: null,
};

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const existing = await prisma.ownerPreference?.findUnique?.({
      where: { id: OWNER_PREFERENCE_ID },
      select: PREFERENCE_SELECT,
    });
    return NextResponse.json({ settings: existing ?? DEFAULT_SETTINGS }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API GET /api/v1/memories/settings] Error:', error);
    return NextResponse.json({ error: 'Failed to load memory settings' }, { status: 500, headers: NO_STORE });
  }
}

function applySynthesisFields(
  body: Record<string, unknown>,
  update: Record<string, unknown>
): string | null {
  if (body.lastSynthesizedAt !== undefined) {
    const dt = body.lastSynthesizedAt === null ? null : new Date(String(body.lastSynthesizedAt));
    if (dt !== null && Number.isNaN(dt.getTime())) {
      return 'Invalid lastSynthesizedAt';
    }
    update.lastSynthesizedAt = dt;
  }
  if (body.lastSynthesisHash !== undefined) {
    if (body.lastSynthesisHash === null) {
      update.lastSynthesisHash = null;
    } else if (typeof body.lastSynthesisHash === 'string' && body.lastSynthesisHash.length <= 128) {
      update.lastSynthesisHash = body.lastSynthesisHash.trim() || null;
    } else {
      return 'Invalid lastSynthesisHash';
    }
  }
  return null;
}

function parseSettingsUpdate(
  body: Record<string, unknown>
): { update: Record<string, unknown> } | { error: string } {
  const update: Record<string, unknown> = {};
  if (body.memoryEnabled !== undefined) {
    if (typeof body.memoryEnabled !== 'boolean') return { error: 'memoryEnabled must be boolean' };
    update.memoryEnabled = body.memoryEnabled;
  }
  if (body.autoObserveEnabled !== undefined) {
    if (typeof body.autoObserveEnabled !== 'boolean') return { error: 'autoObserveEnabled must be boolean' };
    update.autoObserveEnabled = body.autoObserveEnabled;
  }
  const synthErr = applySynthesisFields(body, update);
  if (synthErr) return { error: synthErr };
  if (Object.keys(update).length === 0) {
    return { error: 'At least one settings field is required' };
  }
  return { update };
}

export async function PATCH(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const raw = await req.json().catch(() => null);
    const parsedBody = JsonObjectSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
    }
    const parsed = parseSettingsUpdate(parsedBody.data);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    }
    const { update } = parsed;

    const settings = await prisma.ownerPreference.upsert({
      where: { id: OWNER_PREFERENCE_ID },
      create: {
        id: OWNER_PREFERENCE_ID,
        memoryEnabled: typeof update.memoryEnabled === 'boolean' ? update.memoryEnabled : true,
        autoObserveEnabled: typeof update.autoObserveEnabled === 'boolean' ? update.autoObserveEnabled : true,
        lastSynthesizedAt: (update.lastSynthesizedAt as Date | null | undefined) ?? null,
        lastSynthesisHash: (update.lastSynthesisHash as string | null | undefined) ?? null,
      },
      update,
      select: PREFERENCE_SELECT,
    });

    notifyOwnerMemoryChanged();
    return NextResponse.json({ settings }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API PATCH /api/v1/memories/settings] Error:', error);
    return NextResponse.json({ error: 'Failed to update memory settings' }, { status: 500, headers: NO_STORE });
  }
}
