import { NextResponse } from 'next/server';
import { KnowledgeRegistry } from '@/lib/knowledge/registry';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || undefined;
  const category = searchParams.get('category') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const { items, total } = KnowledgeRegistry.getAllEntities({
    type: 'topic',
    query,
    category,
    tag,
    limit,
    offset
  });

  return NextResponse.json({
    success: true,
    data: items,
    meta: {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      timestamp: new Date().toISOString()
    }
  });
}
