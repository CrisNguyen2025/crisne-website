import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { notifyOwnerMemoryChanged } from '@/lib/roadmap/rag-reindex';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';
import {
  cleanEvidenceSnippet,
  isOwnerMemoryKind,
  isOwnerMemorySource,
  isOwnerMemoryStatus,
  parseConfidence,
  parseScopeTopicSlug,
  parseSourceThreadId,
  parseValidTo,
  sanitizeMemoryTextForStorage,
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
  useCount: true,
  confidence: true,
  validTo: true,
  evidenceSnippet: true,
  sourceThreadId: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
} as const;

const OWNER_PREFERENCE_ID = 'default';

async function loadOwnerSettings() {
  const row = await prisma.ownerPreference?.findUnique?.({
    where: { id: OWNER_PREFERENCE_ID },
    select: {
      id: true,
      memoryEnabled: true,
      autoObserveEnabled: true,
      lastSynthesizedAt: true,
      lastSynthesisHash: true,
      updatedAt: true,
    },
  });
  return (
    row ?? {
      id: OWNER_PREFERENCE_ID,
      memoryEnabled: true,
      autoObserveEnabled: true,
      lastSynthesizedAt: null,
      lastSynthesisHash: null,
    }
  );
}

function normalizeOriginFilter(originParam: string): Prisma.OwnerMemoryWhereInput['source'] | undefined | 'invalid' {
  if (!originParam || originParam === 'all') return undefined;
  if (originParam === 'explicit') return 'explicit';
  if (originParam === 'auto') return { in: ['suggested', 'observed'] };
  return 'invalid';
}

function parseGetFilters(searchParams: URLSearchParams) {
  const statusParam = (searchParams.get('status') ?? 'active').trim();
  const kindParam = (searchParams.get('kind') ?? '').trim();
  const topicParam = searchParams.get('topic');
  const originParam = (searchParams.get('origin') ?? '').trim();
  const queryParam = (searchParams.get('q') ?? '').trim().toLowerCase();
  const includeSettings = searchParams.get('includeSettings') === '1';

  if (statusParam !== 'all' && !isOwnerMemoryStatus(statusParam)) return { error: 'Invalid status filter' } as const;
  if (kindParam && !isOwnerMemoryKind(kindParam)) return { error: 'Invalid kind filter' } as const;

  const sourceFilter = normalizeOriginFilter(originParam);
  if (sourceFilter === 'invalid') return { error: 'Invalid origin filter' } as const;

  const parsedTopic = topicParam !== null ? parseScopeTopicSlug(topicParam) : undefined;
  if (topicParam !== null && parsedTopic === undefined) return { error: 'Invalid topic filter' } as const;

  const where: Prisma.OwnerMemoryWhereInput = {};
  if (statusParam !== 'all') where.status = statusParam;
  if (kindParam) where.kind = kindParam;
  if (sourceFilter) where.source = sourceFilter;
  if (parsedTopic) where.OR = [{ scopeTopicSlug: null }, { scopeTopicSlug: parsedTopic }];

  return { where, queryParam, includeSettings } as const;
}

// GET /api/v1/memories?status=active|pending|archived|all&topic=<slug>&kind=<kind>&origin=all|explicit|auto&q=...&includeSettings=1
export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const parsed = parseGetFilters(req.nextUrl.searchParams);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    }

    const rows = await prisma.ownerMemory.findMany({
      where: parsed.where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: MEMORY_SELECT,
    });

    const memories = parsed.queryParam
      ? rows.filter((item) => {
          const hay = `${item.content} ${item.scopeTopicSlug ?? ''} ${item.evidenceSnippet ?? ''}`.toLowerCase();
          return hay.includes(parsed.queryParam);
        })
      : rows;

    if (parsed.includeSettings) {
      const settings = await loadOwnerSettings();
      return NextResponse.json({ memories, settings }, { headers: NO_STORE });
    }
    return NextResponse.json({ memories }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API GET /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to load memories' }, { status: 500, headers: NO_STORE });
  }
}

function parseCreateMemoryBody(body: Record<string, unknown>) {
  const kind = body.kind;
  const sanitized = sanitizeMemoryTextForStorage(body.content);
  const scopeTopicSlug = parseScopeTopicSlug(body.scopeTopicSlug);
  const source = body.source === undefined ? 'explicit' : body.source;
  const defaultStatus = source === 'suggested' ? 'pending' : 'active';
  const status = body.status ?? defaultStatus;
  const replacesMemoryId =
    typeof body.replacesMemoryId === 'string' && body.replacesMemoryId.trim() ? body.replacesMemoryId.trim() : null;
  const confidenceResult = parseConfidence(body.confidence);
  const validToResult = parseValidTo(body.validTo);

  if (!isOwnerMemoryKind(kind)) return { error: 'kind must be profile | techstack | goal | preference | learning_note' } as const;
  if (!sanitized.ok) return { error: sanitized.error } as const;
  if (scopeTopicSlug === undefined) return { error: 'scopeTopicSlug must be a valid slug or null' } as const;
  if (!isOwnerMemorySource(source)) return { error: 'source must be explicit | suggested | observed' } as const;
  if (!isOwnerMemoryStatus(status) || status === 'archived') return { error: 'status must be active | pending' } as const;
  if (!confidenceResult.ok) return { error: confidenceResult.error } as const;
  if (!validToResult.ok) return { error: validToResult.error } as const;

  return {
    kind,
    content: sanitized.content,
    scopeTopicSlug,
    source,
    status,
    replacesMemoryId,
    confidence: confidenceResult.value,
    validTo: validToResult.value,
    evidenceSnippet: cleanEvidenceSnippet(body.evidenceSnippet),
    sourceThreadId: parseSourceThreadId(body.sourceThreadId),
  } as const;
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
    const parsed = parseCreateMemoryBody(parsedBody.data);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    }

    if (parsed.source !== 'explicit') {
      const settings = await loadOwnerSettings();
      if (!settings.memoryEnabled || !settings.autoObserveEnabled) {
        return NextResponse.json(
          { error: 'Auto memory / observations are currently paused by Owner settings' },
          { status: 409, headers: NO_STORE },
        );
      }
    }

    const existing = await prisma.ownerMemory.findMany({
      where: { status: parsed.status, scopeTopicSlug: parsed.scopeTopicSlug },
      select: MEMORY_SELECT,
    });
    const duplicate = existing.find((item) => item.content.toLowerCase() === parsed.content.toLowerCase());
    if (duplicate) {
      return NextResponse.json({ memory: duplicate, deduplicated: true }, { status: 200, headers: NO_STORE });
    }

    const data: Prisma.OwnerMemoryCreateInput = {
      kind: parsed.kind,
      content: parsed.content,
      scopeTopicSlug: parsed.scopeTopicSlug,
      source: parsed.source,
      status: parsed.status,
      replacesMemoryId: parsed.replacesMemoryId,
      ...(parsed.confidence !== null ? { confidence: parsed.confidence } : {}),
      ...(parsed.validTo !== null ? { validTo: parsed.validTo } : {}),
      ...(parsed.evidenceSnippet !== null ? { evidenceSnippet: parsed.evidenceSnippet } : {}),
      ...(parsed.sourceThreadId !== null ? { sourceThreadId: parsed.sourceThreadId } : {}),
    };

    const memory = await prisma.ownerMemory.create({
      data,
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
      data: { lastUsedAt: now, useCount: { increment: 1 } },
    });

    return NextResponse.json({ updatedCount: result.count, lastUsedAt: now.toISOString() }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API PATCH /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to update memory usage' }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const statusParam = (req.nextUrl.searchParams.get('status') ?? 'all').trim();
    const originParam = (req.nextUrl.searchParams.get('origin') ?? '').trim();

    if (statusParam !== 'all' && !isOwnerMemoryStatus(statusParam)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400, headers: NO_STORE });
    }
    const sourceFilter = normalizeOriginFilter(originParam);
    if (sourceFilter === 'invalid') {
      return NextResponse.json({ error: 'Invalid origin filter' }, { status: 400, headers: NO_STORE });
    }

    const where: Prisma.OwnerMemoryWhereInput = {};
    if (statusParam !== 'all') where.status = statusParam;
    if (sourceFilter) where.source = sourceFilter;

    const result = await prisma.ownerMemory.deleteMany({ where });
    if (statusParam === 'all' || statusParam === 'active') {
      notifyOwnerMemoryChanged();
    }
    return NextResponse.json({ ok: true, deletedCount: result.count }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API DELETE /api/v1/memories] Error:', error);
    return NextResponse.json({ error: 'Failed to clear memories' }, { status: 500, headers: NO_STORE });
  }
}
