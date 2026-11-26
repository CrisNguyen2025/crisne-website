import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { containsSecret, maskPII } from '@/lib/ai/pii-mask';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';
import { parseScopeTopicSlug } from '@/lib/roadmap/owner-memory';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const RETENTION_DAYS = 90;
const MAX_SUMMARY_CHARS = 240;
const MAX_ENTITY_ID_CHARS = 120;
const MAX_METADATA_CHARS = 1000;

const ALLOWED_EVENT_TYPES = new Set([
  'quiz_completed',
  'memory_rejected',
  'memory_edited',
  'observation_feedback',
  'lesson_updated',
]);

const EVENT_SELECT = {
  id: true,
  eventType: true,
  topicSlug: true,
  entityId: true,
  summary: true,
  metadataJson: true,
  createdAt: true,
} as const;

function sanitizeMetadataJson(rawMeta: unknown): string {
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    return '{}';
  }
  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rawMeta)) {
    if (typeof val === 'string') {
      if (containsSecret(val)) continue;
      safe[key] = maskPII(val).slice(0, 200);
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      safe[key] = val;
    }
  }
  const encoded = JSON.stringify(safe);
  return encoded.length <= MAX_METADATA_CHARS ? encoded : '{}';
}

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const rawLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    const events = await prisma.ownerActivityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: EVENT_SELECT,
    });
    return NextResponse.json({ events }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API GET /api/v1/memories/activity-events] Error:', error);
    return NextResponse.json({ error: 'Failed to load activity events' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const raw = await req.json().catch(() => null);
    const parsedBody = JsonObjectSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
    }
    const body = parsedBody.data;

    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: 'Invalid eventType' }, { status: 400, headers: NO_STORE });
    }

    const topicSlug = parseScopeTopicSlug(body.topicSlug);
    if (topicSlug === undefined) {
      return NextResponse.json({ error: 'Invalid topicSlug' }, { status: 400, headers: NO_STORE });
    }

    const rawSummary = typeof body.summary === 'string' ? body.summary.replace(/\s+/g, ' ').trim() : '';
    if (!rawSummary) {
      return NextResponse.json({ error: 'summary is required' }, { status: 400, headers: NO_STORE });
    }
    if (containsSecret(rawSummary)) {
      return NextResponse.json({ error: 'summary cannot contain sensitive tokens' }, { status: 400, headers: NO_STORE });
    }

    const summary = maskPII(rawSummary).slice(0, MAX_SUMMARY_CHARS).trim();
    const entityId =
      typeof body.entityId === 'string' && body.entityId.trim()
        ? body.entityId.trim().slice(0, MAX_ENTITY_ID_CHARS)
        : null;
    const metadataJson = sanitizeMetadataJson(body.metadata);

    const event = await prisma.ownerActivityEvent.create({
      data: {
        eventType,
        topicSlug,
        entityId,
        summary,
        metadataJson,
      },
      select: EVENT_SELECT,
    });

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await prisma.ownerActivityEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return NextResponse.json({ event }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error('[API POST /api/v1/memories/activity-events] Error:', error);
    return NextResponse.json({ error: 'Failed to record activity event' }, { status: 500, headers: NO_STORE });
  }
}
