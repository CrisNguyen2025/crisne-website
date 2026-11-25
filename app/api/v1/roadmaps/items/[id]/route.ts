import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate, normalizeTitle } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { type LessonStatus } from '@/lib/roadmap/status';
import { UpdateLessonSchema, parseJsonBody } from '@/lib/roadmap/schemas';
import { findTopic } from '@/lib/roadmap/resolveRoadmap';
import { slugify } from '@/lib/utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type LessonUpdateData = {
  roadmapId?: string;
  order?: number;
  slug?: string;
  title?: string;
  description?: string;
  section?: string | null;
  status?: LessonStatus;
  statusUpdatedAt?: Date;
};

interface CurrentLessonSnapshot {
  id: string;
  roadmapId: string;
  title: string;
  section: string | null;
  slug: string | null;
  status: string;
}

async function resolveTargetRoadmapId(currentRoadmapId: string, roadmapSlug: unknown): Promise<string | NextResponse> {
  if (typeof roadmapSlug !== 'string' || !roadmapSlug.trim()) return currentRoadmapId;
  const targetRoadmap = await findTopic(roadmapSlug.trim());
  if (!targetRoadmap) {
    return NextResponse.json({ error: 'Target topic not found' }, { status: 404 });
  }
  return targetRoadmap.id;
}

async function resolveTitleSectionUpdates(
  current: CurrentLessonSnapshot,
  targetRoadmapId: string,
  title: unknown,
  section: string | null | undefined,
  data: LessonUpdateData
): Promise<NextResponse | null> {
  const trimmedTitle = typeof title === 'string' && title.trim() ? title.trim() : undefined;
  const movingTopic = targetRoadmapId !== current.roadmapId;
  const titleChangedNormalized = Boolean(trimmedTitle && normalizeTitle(trimmedTitle) !== normalizeTitle(current.title));

  if (movingTopic || titleChangedNormalized) {
    const siblings = await prisma.roadmapItem.findMany({
      where: { roadmapId: targetRoadmapId, NOT: { id: current.id } },
      select: { id: true, title: true, order: true, section: true },
    });
    const duplicate = findDuplicate(siblings, trimmedTitle ?? current.title);
    if (duplicate) {
      return duplicateResponse('item', { id: duplicate.id, title: duplicate.title });
    }
    if (movingTopic) {
      data.roadmapId = targetRoadmapId;
      data.order = siblings.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
      const targetSectionInput = section !== undefined ? section : current.section;
      data.section = sectionSpelling(siblings.map((s) => s.section), targetSectionInput);
    }
  } else if (section !== undefined) {
    const others = await prisma.roadmapItem.findMany({
      where: { roadmapId: targetRoadmapId, NOT: { id: current.id } },
      select: { section: true },
    });
    data.section = sectionSpelling(others.map((o) => o.section), section);
  }

  if (trimmedTitle && trimmedTitle !== current.title) {
    data.title = trimmedTitle;
  }
  return null;
}

async function resolveSlugUpdate(
  current: CurrentLessonSnapshot,
  slug: unknown,
  data: LessonUpdateData
): Promise<{ previousSlugToRedirect: string | null } | NextResponse> {
  if (slug === undefined) return { previousSlugToRedirect: null };
  const nextSlug = typeof slug === 'string' ? slugify(slug) : '';
  if (!nextSlug) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  if (nextSlug === current.slug) return { previousSlugToRedirect: null };

  const collision = await prisma.roadmapItem.findUnique?.({ where: { slug: nextSlug } });
  if (collision && collision.id !== current.id) {
    return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  }
  data.slug = nextSlug;
  return { previousSlugToRedirect: current.slug ?? null };
}

function hasIndexedLessonChanges(data: LessonUpdateData): boolean {
  return (
    data.title !== undefined ||
    data.description !== undefined ||
    data.section !== undefined ||
    data.roadmapId !== undefined ||
    data.slug !== undefined
  );
}

function safeRevalidateLayout(): void {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // Outside Next.js request scope
  }
}

type LessonWriteTx = Pick<typeof prisma, 'roadmapItem' | 'slugRedirect'>;

async function persistLessonUpdate(
  id: string,
  data: LessonUpdateData,
  previousSlugToRedirect: string | null
) {
  const applyUpdate = async (tx: LessonWriteTx) => {
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

  if (previousSlugToRedirect && data.slug && typeof prisma.$transaction === 'function') {
    return prisma.$transaction((tx) => applyUpdate(tx));
  }
  return applyUpdate(prisma);
}

// PATCH /api/v1/roadmaps/items/[id] - Update title, description, section, topic, slug and Lesson Status
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(req, UpdateLessonSchema);
    if (!parsed.ok) return parsed.response;
    const { title, description, section, status, slug, roadmapSlug, markReviewed } = parsed.data;

    const current = await prisma.roadmapItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const data: LessonUpdateData = {};
    if (description !== undefined) data.description = description;

    const targetRoadmapId = await resolveTargetRoadmapId(current.roadmapId, roadmapSlug);
    if (targetRoadmapId instanceof NextResponse) return targetRoadmapId;

    const conflict = await resolveTitleSectionUpdates(current, targetRoadmapId, title, section, data);
    if (conflict) return conflict;

    const slugResult = await resolveSlugUpdate(current, slug, data);
    if (slugResult instanceof NextResponse) return slugResult;

    // Lesson Status (ADR-0010): the time it changes is kept, so a same-status write keeps the old time
    // unless `markReviewed: true` explicitly records a completed review pass on a `known` lesson.
    if (status !== undefined && status !== current.status) {
      data.status = status;
      data.statusUpdatedAt = new Date();
    } else if (markReviewed === true) {
      data.statusUpdatedAt = new Date();
    }

    const updated = await persistLessonUpdate(id, data, slugResult.previousSlugToRedirect);

    if (hasIndexedLessonChanges(data)) {
      notifyRoadmapChanged();
    } else if (data.status !== undefined || data.statusUpdatedAt !== undefined) {
      safeRevalidateLayout();
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
