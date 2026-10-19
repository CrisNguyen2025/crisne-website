import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from '@/lib/roadmap/duplicates';
import { findOrCreateGroup, normalizeLevel } from '@/lib/roadmap/levels';

// POST /api/v1/roadmaps/items - Create item in a group
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { layerId, title, description, content } = body;
    const level = body.level ? normalizeLevel(body.level) : '';

    if (!layerId || !level || !title) {
      return NextResponse.json({ error: 'layerId, level, and title are required' }, { status: 400 });
    }

    // A lesson title appears once per layer, whatever its level
    const layerItems = await prisma.roadmapItem.findMany({
      where: { group: { layerId } },
      select: { id: true, title: true, group: { select: { level: true } } },
    });
    const duplicate = findDuplicate(layerItems, title);
    if (duplicate) {
      return duplicateResponse('item', { id: duplicate.id, title: duplicate.title, level: duplicate.group.level, layerId });
    }

    const group = await findOrCreateGroup(prisma, layerId, level);

    const newItem = await prisma.roadmapItem.create({
      data: {
        groupId: group.id,
        title,
        description: description || '',
        content: content || null,
        order: group._count.items + 1,
      },
    });

    return NextResponse.json({
      item: {
        id: newItem.id,
        title: newItem.title,
        description: newItem.description,
        level,
        layerId,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/items] Error:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
