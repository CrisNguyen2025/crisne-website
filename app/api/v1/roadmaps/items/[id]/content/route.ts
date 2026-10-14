import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/v1/roadmaps/items/[id]/content - Update Notion-like Lexical content
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const { content } = body;

    const updated = await prisma.roadmapItem.update({
      where: { id },
      data: {
        content: content ?? null,
      },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/items/[id]/content] Error:', error);
    return NextResponse.json({ error: 'Failed to update item content' }, { status: 500 });
  }
}
