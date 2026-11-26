import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { notifyOwnerMemoryChanged } from '@/lib/roadmap/rag-reindex';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';
import {
  cleanMemoryContent,
  isOwnerMemoryKind,
  isOwnerMemorySource,
  isOwnerMemoryStatus,
  parseScopeTopicSlug,
} from '@/lib/roadmap/owner-memory';

// Owner Memory CRUD (ADR-0015): strictly Owner-only (NextAuth session or x-admin-key).

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

const MEMORY_SELECT = {
  id: true,
  kind: true,
  scopeTopicSlug: true,
  content: true,
  source: true,
  status: true,
  replacesMemoryId: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
} as const;

// GET /api/v1/memories?status=active|pending|archived|all&topic=<slug>&kind=<kind>
export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const statusParam = (req.nextUrl.searchParams.get('status') ?? 'active').trim();
    const kindParam = (req.nextUrl.searchParams.get('kind') ?? '').trim();
    const topicParam = req.nextUrl.searchParams.get('topic');

    if (statusParam !== 'all' && !isOwnerMemoryStatus(statusParam)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400, headers: NO_STORE });
    }
    if (kindParam && !isOwnerMemoryKind(kindParam)) {
      return NextResponse.json({ error: 'Invalid kind filter' }, { status: 400, headers: NO_STORE });
    }

    const parsedTopic = topicParam !== null ? parseScopeTopicSlug(topicParam) : undefined;
    if (topicParam !== null && parsedTopic === undefined) {
      return NextResponse.json({ error: 'Invalid topic filter' }, { status: 400, headers: NO_STORE });
    }

    const where: Prisma.OwnerMemoryWhereInput = {};
    if (statusParam !== 'all') where.status = statusParam;
    if (kindParam) where.kind = kindParam;
    if (parsedTopic) {
      where.OR = [{ scopeTopicSlug: null }, { scopeTopicSlug: parsedTopic }];
    }

    const memories = await prisma.ownerMemory.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: MEMORY_SELECT,
    });

    return NextResponse.json({ memories }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API GET /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to load memories' }, { status: 500, headers: NO_STORE });
  }
}

// POST /api/v1/memories - Create an OwnerMemory entry (explicit active or suggested pending).
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

    const kind = body.kind;
    const content = cleanMemoryContent(body.content);
    const scopeTopicSlug = parseScopeTopicSlug(body.scopeTopicSlug);
    const source = body.source === undefined ? 'explicit' : body.source;
    const defaultStatus = source === 'suggested' ? 'pending' : 'active';
    const status = body.status === undefined ? defaultStatus : body.status;
    const replacesMemoryId =
      typeof body.replacesMemoryId === 'string' && body.replacesMemoryId.trim()
        ? body.replacesMemoryId.trim()
        : null;

    if (!isOwnerMemoryKind(kind)) {
      return NextResponse.json({ error: 'kind must be profile | techstack | goal | preference | learning_note' }, { status: 400, headers: NO_STORE });
    }
    if (!content) {
      return NextResponse.json({ error: 'content is required (1..300 characters)' }, { status: 400, headers: NO_STORE });
    }
    if (scopeTopicSlug === undefined) {
      return NextResponse.json({ error: 'scopeTopicSlug must be a valid slug or null' }, { status: 400, headers: NO_STORE });
    }
    if (!isOwnerMemorySource(source)) {
      return NextResponse.json({ error: 'source must be explicit | suggested' }, { status: 400, headers: NO_STORE });
    }
    if (!isOwnerMemoryStatus(status) || status === 'archived') {
      return NextResponse.json({ error: 'status must be active | pending' }, { status: 400, headers: NO_STORE });
    }

    // Deduplicate against existing entries with the same status & scope (case-insensitive)
    const existing = await prisma.ownerMemory.findMany({
      where: { status, scopeTopicSlug },
      select: MEMORY_SELECT,
    });
    const duplicate = existing.find((item) => item.content.toLowerCase() === content.toLowerCase());
    if (duplicate) {
      return NextResponse.json({ memory: duplicate, deduplicated: true }, { status: 200, headers: NO_STORE });
    }

    const memory = await prisma.ownerMemory.create({
      data: { kind, content, scopeTopicSlug, source, status, replacesMemoryId },
      select: MEMORY_SELECT,
    });

    if (memory.status === 'active') {
      notifyOwnerMemoryChanged();
    }
    return NextResponse.json({ memory }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error('[API POST /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500, headers: NO_STORE });
  }
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
    const rawIds = parsedBody.data.ids;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400, headers: NO_STORE });
    }
    const ids = Array.from(
      new Set(rawIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((id) => id.trim())),
    ).slice(0, 50);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400, headers: NO_STORE });
    }

    const now = new Date();
    const result = await prisma.ownerMemory.updateMany({
      where: { id: { in: ids }, status: 'active' },
      data: { lastUsedAt: now },
    });

    return NextResponse.json({ updatedCount: result.count, lastUsedAt: now.toISOString() }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API PATCH /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to update memory usage' }, { status: 500, headers: NO_STORE });
  }
}
