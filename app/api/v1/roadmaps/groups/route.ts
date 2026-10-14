import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";

// POST /api/v1/roadmaps/groups - Create a custom group in a layer
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { layerId, title, level } = body;

    if (!layerId || !title) {
      return NextResponse.json({ error: 'layerId and title are required' }, { status: 400 });
    }

    const groupLevel = (level || title.toLowerCase().replace(/[^\w]/g, '-')) || `group-${Date.now()}`;

    const count = await prisma.roadmapGroup.count({
      where: { layerId },
    });

    const newGroup = await prisma.roadmapGroup.create({
      data: {
        layerId,
        title: title.trim(),
        level: groupLevel,
        order: count + 1,
      },
    });

    return NextResponse.json({ group: newGroup }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/groups] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to create group' },
      { status: 500 }
    );
  }
}
