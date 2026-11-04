import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate, normalizeTitle } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { LESSON_STATUSES, isLessonStatus, type LessonStatus } from '@/lib/roadmap/status';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/items/[id] - Update title, description, section and Lesson Status
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title, description, section, status } = body;

    if (status !== undefined && !isLessonStatus(status)) {
      return NextResponse.json({ error: `status must be one of ${LESSON_STATUSES.join(', ')}` }, { status: 400 });
    }

    const current = await prisma.roadmapItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const data: {
      title?: string;
      description?: string;
      section?: string | null;
      status?: LessonStatus;
      statusUpdatedAt?: Date;
    } = {};

    if (title !== undefined && title.trim() && normalizeTitle(title) !== normalizeTitle(current.title)) {
      const siblings = await prisma.roadmapItem.findMany({
        where: { roadmapId: current.roadmapId, NOT: { id } },
        select: { id: true, title: true },
      });
      const duplicate = findDuplicate(siblings, title);
      if (duplicate) {
        return duplicateResponse('item', { id: duplicate.id, title: duplicate.title });
      }
      data.title = title.trim();
    }
    if (description !== undefined) data.description = description;
    if (section !== undefined) {
      const others = await prisma.roadmapItem.findMany({
        where: { roadmapId: current.roadmapId, NOT: { id } },
        select: { section: true },
      });
      data.section = sectionSpelling(others.map((o) => o.section), section);
    }
    // Lesson Status (ADR-0010): the time it changes is kept, so a same-status write keeps the old time
    if (status !== undefined && status !== current.status) {
      data.status = status;
      data.statusUpdatedAt = new Date();
    }

    const updated = await prisma.roadmapItem.update({ where: { id }, data });

    notifyRoadmapChanged();
    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/items/[id] - Delete a lesson
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    await prisma.roadmapItem.delete({ where: { id } });

    notifyRoadmapChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
