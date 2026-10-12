import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/v1/roadmaps/full-export
 *
 * Exports the complete hierarchical tree of all Roadmaps, Layers, Groups, and Items
 * (including Lexical HTML rich-text content).
 * Used by the RAG Assistant Ingestion Worker to synchronize live knowledge over HTTP.
 */
export async function GET(_req: NextRequest) {
  try {
    const roadmaps = await prisma.roadmap.findMany({
      orderBy: { order: 'asc' },
      include: {
        layers: {
          orderBy: { order: 'asc' },
          include: {
            groups: {
              orderBy: { order: 'asc' },
              include: {
                items: {
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        total_roadmaps: roadmaps.length,
        roadmaps,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[API /api/v1/roadmaps/full-export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export roadmap knowledge tree' },
      { status: 500 }
    );
  }
}
