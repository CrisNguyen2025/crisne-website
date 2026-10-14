import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RoadmapLayer } from '@/lib/roadmap/types';
import { slugify } from '@/lib/utils';
import { requireWriteAccess } from "@/lib/auth/write-access";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/v1/roadmaps/[slug] - Fetch full hierarchy of a roadmap
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    let roadmap = await prisma.roadmap.findUnique({
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
      const all = await prisma.roadmap.findMany();
      const norm = slug.trim().toLowerCase();
      const match =
        all.find((r) => r.slug.toLowerCase() === norm) ||
        all.find((r) => r.shortCode?.toLowerCase() === norm) ||
        all.find((r) => r.title.toLowerCase() === norm);

      if (match) {
        roadmap = await prisma.roadmap.findUnique({
          where: { id: match.id },
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
      }
    }

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
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[API /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch roadmap data' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/[slug] - Delete an entire roadmap topic by slug, shortCode, or title
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;

    let roadmap = await prisma.roadmap.findUnique({
      where: { slug },
    });

    if (!roadmap) {
      const all = await prisma.roadmap.findMany();
      const norm = slug.trim().toLowerCase();
      roadmap =
        all.find((r) => r.slug.toLowerCase() === norm) ||
        all.find((r) => r.shortCode?.toLowerCase() === norm) ||
        all.find((r) => r.title.toLowerCase() === norm) ||
        null;
    }

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    await prisma.roadmap.delete({
      where: { id: roadmap.id },
    });

    return NextResponse.json({
      success: true,
      deletedSlug: roadmap.slug,
      deletedTitle: roadmap.title,
      deletedShortCode: roadmap.shortCode,
    });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to delete roadmap' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/roadmaps/[slug] - Update roadmap title, shortCode, description, or isLocked
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const body = await req.json();
    const { title, shortCode, description, isLocked } = body;

    let roadmap = await prisma.roadmap.findUnique({
      where: { slug },
    });

    if (!roadmap) {
      const all = await prisma.roadmap.findMany();
      const norm = slug.trim().toLowerCase();
      roadmap =
        all.find((r) => r.slug.toLowerCase() === norm) ||
        all.find((r) => r.shortCode?.toLowerCase() === norm) ||
        all.find((r) => r.title.toLowerCase() === norm) ||
        null;
    }

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

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
      where: { id: roadmap.id },
      data: updateData,
    });

    return NextResponse.json({ roadmap: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to update roadmap' },
      { status: 500 }
    );
  }
}

