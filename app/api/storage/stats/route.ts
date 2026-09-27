import { NextResponse } from 'next/server';
import { getStorageStats } from '@/lib/r2-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/storage/stats
 * Returns storage usage and limits
 */
export async function GET() {
  try {
    const stats = await getStorageStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('❌ Failed to fetch storage stats:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch storage stats' },
      { status: 500 }
    );
  }
}
