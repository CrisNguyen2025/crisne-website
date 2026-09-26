import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/v1/roadmaps/items - Create item in a group
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { layerId, level, title, description } = body;

    if (!layerId || !level || !title) {
      return NextResponse.json({ error: 'layerId, level, and title are required' }, { status: 400 });
    }

    // Find or create group
    let group = await prisma.roadmapGroup.findFirst({
      where: { layerId, level },
      include: { _count: { select: { items: true } } },
    });

    if (!group) {
      group = await prisma.roadmapGroup.create({
        data: {
          layerId,
          level,
          title: level === 'core' ? '🟢 Core' : level === 'intermediate' ? '🟡 Intermediate' : '🔴 Advanced',
          order: 99,
        },
        include: { _count: { select: { items: true } } },
      });
    }

    const newItem = await prisma.roadmapItem.create({
      data: {
        groupId: group.id,
        title,
        description: description || '',
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
