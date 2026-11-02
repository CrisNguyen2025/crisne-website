import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from '@/lib/roadmap/duplicates';
import { GroupChoiceRequired, groupChoiceResponse, resolveGroup } from '@/lib/roadmap/groups';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';

// POST /api/v1/roadmaps/items - Create item in a group
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { layerId, groupId, groupTitle, title, description, content } = body;

    if (!layerId || !title) {
      return NextResponse.json({ error: 'layerId and title are required' }, { status: 400 });
    }

    // A lesson title appears once per layer, whatever its group
    const layerItems = await prisma.roadmapItem.findMany({
      where: { group: { layerId } },
      select: { id: true, title: true, group: { select: { title: true } } },
    });
    const duplicate = findDuplicate(layerItems, title);
    if (duplicate) {
      return duplicateResponse('item', { id: duplicate.id, title: duplicate.title, groupTitle: duplicate.group.title, layerId });
    }

    const group = await resolveGroup(prisma, layerId, { groupId, groupTitle });
    const groupSize = await prisma.roadmapItem.count({ where: { groupId: group.id } });

    const newItem = await prisma.roadmapItem.create({
      data: {
        groupId: group.id,
        title,
        description: description || '',
        content: content || null,
        order: groupSize + 1,
      },
    });

    notifyRoadmapChanged();
    return NextResponse.json({
      item: {
        id: newItem.id,
        title: newItem.title,
        description: newItem.description,
        layerId,
        groupId: group.id,
        groupTitle: group.title,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GroupChoiceRequired) return groupChoiceResponse(error);
    console.error('[API POST /api/v1/roadmaps/items] Error:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
