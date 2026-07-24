import { NextResponse } from 'next/server';
import { createPost } from '@/lib/notion';
import { KnowledgeEntity } from '@/types/knowledge';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        name: 'crisne.blog Web Clipper API',
        status: 'active',
        version: '1.0.0',
        payloadSchema: {
          title: 'string (required)',
          url: 'string (required)',
          content: 'string (optional)',
          summary: 'string (optional)',
          category: 'string (optional)',
          tags: 'string[] (optional)',
          difficulty: 'beginner | intermediate | advanced (optional)'
        }
      }
    },
    { headers: corsHeaders }
  );
}

export async function POST(request: Request) {
  try {
    const adminKey = process.env.ADMIN_API_KEY;
    const reqKey = request.headers.get('x-admin-key');

    if (adminKey && reqKey !== adminKey) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Admin API Key' } },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { title, url, content, summary, category, tags, difficulty } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TITLE', message: 'Title is required' } },
        { status: 400, headers: corsHeaders }
      );
    }

    const rawSlug = (title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const slug = rawSlug || `clip-${Date.now()}`;
    const formattedContent = `${content || ''}\n\n<p><strong>Source URL:</strong> <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;

    // Save to Notion DB if credentials exist
    let notionPost = null;
    try {
      if (process.env.NOTION_TOKEN && process.env.NOTION_POSTS_DB_ID) {
        notionPost = await createPost({
          title: title.trim(),
          slug,
          content: formattedContent,
          published: true
        });
      }
    } catch (notionError) {
      console.warn('[Clipper API] Notion sync warning:', notionError);
    }

    // Create Knowledge Entity format for Knowledge OS
    const entity: KnowledgeEntity = {
      id: notionPost?.id || `clip-${Date.now()}`,
      slug,
      type: 'note',
      title: title.trim(),
      description: summary || `Clipped from ${url}`,
      summary: summary || title.trim(),
      category: category || 'Web Clipper',
      tags: Array.isArray(tags) && tags.length ? tags : ['clipper', 'web-note'],
      difficulty: difficulty || 'beginner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      readingTimeMin: Math.max(1, Math.ceil((content || '').length / 1000)),
      officialDocs: [url],
      githubLinks: url.includes('github.com') ? [url] : []
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          entity,
          notionSynced: !!notionPost,
          message: 'Content clipped successfully to Knowledge OS'
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[POST /api/v1/clipper]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to clip content'
        }
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
