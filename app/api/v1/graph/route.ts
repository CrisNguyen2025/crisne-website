import { NextResponse } from 'next/server';
import { KnowledgeGraphEngine } from '@/lib/knowledge/graph';

export async function GET() {
  try {
    const graphData = KnowledgeGraphEngine.buildGraph();

    return NextResponse.json({
      success: true,
      data: graphData,
      meta: {
        totalNodes: graphData.nodes.length,
        totalEdges: graphData.edges.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'GRAPH_BUILD_ERROR',
          message: error?.message || 'Failed to build knowledge graph'
        }
      },
      { status: 500 }
    );
  }
}
