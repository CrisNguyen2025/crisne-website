import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { DEFAULT_LESSON_STATUS, LESSON_STATUSES, isLessonStatus } from '@/lib/roadmap/status';

// POST /api/v1/roadmaps/items - Add a lesson to a topic, optionally into a section
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { roadmapSlug, section, title, description, content, status } = body;

    if (!roadmapSlug || !title) {
      return NextResponse.json({ error: 'roadmapSlug and title are required' }, { status: 400 });
    }
    if (status !== undefined && !isLessonStatus(status)) {
      return NextResponse.json({ error: `status must be one of ${LESSON_STATUSES.join(', ')}` }, { status: 400 });
    }

    const roadmap = await prisma.roadmap.findUnique({
      where: { slug: roadmapSlug },
      include: { items: { select: { id: true, title: true, section: true, order: true } } },
    });
    if (!roadmap) return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });

    // A lesson title appears once per topic, whatever its section
    const duplicate = findDuplicate(roadmap.items, title);
    if (duplicate) {
      return duplicateResponse('item', { id: duplicate.id, title: duplicate.title, roadmapSlug: roadmap.slug });
    }

    const sectionName = sectionSpelling(roadmap.items.map((i) => i.section), section);
    const order = roadmap.items.reduce((max, i) => Math.max(max, i.order), 0) + 1;

    const newItem = await prisma.roadmapItem.create({
      data: {
        roadmapId: roadmap.id,
        section: sectionName,
        title: title.trim(),
        description: description || '',
        content: content || null,
        order,
        // A lesson added without a status is known (ADR-0010)
        status: status ?? DEFAULT_LESSON_STATUS,
      },
    });

    notifyRoadmapChanged();
    return NextResponse.json({
      item: {
        id: newItem.id,
        title: newItem.title,
        description: newItem.description,
        section: newItem.section,
        order: newItem.order,
        roadmapSlug: roadmap.slug,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/items] Error:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
