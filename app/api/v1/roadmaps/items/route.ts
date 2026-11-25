import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { createLesson } from '@/lib/roadmap/create-lesson';
import { duplicateResponse } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { CreateLessonSchema, parseJsonBody } from '@/lib/roadmap/schemas';

// POST /api/v1/roadmaps/items - Add a lesson to a topic, optionally into a section
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const parsed = await parseJsonBody(req, CreateLessonSchema);
    if (!parsed.ok) return parsed.response;
    const { roadmapSlug, section, title, description, content, status } = parsed.data;

    const result = await createLesson(prisma, { roadmapSlug, section, title, description, content, status });
    if (result.kind === 'roadmap_not_found') {
      return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }
    if (result.kind === 'duplicate') {
      return duplicateResponse('item', result.existing);
    }
    const { item: newItem, roadmapSlug: createdRoadmapSlug } = result;

    notifyRoadmapChanged();
    return NextResponse.json({
      item: {
        id: newItem.id,
        slug: newItem.slug,
        title: newItem.title,
        description: newItem.description,
        section: newItem.section,
        order: newItem.order,
        roadmapSlug: createdRoadmapSlug,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps/items] Error:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
