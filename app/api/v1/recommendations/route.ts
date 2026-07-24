import { NextResponse } from 'next/server';
import { KnowledgeRegistry } from '@/lib/knowledge/registry';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('target');
    const type = searchParams.get('type') || 'learning-path';

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_TARGET',
            message: 'Query parameter "target" is required.'
          }
        },
        { status: 400 }
      );
    }

    if (type === 'mcp') {
      const mcps = KnowledgeRegistry.recommendMcps(target);
      return NextResponse.json({
        success: true,
        data: {
          target,
          type: 'mcp',
          recommendations: mcps
        },
        meta: {
          total: mcps.length,
          timestamp: new Date().toISOString()
        }
      });
    }

    const learningPath = KnowledgeRegistry.recommendLearningPath(target);

    return NextResponse.json({
      success: true,
      data: {
        target,
        type: 'learning-path',
        recommendations: learningPath
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RECOMMENDATION_ERROR',
          message: error?.message || 'Failed to generate recommendations'
        }
      },
      { status: 500 }
    );
  }
}
