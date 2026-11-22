import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate, normalizeTitle } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { LESSON_STATUSES, isLessonStatus, type LessonStatus } from '@/lib/roadmap/status';
import { findTopic } from '@/lib/roadmap/resolveRoadmap';
import { slugify } from '@/lib/utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/items/[id] - Update title, description, section, topic, slug and Lesson Status
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { title, description, section, status, slug, roadmapSlug, markReviewed } = body;

    if (status !== undefined && !isLessonStatus(status)) {
      return NextResponse.json({ error: `status must be one of ${LESSON_STATUSES.join(', ')}` }, { status: 400 });
    }

    const current = await prisma.roadmapItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const data: {
      roadmapId?: string;
      order?: number;
      slug?: string;
      title?: string;
      description?: string;
      section?: string | null;
      status?: LessonStatus;
      statusUpdatedAt?: Date;
    } = {};

    let targetRoadmapId = current.roadmapId;
    if (typeof roadmapSlug === 'string' && roadmapSlug.trim()) {
      const targetRoadmap = await findTopic(roadmapSlug.trim());
      if (!targetRoadmap) {
        return NextResponse.json({ error: 'Target topic not found' }, { status: 404 });
      }
      targetRoadmapId = targetRoadmap.id;
    }

    const movingTopic = targetRoadmapId !== current.roadmapId;
    const nextTitle = title !== undefined && typeof title === 'string' && title.trim() ? title.trim() : current.title;

    if (movingTopic || (title !== undefined && typeof title === 'string' && title.trim() && normalizeTitle(title) !== normalizeTitle(current.title))) {
      const siblings = await prisma.roadmapItem.findMany({
        where: { roadmapId: targetRoadmapId, NOT: { id } },
        select: { id: true, title: true, order: true, section: true },
      });
      const duplicate = findDuplicate(siblings, nextTitle);
      if (duplicate) {
        return duplicateResponse('item', { id: duplicate.id, title: duplicate.title });
      }
      if (movingTopic) {
        data.roadmapId = targetRoadmapId;
        data.order = siblings.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
        const targetSectionInput = section !== undefined ? section : current.section;
        data.section = sectionSpelling(siblings.map((s) => s.section), targetSectionInput);
      }
    }

    if (title !== undefined && typeof title === 'string' && title.trim() && title.trim() !== current.title) {
      data.title = title.trim();
    }

    if (description !== undefined) data.description = description;
    if (section !== undefined && !movingTopic) {
      const others = await prisma.roadmapItem.findMany({
        where: { roadmapId: targetRoadmapId, NOT: { id } },
        select: { section: true },
      });
      data.section = sectionSpelling(others.map((o) => o.section), section);
    }

    let previousSlugToRedirect: string | null = null;
    if (slug !== undefined) {
      const nextSlug = typeof slug === 'string' ? slugify(slug) : '';
      if (!nextSlug) {
        return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
      }
      if (nextSlug !== current.slug) {
        const collision = await prisma.roadmapItem.findUnique?.({ where: { slug: nextSlug } });
        if (collision && collision.id !== id) {
          return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
        }
        data.slug = nextSlug;
        if (current.slug) {
          previousSlugToRedirect = current.slug;
        }
      }
    }

    // Lesson Status (ADR-0010): the time it changes is kept, so a same-status write keeps the old time
    // unless `markReviewed: true` explicitly records a completed review pass on a `known` lesson.
    if (status !== undefined && status !== current.status) {
      data.status = status;
      data.statusUpdatedAt = new Date();
    } else if (markReviewed === true) {
      data.statusUpdatedAt = new Date();
    }

    type WriteTx = Pick<typeof prisma, 'roadmapItem' | 'slugRedirect'>;
    const applyUpdate = async (tx: WriteTx) => {
      const item = await tx.roadmapItem.update({ where: { id }, data });
      if (previousSlugToRedirect && data.slug) {
        await tx.slugRedirect?.upsert?.({
          where: { fromSlug: previousSlugToRedirect },
          update: { targetId: id, entity: 'lesson' },
          create: { fromSlug: previousSlugToRedirect, entity: 'lesson', targetId: id },
        });
        await tx.slugRedirect?.deleteMany?.({
          where: { fromSlug: data.slug },
        });
      }
      return item;
    };

    const updated =
      previousSlugToRedirect && data.slug && typeof prisma.$transaction === 'function'
        ? await prisma.$transaction((tx) => applyUpdate(tx))
        : await applyUpdate(prisma);

    const hasIndexedChanges =
      data.title !== undefined ||
      data.description !== undefined ||
      data.section !== undefined ||
      data.roadmapId !== undefined ||
      data.slug !== undefined;

    if (hasIndexedChanges) {
      notifyRoadmapChanged();
    } else if (data.status !== undefined || data.statusUpdatedAt !== undefined) {
      try {
        revalidatePath('/', 'layout');
      } catch {
        // Outside Next.js request scope
      }
    }
    return NextResponse.json({ item: updated });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2002') {
      return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    }
    console.error('[API PATCH /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/items/[id] - Delete a lesson
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(_req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    type DeleteTx = Pick<typeof prisma, 'roadmapItem' | 'slugRedirect'>;
    const applyDelete = async (tx: DeleteTx) => {
      await tx.roadmapItem.delete({ where: { id } });
      await tx.slugRedirect?.deleteMany?.({
        where: { entity: 'lesson', targetId: id },
      });
    };

    if (typeof prisma.$transaction === 'function') {
      await prisma.$transaction((tx) => applyDelete(tx));
    } else {
      await applyDelete(prisma);
    }

    notifyRoadmapChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/items/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
