import { NextResponse } from 'next/server';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { getRoadmapIndexVersion } from '@/lib/roadmap/index-version';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/v1/roadmaps/index-version
 *
 * `{ version }` of the data behind full-export. The Roadmap Assistant compares it with the version it last
 * indexed and re-reads full-export only when it changed. Owner or admin key only, like full-export.
 */
export async function GET(req: Request) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const version = await getRoadmapIndexVersion();
    return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[API index-version] Error:', error);
    return NextResponse.json({ error: 'Failed to read index version' }, { status: 500 });
  }
}
