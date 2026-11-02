import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/groups/[id] - Update group title
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // The title names the group, so a rename must not take a sibling's title (ADR-0008)
    const current = await prisma.roadmapGroup.findUnique({ where: { id }, select: { layerId: true } });
    if (current) {
      const siblings = await prisma.roadmapGroup.findMany({
        where: { layerId: current.layerId, NOT: { id } },
        select: { id: true, title: true },
      });
      const duplicate = findDuplicate(siblings, title);
      if (duplicate) return duplicateResponse('group', duplicate);
    }

    const updated = await prisma.roadmapGroup.update({
      where: { id },
      data: {
        title: title.trim(),
      },
    });

    notifyRoadmapChanged();
    return NextResponse.json({ group: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/groups/[id]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to update group' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/roadmaps/groups/[id] - Delete group
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { id } = await context.params;

    const existing = await prisma.roadmapGroup.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ success: true, message: 'Group not found or already deleted' });
    }

    await prisma.roadmapGroup.delete({
      where: { id: existing.id },
    });

    notifyRoadmapChanged();
    return NextResponse.json({ success: true, deletedId: existing.id });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/groups/[id]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to delete group' },
      { status: 500 }
    );
  }
}
