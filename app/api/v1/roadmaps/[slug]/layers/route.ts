import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRoadmapId } from '@/lib/roadmap/resolveRoadmap';
import { requireWriteAccess } from "@/lib/auth/write-access";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// POST /api/v1/roadmaps/[slug]/layers - Create a layer in roadmap
export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const body = await req.json();
    const { title, shortTag, subtitle } = body;

    if (!title || !shortTag) {
      return NextResponse.json({ error: 'Title and shortTag are required' }, { status: 400 });
    }

    const roadmapId = await resolveRoadmapId(slug);
    const roadmap = roadmapId
      ? await prisma.roadmap.findUnique({
          where: { id: roadmapId },
          include: { _count: { select: { layers: true } } },
        })
      : null;

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    const newLayer = await prisma.roadmapLayer.create({
      data: {
        roadmapId: roadmap.id,
        title,
        shortTag: shortTag.toUpperCase(),
        subtitle: subtitle || '',
        order: roadmap._count.layers + 1,
        groups: {
          create: [
            {
              level: 'core',
              title: '🟢 Core',
              order: 1,
            },
          ],
        },
      },
      include: {
        groups: {
          include: { items: true },
        },
      },
    });

    return NextResponse.json({ layer: newLayer }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/[slug]/layers] Error:', error);
    return NextResponse.json({ error: 'Failed to create layer' }, { status: 500 });
  }
}
