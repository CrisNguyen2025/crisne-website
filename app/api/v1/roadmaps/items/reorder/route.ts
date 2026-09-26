import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/v1/roadmaps/items/reorder - Reorder items within group
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderedItemIds } = body as { orderedItemIds: string[] };

    if (!Array.isArray(orderedItemIds)) {
      return NextResponse.json({ error: 'orderedItemIds array is required' }, { status: 400 });
    }

    // Update order for each item in transaction
    await prisma.$transaction(
      orderedItemIds.map((id, index) =>
        prisma.roadmapItem.update({
          where: { id },
          data: { order: index + 1 },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/items/reorder] Error:', error);
    return NextResponse.json({ error: 'Failed to reorder items' }, { status: 500 });
  }
}
