import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
        _count: {
          select: { layers: true },
        },
      },
    });

    return NextResponse.json(
      { roadmaps },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
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
  try {
    const body = await req.json();
    const { title, shortCode, description, layers } = body;

    if (!title || !shortCode) {
      return NextResponse.json(
        { error: 'Name and Short-name are required.' },
        { status: 400 }
      );
    }

    if (!layers || !Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: 'At least one layer menu item is required.' },
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

    // Ensure unique slug
    let slug = baseSlug;
    const existing = await prisma.roadmap.findUnique({ where: { slug } });
    if (existing) {
      slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    const count = await prisma.roadmap.count();

    const createdRoadmap = await prisma.roadmap.create({
      data: {
        slug,
        title: title.trim(),
        shortCode: shortCode.trim().toUpperCase(),
        description: description?.trim() || null,
        order: count + 1,
        layers: {
          create: layers.map((layer: any, idx: number) => ({
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

    return NextResponse.json({ roadmap: createdRoadmap }, { status: 201 });
  } catch (error: any) {
    console.error('[API POST /api/v1/roadmaps] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create topic / roadmap' },
      { status: 500 }
    );
  }
}


