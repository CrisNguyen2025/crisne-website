import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChecklistItem, GetRoadmapResponseDto } from '@/lib/roadmap/types';
import { slugify } from '@/lib/utils';
import { hasWriteAccess, requireWriteAccess } from "@/lib/auth/write-access";
import { DEFAULT_LESSON_STATUS, isLessonStatus } from '@/lib/roadmap/status';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionsInOrder } from '@/lib/roadmap/sections';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** The topic with the given slug or title (case-insensitive), or null. */
async function findTopic(identifier: string) {
  const roadmap = await prisma.roadmap.findUnique({ where: { slug: identifier } });
  if (roadmap) return roadmap;
  const norm = identifier.trim().toLowerCase();
  const all = await prisma.roadmap.findMany();
  return all.find((r) => r.slug.toLowerCase() === norm) || all.find((r) => r.title.toLowerCase() === norm) || null;
}

// GET /api/v1/roadmaps/[slug] - A topic with its lessons, in page order.
// Lesson Status is the Owner's personal progress (ADR-0010): only a caller with write access gets it.
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const ownerView = await hasWriteAccess(req);
    const found = await findTopic(slug);
    const roadmap = found
      ? await prisma.roadmap.findUnique({
          where: { id: found.id },
          include: { items: { orderBy: { order: 'asc' } } },
        })
      : null;

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    const items: ChecklistItem[] = roadmap.items.map((item) => ({
      id: item.id,
      slug: slugify(item.title),
      title: item.title,
      description: item.description || '',
      section: item.section,
      order: item.order,
      content: item.content || undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      ...(ownerView
        ? {
            status: isLessonStatus(item.status) ? item.status : DEFAULT_LESSON_STATUS,
            statusUpdatedAt: item.statusUpdatedAt ? item.statusUpdatedAt.toISOString() : null,
          }
        : {}),
    }));

    const body: GetRoadmapResponseDto = {
      roadmap: {
        id: roadmap.id,
        slug: roadmap.slug,
        title: roadmap.title,
        description: roadmap.description,
        icon: roadmap.icon,
        order: roadmap.order,
        isLocked: Boolean(roadmap.isLocked),
      },
      items,
      sections: sectionsInOrder(items),
    };

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[API /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch roadmap data' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/[slug] - Delete a topic and every lesson in it
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const roadmap = await findTopic(slug);
    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    await prisma.roadmap.delete({ where: { id: roadmap.id } });

    notifyRoadmapChanged();
    return NextResponse.json({ success: true, deletedSlug: roadmap.slug, deletedTitle: roadmap.title });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to delete roadmap' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/roadmaps/[slug] - Update the topic's title, description or lock
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const body = await req.json();
    const { title, description, isLocked } = body;

    const roadmap = await findTopic(slug);
    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    const updateData: { title?: string; description?: string; isLocked?: boolean } = {};
    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      updateData.title = title.trim();
    }
    if (description !== undefined) {
      updateData.description = description.trim();
    }
    if (isLocked !== undefined) {
      updateData.isLocked = Boolean(isLocked);
    }

    const updated = await prisma.roadmap.update({ where: { id: roadmap.id }, data: updateData });

    notifyRoadmapChanged();
    return NextResponse.json({ roadmap: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to update roadmap' },
      { status: 500 }
    );
  }
}
