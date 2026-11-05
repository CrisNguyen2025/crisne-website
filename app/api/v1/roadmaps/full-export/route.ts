import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/v1/roadmaps/full-export
 *
 * Every topic with its lessons in page order (including Lexical HTML rich-text content). Each lesson names its
 * section, or null. Used by the Roadmap Assistant's ingestion worker to synchronize live knowledge over HTTP.
 */
export async function GET(_req: NextRequest) {
  try {
    // Public, and the Roadmap Assistant indexes it for every reader: lesson fields are listed, so Lesson Status
    // (ADR-0010) and any later private field never go out
    const roadmaps = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            roadmapId: true,
            section: true,
            title: true,
            description: true,
            content: true,
            order: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      { total_roadmaps: roadmaps.length, roadmaps },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[API full-export] Error:', error);
    return NextResponse.json({ error: 'Failed to export roadmaps' }, { status: 500 });
  }
}
