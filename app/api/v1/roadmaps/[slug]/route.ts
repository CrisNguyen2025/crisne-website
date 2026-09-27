import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RoadmapLayer } from '@/lib/roadmap/types';
import { slugify } from '@/lib/utils';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/v1/roadmaps/[slug] - Fetch full hierarchy of a roadmap
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    const roadmap = await prisma.roadmap.findUnique({
      where: { slug },
      include: {
        layers: {
          orderBy: { order: 'asc' },
          include: {
            groups: {
              orderBy: { order: 'asc' },
              include: {
                items: {
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    // Format into RoadmapLayer structure expected by frontend
    const layers: RoadmapLayer[] = roadmap.layers.map((layer) => ({
      id: layer.id,
      order: layer.order,
      shortTag: layer.shortTag,
      title: layer.title,
      subtitle: layer.subtitle || '',
      groups: layer.groups.map((group) => ({
        id: group.id,
        level: group.level,
        title: group.title,
        items: group.items.map((item) => ({
          id: item.id,
          slug: slugify(item.title),
          title: item.title,
          description: item.description || '',
          level: group.level,
          layerId: layer.id,
          content: item.content || undefined,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
      })),
    }));

    return NextResponse.json(
      {
        roadmap: {
          id: roadmap.id,
          slug: roadmap.slug,
          title: roadmap.title,
          shortCode: roadmap.shortCode,
          description: roadmap.description,
          icon: roadmap.icon,
          order: roadmap.order,
          isLocked: Boolean(roadmap.isLocked),
        },
        layers,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('[API /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch roadmap data' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/[slug] - Delete an entire roadmap topic
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    const roadmap = await prisma.roadmap.findUnique({
      where: { slug },
    });

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    await prisma.roadmap.delete({
      where: { slug },
    });

    return NextResponse.json({ success: true, deletedSlug: slug });
  } catch (error: any) {
    console.error('[API DELETE /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete roadmap' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/roadmaps/[slug] - Update roadmap title, shortCode, description, or isLocked
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const { title, shortCode, description, isLocked } = body;

    const updateData: {
      title?: string;
      shortCode?: string;
      description?: string;
      isLocked?: boolean;
    } = {};

    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      updateData.title = title.trim();
    }
    if (shortCode !== undefined) {
      updateData.shortCode = shortCode.trim();
    }
    if (description !== undefined) {
      updateData.description = description.trim();
    }
    if (isLocked !== undefined) {
      updateData.isLocked = Boolean(isLocked);
    }

    const updated = await prisma.roadmap.update({
      where: { slug },
      data: updateData,
    });

    return NextResponse.json({ roadmap: updated });
  } catch (error: any) {
    console.error('[API PATCH /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update roadmap' },
      { status: 500 }
    );
  }
}

