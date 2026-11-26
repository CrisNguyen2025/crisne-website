import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ChecklistItem, GetRoadmapResponseDto } from '@/lib/roadmap/types';
import { findTopic } from '@/lib/roadmap/resolveRoadmap';
import { hasWriteAccess, requireWriteAccess } from "@/lib/auth/write-access";
import { DEFAULT_LESSON_STATUS, isLessonStatus } from '@/lib/roadmap/status';
import { notifyOwnerMemoryChanged, notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionsInOrder } from '@/lib/roadmap/sections';
import { readingMinutes } from '@/lib/roadmap/content-utils';
import { UpdateRoadmapSchema, parseJsonBody } from '@/lib/roadmap/schemas';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/v1/roadmaps/[slug] - A topic with its lessons, in page order.
// Lesson Status is the Owner's personal progress (ADR-0010): only a caller with write access gets it.
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const isOutline = req.nextUrl.searchParams.get('mode') === 'outline';
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
      slug: item.slug || item.id,
      title: item.title,
      description: item.description || '',
      section: item.section,
      order: item.order,
      ...(isOutline ? {} : { content: item.content || undefined }),
      readingMinutes: readingMinutes(item.content),
      hasContent: Boolean(item.content?.trim()),
      roadmapSlug: roadmap.slug,
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

    let hasDeletedMemories = false;
    type DeleteTopicTx = Pick<typeof prisma, 'roadmap' | 'roadmapItem' | 'slugRedirect' | 'ownerMemory'>;
    const applyDelete = async (tx: DeleteTopicTx) => {
      const childItems =
        (await tx.roadmapItem?.findMany?.({
          where: { roadmapId: roadmap.id },
          select: { id: true },
        })) ?? [];
      const lessonIds = childItems.map((it) => it.id);

      await tx.roadmap.delete({ where: { id: roadmap.id } });

      const redirectWhere =
        lessonIds.length > 0
          ? {
              OR: [
                { entity: 'topic', targetId: roadmap.id },
                { entity: 'lesson', targetId: { in: lessonIds } },
              ],
            }
          : { entity: 'topic', targetId: roadmap.id };
      await tx.slugRedirect?.deleteMany?.({ where: redirectWhere });
      const deletedMem = await tx.ownerMemory?.deleteMany?.({ where: { scopeTopicSlug: roadmap.slug } });
      hasDeletedMemories = Boolean(deletedMem?.count);
    };

    if (typeof prisma.$transaction === 'function') {
      await prisma.$transaction((tx) => applyDelete(tx));
    } else {
      await applyDelete(prisma);
    }

    notifyRoadmapChanged();
    if (hasDeletedMemories) {
      notifyOwnerMemoryChanged();
    }
    return NextResponse.json({ success: true, deletedSlug: roadmap.slug, deletedTitle: roadmap.title });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete roadmap' },
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
    const parsed = await parseJsonBody(req, UpdateRoadmapSchema);
    if (!parsed.ok) return parsed.response;
    const { title, description, isLocked } = parsed.data;

    const roadmap = await findTopic(slug);
    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    const updateData: { title?: string; description?: string; isLocked?: boolean } = {};
    if (title !== undefined) {
      updateData.title = title;
    }
    if (description !== undefined) {
      updateData.description = description.trim();
    }
    if (isLocked !== undefined) {
      updateData.isLocked = isLocked;
    }

    const updated = await prisma.roadmap.update({ where: { id: roadmap.id }, data: updateData });

    notifyRoadmapChanged();
    return NextResponse.json({ roadmap: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/[slug]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update roadmap' },
      { status: 500 }
    );
  }
}
