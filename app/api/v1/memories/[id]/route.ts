import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { notifyOwnerMemoryChanged } from '@/lib/roadmap/rag-reindex';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';
import {
  cleanEvidenceSnippet,
  isOwnerMemoryKind,
  isOwnerMemoryStatus,
  parseConfidence,
  parseScopeTopicSlug,
  parseValidTo,
  sanitizeMemoryTextForStorage,
} from '@/lib/roadmap/owner-memory';

// Owner Memory single-item update/delete (ADR-0015): strictly Owner-only.

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

function applyMetadataUpdates(
  body: Record<string, unknown>,
  data: Prisma.OwnerMemoryUpdateInput
): string | null {
  if (body.confidence !== undefined) {
    const parsedConf = parseConfidence(body.confidence);
    if (!parsedConf.ok) return parsedConf.error;
    data.confidence = parsedConf.value;
  }
  if (body.validTo !== undefined) {
    const parsedValidTo = parseValidTo(body.validTo);
    if (!parsedValidTo.ok) return parsedValidTo.error;
    data.validTo = parsedValidTo.value;
  }
  if (body.evidenceSnippet !== undefined) {
    data.evidenceSnippet = cleanEvidenceSnippet(body.evidenceSnippet);
  }
  return null;
}

function buildMemoryUpdateData(
  body: Record<string, unknown>
): { data: Prisma.OwnerMemoryUpdateInput } | { error: string } {
  const data: Prisma.OwnerMemoryUpdateInput = {};
  if (body.kind !== undefined) {
    if (!isOwnerMemoryKind(body.kind)) return { error: 'Invalid kind' };
    data.kind = body.kind;
  }
  if (body.content !== undefined) {
    const sanitized = sanitizeMemoryTextForStorage(body.content);
    if (!sanitized.ok) return { error: sanitized.error };
    data.content = sanitized.content;
  }
  if (body.scopeTopicSlug !== undefined) {
    const scopeTopicSlug = parseScopeTopicSlug(body.scopeTopicSlug);
    if (scopeTopicSlug === undefined) return { error: 'Invalid scopeTopicSlug' };
    data.scopeTopicSlug = scopeTopicSlug;
  }
  if (body.status !== undefined) {
    if (!isOwnerMemoryStatus(body.status)) return { error: 'Invalid status' };
    data.status = body.status;
  }
  const metaErr = applyMetadataUpdates(body, data);
  if (metaErr) return { error: metaErr };
  if (Object.keys(data).length === 0) {
    return { error: 'At least one updatable field is required' };
  }
  return { data };
}

// PATCH /api/v1/memories/[id] - Update fields or transition status (pending -> active archives replacesMemoryId).
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id || !id.trim()) {
    return NextResponse.json({ error: 'Memory id is required' }, { status: 400, headers: NO_STORE });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsedBody = JsonObjectSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
    }

    const existing = await prisma.ownerMemory.findUnique({ where: { id }, select: MEMORY_SELECT });
    if (!existing) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404, headers: NO_STORE });
    }

    const updateResult = buildMemoryUpdateData(parsedBody.data);
    if ('error' in updateResult) {
      return NextResponse.json({ error: updateResult.error }, { status: 400, headers: NO_STORE });
    }
    const { data } = updateResult;

    const restoreReplacedId =
      typeof parsedBody.data.restoreReplacedId === 'string' && parsedBody.data.restoreReplacedId.trim()
        ? parsedBody.data.restoreReplacedId.trim()
        : null;

    const shouldArchiveReplaced =
      existing.status === 'pending' &&
      data.status === 'active' &&
      Boolean(existing.replacesMemoryId);

    let memory;
    if (shouldArchiveReplaced) {
      memory = await prisma.$transaction(async (tx) => {
        await tx.ownerMemory.updateMany({
          where: { id: existing.replacesMemoryId!, status: 'active' },
          data: { status: 'archived' },
        });
        return tx.ownerMemory.update({ where: { id }, data, select: MEMORY_SELECT });
      });
    } else if (restoreReplacedId) {
      memory = await prisma.$transaction(async (tx) => {
        await tx.ownerMemory.updateMany({
          where: { id: restoreReplacedId, status: 'archived' },
          data: { status: 'active' },
        });
        return tx.ownerMemory.update({ where: { id }, data, select: MEMORY_SELECT });
      });
    } else {
      memory = await prisma.ownerMemory.update({ where: { id }, data, select: MEMORY_SELECT });
    }

    if (existing.status === 'active' || memory.status === 'active' || Boolean(restoreReplacedId)) {
      notifyOwnerMemoryChanged();
    }
    return NextResponse.json({ memory }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API PATCH /api/v1/memories/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500, headers: NO_STORE });
  }
}

// DELETE /api/v1/memories/[id] - Permanently remove an OwnerMemory entry.
export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id || !id.trim()) {
    return NextResponse.json({ error: 'Memory id is required' }, { status: 400, headers: NO_STORE });
  }

  try {
    const existing = await prisma.ownerMemory.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404, headers: NO_STORE });
    }
    await prisma.ownerMemory.updateMany?.({
      where: { replacesMemoryId: id },
      data: { replacesMemoryId: null },
    });
    await prisma.ownerMemory.delete({ where: { id } });
    if (existing.status === 'active') {
      notifyOwnerMemoryChanged();
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API DELETE /api/v1/memories/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500, headers: NO_STORE });
  }
}
