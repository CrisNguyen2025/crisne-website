import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { duplicateResponse, findDuplicate, normalizeTitle } from '@/lib/roadmap/duplicates';
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/v1/roadmaps - Get all roadmaps summary
export async function GET() {
  try {
    const roadmaps = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        shortCode: true,
        description: true,
        icon: true,
        order: true,
        isLocked: true,
        _count: {
          select: { layers: true },
        },
      },
    });

    return NextResponse.json(
      { roadmaps },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[API /api/v1/roadmaps] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch roadmaps' }, { status: 500 });
  }
}

// POST /api/v1/roadmaps - Create new Topic / Roadmap with initial layers
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { title, shortCode, description, layers } = body;

    if (!title || !shortCode) {
      return NextResponse.json(
        { error: 'Name and Short-name are required.' },
        { status: 400 }
      );
    }

    // Layers are optional: the Roadmap Assistant and WebMCP create a topic first and add layers later.
    // The create form asks for at least one on its own.
    const layerList: unknown[] = layers ?? [];
    const validLayer = (layer: unknown) =>
      typeof (layer as { title?: unknown })?.title === 'string' &&
      typeof (layer as { shortTag?: unknown })?.shortTag === 'string' &&
      (layer as { title: string }).title.trim() !== '';
    if (!Array.isArray(layerList) || !layerList.every(validLayer)) {
      return NextResponse.json(
        { error: 'Each layer needs a title and a shortTag.' },
        { status: 400 }
      );
    }

    // Generate slug from title
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `topic-${Date.now()}`;

    // Same title (or a title that slugifies the same) means the topic already exists:
    // return it instead of minting a "-1234" copy.
    const topics = await prisma.roadmap.findMany({ select: { id: true, slug: true, title: true } });
    const duplicate = findDuplicate(topics, title) ?? topics.find((t) => t.slug === baseSlug);
    if (duplicate) return duplicateResponse('topic', duplicate);
    const slug = baseSlug;

    // Repeated layer titles in the same request collapse to one
    const seenLayers = new Set<string>();
    const uniqueLayers = (layerList as { title: string; shortTag: string; subtitle?: string }[]).filter((layer) => {
      const key = normalizeTitle(layer.title);
      if (seenLayers.has(key)) return false;
      seenLayers.add(key);
      return true;
    });

    const count = topics.length;

    const createdRoadmap = await prisma.roadmap.create({
      data: {
        slug,
        title: title.trim(),
        shortCode: shortCode.trim().toUpperCase(),
        description: description?.trim() || null,
        order: count + 1,
        layers: {
          create: uniqueLayers.map((layer, idx) => ({
            order: idx + 1,
            title: layer.title.trim(),
            shortTag: layer.shortTag.trim().toUpperCase(),
            subtitle: layer.subtitle?.trim() || '',
          })),
        },
      },
      include: {
        layers: {
          include: {
            groups: true,
          },
        },
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


