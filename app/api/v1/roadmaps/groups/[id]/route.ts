import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/groups/[id] - Update group title
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const updated = await prisma.roadmapGroup.update({
      where: { id },
      data: {
        title: title.trim(),
      },
    });

    return NextResponse.json({ group: updated });
  } catch (error: any) {
    console.error('[API PATCH /api/v1/roadmaps/groups/[id]] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update group' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/roadmaps/groups/[id] - Delete group
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check if group has items
    const itemCount = await prisma.roadmapItem.count({
      where: { groupId: id },
    });

    if (itemCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete group: it contains ${itemCount} item(s). Please move or delete items first.` },
        { status: 400 }
      );
    }

    await prisma.roadmapGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE /api/v1/roadmaps/groups/[id]] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete group' },
      { status: 500 }
    );
  }
}
