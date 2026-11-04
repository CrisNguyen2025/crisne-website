import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from "@/lib/auth/write-access";
import { notifyRoadmapChanged } from '@/lib/roadmap/rag-reindex';
import { normalizeTitle } from '@/lib/roadmap/duplicates';
import { sectionSpelling } from '@/lib/roadmap/sections';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

// PATCH /api/v1/roadmaps/[slug]/sections - Rename a section: every lesson in it moves to the new name.
// Renaming onto a name the topic already uses merges the two sections.
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const { from, to } = await req.json();
    if (typeof from !== 'string' || !from.trim()) {
      return NextResponse.json({ error: 'from is required' }, { status: 400 });
    }
    if (typeof to !== 'string' || !to.trim()) {
      return NextResponse.json({ error: 'to is required' }, { status: 400 });
    }

    const roadmap = await prisma.roadmap.findUnique({ where: { slug }, include: { items: true } });
    if (!roadmap) return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });

    const fromKey = normalizeTitle(from);
    const others = roadmap.items.map((i) => i.section).filter((s): s is string => Boolean(s));
    const target = sectionSpelling(others, to);
    const moving = roadmap.items.filter((i) => i.section && normalizeTitle(i.section) === fromKey);
    if (moving.length === 0) {
      return NextResponse.json({ error: `No section "${from}" in this topic` }, { status: 404 });
    }

    await prisma.roadmapItem.updateMany({
      where: { id: { in: moving.map((i) => i.id) } },
      data: { section: target },
    });

    notifyRoadmapChanged();
    return NextResponse.json({ success: true, renamed: moving.length, section: target });
  } catch (error) {
    console.error('[API PATCH /api/v1/roadmaps/[slug]/sections] Error:', error);
    return NextResponse.json({ error: 'Failed to rename section' }, { status: 500 });
  }
}

// DELETE /api/v1/roadmaps/[slug]/sections?section=... - Dissolve a section: every lesson in it moves to the topic's general group.
export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { slug } = await context.params;
    const section = req.nextUrl.searchParams.get('section');
    if (typeof section !== 'string' || !section.trim()) {
      return NextResponse.json({ error: 'section is required' }, { status: 400 });
    }

    const roadmap = await prisma.roadmap.findUnique({ where: { slug }, include: { items: true } });
    if (!roadmap) return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });

    const moving = roadmap.items.filter((i) => i.section && normalizeTitle(i.section) === normalizeTitle(section));
    if (moving.length === 0) {
      return NextResponse.json({ error: `No section "${section}" in this topic` }, { status: 404 });
    }

    await prisma.roadmapItem.updateMany({
      where: { id: { in: moving.map((i) => i.id) } },
      data: { section: null },
    });

    notifyRoadmapChanged();
    return NextResponse.json({ success: true, dissolved: moving.length });
  } catch (error) {
    console.error('[API DELETE /api/v1/roadmaps/[slug]/sections] Error:', error);
    return NextResponse.json({ error: 'Failed to dissolve section' }, { status: 500 });
  }
}
