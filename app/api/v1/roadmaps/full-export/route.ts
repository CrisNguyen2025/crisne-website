import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { lessonChunks } from '@/lib/roadmap/content-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/v1/roadmaps/full-export
 *
 * Every topic with its lessons in page order (including Lexical HTML rich-text content). Each lesson names its
 * section, or null, and carries its content as `chunks` (one per h2/h3 section, with the heading anchor), so the
 * Roadmap Assistant indexes and links every part of a lesson, not only its opening. Used by the Roadmap
 * Assistant's ingestion worker to synchronize live knowledge over HTTP.
 *
 * Owner or admin key only (ADR-0018): the middleware lets any request carrying a key header through without
 * checking its value.
 */
export async function GET(req: Request) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    // The Roadmap Assistant indexes it for every reader: lesson fields are listed, so Lesson Status
    // (ADR-0010) and any later private field never go out
    const roadmaps = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            roadmapId: true,
            slug: true,
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

    const withChunks = roadmaps.map((roadmap) => ({
      ...roadmap,
      items: roadmap.items.map((item) => ({ ...item, chunks: lessonChunks(item.content) })),
    }));

    return NextResponse.json(
      { total_roadmaps: withChunks.length, roadmaps: withChunks },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[API full-export] Error:', error);
    return NextResponse.json({ error: 'Failed to export roadmaps' }, { status: 500 });
  }
}
