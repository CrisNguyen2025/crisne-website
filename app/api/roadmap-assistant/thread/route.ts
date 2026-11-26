import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hasWriteAccess, requireWriteAccess } from '@/lib/auth/write-access';
import {
  MAX_THREAD_MESSAGES,
  OWNER_THREAD_PREFIX,
  THREAD_RETENTION_MS,
  stripOwnerThreadPrefix,
  toOwnerThreadId,
} from '@/lib/roadmap/thread-state';

// Latest open Thread of the Owner for the Roadmap Assistant widget (ADR-0012, ADR-0015).
// Visitors always get an empty response and never touch the database.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

// GET /api/roadmap-assistant/thread - Restore the Owner's latest unclosed Thread.
export async function GET(req: NextRequest) {
  if (!(await hasWriteAccess(req))) {
    return NextResponse.json({ threadId: null, messages: [] }, { headers: NO_STORE });
  }

  try {
    const cutoff = new Date(Date.now() - THREAD_RETENTION_MS);
    const [latestMessage, latestOpenState] = await Promise.all([
      prisma.threadMessage.findFirst({
        where: {
          threadId: { startsWith: OWNER_THREAD_PREFIX },
          createdAt: { gte: cutoff },
        },
        orderBy: { id: 'desc' },
        select: { threadId: true, createdAt: true },
      }),
      prisma.threadState.findFirst({
        where: {
          threadId: { startsWith: OWNER_THREAD_PREFIX },
          closedAt: null,
          updatedAt: { gte: cutoff },
        },
        orderBy: { updatedAt: 'desc' },
        select: { threadId: true, updatedAt: true },
      }),
    ]);

    if (!latestMessage) {
      return NextResponse.json({ threadId: null, messages: [] }, { headers: NO_STORE });
    }

    const latestMsgState = await prisma.threadState.findUnique({
      where: { threadId: latestMessage.threadId },
      select: { closedAt: true },
    });

    let targetThreadId: string | null = latestMsgState?.closedAt ? null : latestMessage.threadId;

    if (
      latestOpenState &&
      (latestMsgState?.closedAt ||
        latestOpenState.updatedAt.getTime() >= latestMessage.createdAt.getTime())
    ) {
      const openMessageCount = await prisma.threadMessage.count({
        where: { threadId: latestOpenState.threadId, createdAt: { gte: cutoff } },
      });
      if (openMessageCount > 0) {
        targetThreadId = latestOpenState.threadId;
      }
    }

    if (!targetThreadId) {
      return NextResponse.json({ threadId: null, messages: [] }, { headers: NO_STORE });
    }

    const newestFirst = await prisma.threadMessage.findMany({
      where: { threadId: targetThreadId },
      orderBy: { id: 'desc' },
      take: MAX_THREAD_MESSAGES,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    const messages = newestFirst.reverse().map((m) => ({
      id: `restored-${m.id}`,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      isRestored: true,
    }));

    return NextResponse.json(
      {
        threadId: stripOwnerThreadPrefix(targetThreadId),
        messages,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[API GET /api/roadmap-assistant/thread] Error:', error);
    return NextResponse.json({ error: 'Failed to load latest thread' }, { status: 500, headers: NO_STORE });
  }
}

const CloseThreadBodySchema = z.object({ threadId: z.string().optional() }).passthrough();

// DELETE /api/roadmap-assistant/thread - Mark the Owner's current Thread closed when starting a new chat.
export async function DELETE(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsed = CloseThreadBodySchema.safeParse(rawBody);
    const body = parsed.success ? parsed.data : {};
    const rawThreadId =
      typeof body.threadId === 'string'
        ? body.threadId
        : req.nextUrl.searchParams.get('threadId') ?? '';

    const now = new Date();
    const scoped = rawThreadId ? toOwnerThreadId(rawThreadId) : null;

    if (scoped) {
      await prisma.threadState.upsert({
        where: { threadId: scoped },
        create: { threadId: scoped, closedAt: now },
        update: { closedAt: now },
      });
    } else {
      // Fallback: close whichever Thread currently has the latest message
      const latestMessage = await prisma.threadMessage.findFirst({
        where: { threadId: { startsWith: OWNER_THREAD_PREFIX } },
        orderBy: { id: 'desc' },
        select: { threadId: true },
      });
      if (latestMessage) {
        await prisma.threadState.upsert({
          where: { threadId: latestMessage.threadId },
          create: { threadId: latestMessage.threadId, closedAt: now },
          update: { closedAt: now },
        });
      }
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API DELETE /api/roadmap-assistant/thread] Error:', error);
    return NextResponse.json({ error: 'Failed to close thread' }, { status: 500, headers: NO_STORE });
  }
}
