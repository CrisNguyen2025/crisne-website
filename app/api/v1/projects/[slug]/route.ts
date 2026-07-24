import { NextResponse } from 'next/server';
import { KnowledgeRegistry } from '@/lib/knowledge/registry';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const entity = KnowledgeRegistry.getEntityByIdOrSlug(slug);

  if (!entity || entity.type !== 'project') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Project '${slug}' not found`
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
