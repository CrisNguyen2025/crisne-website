import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/v1/roadmaps - Get all topics with their lesson counts
export async function GET() {
  try {
    const roadmaps = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        icon: true,
        order: true,
        isLocked: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(
      { roadmaps },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[API /api/v1/roadmaps] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch roadmaps' }, { status: 500 });
  }
}

// POST /api/v1/roadmaps - Create a topic. Lessons are added afterwards, with or without a section.
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { title, description } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }

    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `topic-${Date.now()}`;

    // Same title (or a title that slugifies the same) means the topic already exists: return it
    const topics = await prisma.roadmap.findMany({ select: { id: true, slug: true, title: true } });
    const duplicate = findDuplicate(topics, title) ?? topics.find((t) => t.slug === baseSlug);
    if (duplicate) return duplicateResponse('topic', duplicate);

    const createdRoadmap = await prisma.roadmap.create({
      data: {
        slug: baseSlug,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        order: topics.length + 1,
      },
    });

    notifyRoadmapChanged();
    return NextResponse.json({ roadmap: createdRoadmap }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/roadmaps] Error:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to create topic / roadmap' },
      { status: 500 }
    );
  }
}
