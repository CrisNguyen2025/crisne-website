import { NextResponse } from 'next/server';
import { KnowledgeRegistry } from '@/lib/knowledge/registry';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const entity = KnowledgeRegistry.getEntityByIdOrSlug(slug);

  if (!entity || entity.type !== 'agent') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Agent '${slug}' not found`
        }
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: entity
  });
}
