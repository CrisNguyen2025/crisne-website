import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// POST /api/v1/roadmaps/[slug]/layers - Create a layer in roadmap
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const { title, shortTag, subtitle } = body;

    if (!title || !shortTag) {
      return NextResponse.json({ error: 'Title and shortTag are required' }, { status: 400 });
    }

    const roadmap = await prisma.roadmap.findUnique({
      where: { slug },
      include: { _count: { select: { layers: true } } },
    });

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
