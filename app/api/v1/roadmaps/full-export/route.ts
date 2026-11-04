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
    const found = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    // Public, and the Roadmap Assistant indexes it for every reader: Lesson Status never goes out (ADR-0010)
    const roadmaps = found.map((roadmap) => ({
      ...roadmap,
      items: roadmap.items.map(({ status: _status, statusUpdatedAt: _statusUpdatedAt, ...item }) => item),
    }));

    return NextResponse.json(
      { total_roadmaps: roadmaps.length, roadmaps },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[API full-export] Error:', error);
    return NextResponse.json({ error: 'Failed to export roadmaps' }, { status: 500 });
  }
}
