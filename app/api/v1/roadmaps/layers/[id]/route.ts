import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/layers/[id] - Update layer
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title, shortTag, subtitle } = body;

    const updated = await prisma.roadmapLayer.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(shortTag ? { shortTag: shortTag.toUpperCase() } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
      },
    });

    return NextResponse.json({ layer: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/layers/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update layer' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/layers/[id] - Delete layer
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.roadmapLayer.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/layers/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete layer' }, { status: 500 });
  }
}
