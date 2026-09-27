import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/items/[id] - Update item info
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title, description, level } = body;

    let targetGroupId: string | undefined = undefined;

    if (level) {
      const existingItem = await prisma.roadmapItem.findUnique({
        where: { id },
        include: { group: true },
      });

      if (existingItem && existingItem.group.level !== level) {
        const layerId = existingItem.group.layerId;
        let targetGroup = await prisma.roadmapGroup.findFirst({
          where: { layerId, level },
        });

        if (!targetGroup) {
          targetGroup = await prisma.roadmapGroup.create({
            data: {
              layerId,
              level,
              title:
                level === 'core'
                  ? '🟢 Core'
                  : level === 'intermediate'
                    ? '🟡 Intermediate'
                    : '🔴 Advanced',
              order: 99,
            },
          });
        }
        targetGroupId = targetGroup.id;
      }
    }

    const updated = await prisma.roadmapItem.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(targetGroupId ? { groupId: targetGroupId } : {}),
      },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/items/[id] - Delete item
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.roadmapItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
