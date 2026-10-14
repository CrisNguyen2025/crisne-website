import { NextRequest, NextResponse } from 'next/server';
import { findUnusedStorageFiles, cleanupUnusedStorageFiles } from '@/lib/r2-client';
import { requireWriteAccess } from "@/lib/auth/write-access";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/storage/cleanup
 * Scans and returns used vs unused files in storage
 */
export async function GET() {
  try {
    const scan = await findUnusedStorageFiles();
    return NextResponse.json(scan);
  } catch (error) {
    console.error('❌ Failed to scan unused storage files:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to scan unused files' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/storage/cleanup
 * Permanently deletes unused files
 * Body (optional): { filenames?: string[] }
 */
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    let body: { filenames?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // No body passed -> clean all unused files
    }

    const result = await cleanupUnusedStorageFiles(body.filenames);
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Failed to clean up unused storage files:', error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : undefined) || 'Failed to clean up unused files' },
      { status: 500 }
    );
  }
}
