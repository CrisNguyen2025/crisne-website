import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { containsSecret, maskPII } from '@/lib/ai/pii-mask';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const WINDOW_DAYS = 30;

function safeMaskText(text: string | null | undefined, maxLen = 140): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || containsSecret(cleaned)) return '';
  return maskPII(cleaned).slice(0, maxLen).trim();
}

function parseTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((tag) => tag.trim().slice(0, 40));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

    const [roadmaps, recentLessons, newsItems, provenances, threads, activityEvents, memories] =
      await Promise.all([
        prisma.roadmap.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 15,
          select: { slug: true, title: true, updatedAt: true, _count: { select: { items: true } } },
        }),
        prisma.roadmapItem.findMany({
          where: { updatedAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: 30,
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            roadmap: { select: { slug: true, title: true } },
          },
        }),
        prisma.newsItem.findMany({
          where: { OR: [{ isSaved: true }, { readState: 'read' }], updatedAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: 25,
          select: { title: true, tags: true, isSaved: true, updatedAt: true },
        }),
        prisma.knowledgeProvenance.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            sourceName: true,
            lesson: { select: { title: true, roadmap: { select: { slug: true } } } },
          },
        }),
        prisma.threadState.findMany({
          where: { updatedAt: { gte: since } },
          orderBy: { updatedAt: 'desc' },
          take: 15,
          select: { activeTopicSlug: true, activeLessonTitle: true, updatedAt: true },
        }),
        prisma.ownerActivityEvent.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { eventType: true, topicSlug: true, summary: true, createdAt: true },
        }),
        prisma.ownerMemory.findMany({
          where: { status: { in: ['active', 'pending', 'archived'] } },
          orderBy: { updatedAt: 'desc' },
          take: 80,
          select: {
            id: true,
            kind: true,
            content: true,
            scopeTopicSlug: true,
            source: true,
            status: true,
            useCount: true,
            validTo: true,
            updatedAt: true,
          },
        }),
      ]);

    const newsTagCounts = new Map<string, number>();
    for (const item of newsItems) {
      for (const rawTag of parseTagsJson(item.tags)) {
        const tag = safeMaskText(rawTag, 40);
        if (!tag) continue;
        newsTagCounts.set(tag, (newsTagCounts.get(tag) ?? 0) + 1);
      }
    }

    const snapshot = {
      windowDays: WINDOW_DAYS,
      topics: roadmaps.map((r) => ({
        slug: r.slug,
        title: safeMaskText(r.title, 100),
        itemCount: r._count.items,
        updatedAt: r.updatedAt.toISOString(),
      })),
      recentLessons: recentLessons.map((it) => ({
        id: it.id,
        title: safeMaskText(it.title, 120),
        status: it.status,
        topicSlug: it.roadmap.slug,
        updatedAt: it.updatedAt.toISOString(),
      })),
      newsSignals: {
        readOrSavedCount: newsItems.length,
        topTags: Array.from(newsTagCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 12)
          .map(([tag, count]) => ({ tag, count })),
      },
      provenanceSignals: provenances.map((p) => ({
        sourceName: safeMaskText(p.sourceName, 60),
        topicSlug: p.lesson.roadmap.slug,
        lessonTitle: safeMaskText(p.lesson.title, 100),
      })),
      recentThreads: threads
        .filter((t) => Boolean(t.activeTopicSlug || t.activeLessonTitle))
        .map((t) => ({
          topicSlug: t.activeTopicSlug,
          lessonTitle: safeMaskText(t.activeLessonTitle, 100) || null,
          updatedAt: t.updatedAt.toISOString(),
        })),
      activityEvents: activityEvents.map((ev) => ({
        eventType: ev.eventType,
        topicSlug: ev.topicSlug,
        summary: safeMaskText(ev.summary, 200),
        createdAt: ev.createdAt.toISOString(),
      })),
      existingMemories: memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        scopeTopicSlug: m.scopeTopicSlug,
        source: m.source,
        status: m.status,
        useCount: m.useCount,
        validTo: m.validTo?.toISOString() ?? null,
      })),
    };

    const sourceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex');

    return NextResponse.json(
      { snapshot, sourceHash, generatedAt: new Date().toISOString() },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('[API GET /api/v1/memories/activity-snapshot] Error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate activity snapshot' },
      { status: 500, headers: NO_STORE },
    );
  }
}
