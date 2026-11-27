import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriteAccess } from '@/lib/auth/write-access';
import { JsonObjectSchema } from '@/lib/roadmap/schemas';
import {
  MAX_THREAD_MESSAGES,
  THREAD_RETENTION_MS,
  clipMessageContent,
  cleanLessonIdField,
  cleanTopicField,
  isOwnerThreadId,
  isThreadRole,
  parseMessageContextMeta,
  serializeMessageContextMeta,
} from '@/lib/roadmap/thread-state';

// History and open Topic of an Owner's Roadmap Assistant Thread (ADR-0012).
// Called by the Python service with the admin key; a Visitor's Thread is never stored.

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

/** The Thread id from the URL, or the 400 response to send when it is not an Owner Thread. */
async function ownerThreadId(context: RouteContext): Promise<{ threadId: string } | { denied: NextResponse }> {
  const { threadId } = await context.params;
  if (!isOwnerThreadId(threadId)) {
    return { denied: NextResponse.json({ error: 'Only an owner thread is stored' }, { status: 400 }) };
  }
  return { threadId };
}

// GET /api/v1/threads/[threadId] - The Thread's messages (oldest first) and its open Topic.
export async function GET(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const thread = await ownerThreadId(context);
  if ('denied' in thread) return thread.denied;

  try {
    const [newestFirst, rawState] = await Promise.all([
      prisma.threadMessage.findMany({
        where: { threadId: thread.threadId },
        orderBy: { id: 'desc' },
        take: MAX_THREAD_MESSAGES,
        select: { role: true, content: true, contextJson: true },
      }),
      prisma.threadState.findUnique({
        where: { threadId: thread.threadId },
        select: {
          activeTopicSlug: true,
          activeTopicTitle: true,
          activeLessonId: true,
          activeLessonTitle: true,
          activeSection: true,
        },
      }),
    ]);

    const state = rawState
      ? {
          activeTopicSlug: rawState.activeTopicSlug,
          activeTopicTitle: rawState.activeTopicTitle,
          ...(rawState.activeLessonId ? { activeLessonId: rawState.activeLessonId } : {}),
          ...(rawState.activeLessonTitle ? { activeLessonTitle: rawState.activeLessonTitle } : {}),
          ...(rawState.activeSection ? { activeSection: rawState.activeSection } : {}),
        }
      : null;

    const messages = newestFirst.reverse().map((m) => {
      const contextMeta = parseMessageContextMeta(m.contextJson);
      return {
        role: m.role,
        content: m.content,
        ...(contextMeta ? { contextMeta } : {}),
      };
    });

    return NextResponse.json({ messages, state }, { headers: NO_STORE });
  } catch (error) {
    console.error('[API GET /api/v1/threads/[threadId]] Error:', error);
    return NextResponse.json({ error: 'Failed to read thread' }, { status: 500 });
  }
}

// POST /api/v1/threads/[threadId] - Append one message. Keeps the newest MAX_THREAD_MESSAGES and drops old data.
export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const thread = await ownerThreadId(context);
  if ('denied' in thread) return thread.denied;

  try {
    const raw = await req.json().catch(() => null);
    const parsedBody = JsonObjectSchema.safeParse(raw);
    const body = parsedBody.success ? parsedBody.data : null;
    const content = typeof body?.content === 'string' ? clipMessageContent(body.content) : '';
    if (!isThreadRole(body?.role) || !content) {
      return NextResponse.json({ error: 'role (user | assistant) and content are required' }, { status: 400 });
    }
    const contextJson = serializeMessageContextMeta(body?.contextMeta);

    await prisma.threadMessage.create({
      data: {
        threadId: thread.threadId,
        role: body.role,
        content,
        ...(contextJson ? { contextJson } : {}),
      },
    });

    // Older than the newest MAX_THREAD_MESSAGES of this Thread
    const firstExcess = await prisma.threadMessage.findMany({
      where: { threadId: thread.threadId },
      orderBy: { id: 'desc' },
      skip: MAX_THREAD_MESSAGES,
      take: 1,
      select: { id: true },
    });
    if (firstExcess.length > 0) {
      await prisma.threadMessage.deleteMany({
        where: { threadId: thread.threadId, id: { lte: firstExcess[0].id } },
      });
    }

    // Threads nobody continued are dropped, so the tables do not grow for as long as the site runs
    const cutoff = new Date(Date.now() - THREAD_RETENTION_MS);
    await prisma.threadMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await prisma.threadState.deleteMany({ where: { updatedAt: { lt: cutoff } } });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('[API POST /api/v1/threads/[threadId]] Error:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}

function buildThreadStatePayload(
  threadId: string,
  body: Record<string, unknown>
): { createData: Prisma.ThreadStateUncheckedCreateInput; updateData: Prisma.ThreadStateUncheckedUpdateInput } | null {
  const hasTopicSlug = 'activeTopicSlug' in body;
  const hasLessonId = 'activeLessonId' in body;
  const hasSection = 'activeSection' in body;

  const activeTopicSlug = cleanTopicField(body.activeTopicSlug);
  const activeTopicTitle = cleanTopicField(body.activeTopicTitle);
  const activeLessonId = cleanLessonIdField(body.activeLessonId);
  const activeLessonTitle = cleanTopicField(body.activeLessonTitle);
  const activeSection = cleanTopicField(body.activeSection);

  // Reject calls that provide neither a valid topic nor a valid lesson/section update
  if (!activeTopicSlug && !activeLessonId && !activeSection && !(hasLessonId && body.activeLessonId === null)) {
    return null;
  }

  const createData: Prisma.ThreadStateUncheckedCreateInput = {
    threadId,
    activeTopicSlug,
    activeTopicTitle,
    activeLessonId,
    activeLessonTitle,
    activeSection,
    closedAt: null,
  };

  const updateData: Prisma.ThreadStateUncheckedUpdateInput = { closedAt: null };
  if (hasTopicSlug && activeTopicSlug) {
    updateData.activeTopicSlug = activeTopicSlug;
    if (activeTopicTitle) updateData.activeTopicTitle = activeTopicTitle;
  }
  if (hasLessonId) {
    const clearLesson = body.activeLessonId === null;
    updateData.activeLessonId = clearLesson ? null : activeLessonId;
    updateData.activeLessonTitle = clearLesson ? null : activeLessonTitle;
  }
  if (hasSection) {
    updateData.activeSection = body.activeSection === null ? null : activeSection;
  }
  return { createData, updateData };
}

// PATCH /api/v1/threads/[threadId] - Update the Topic / Lesson / Section focus of the Thread.
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const thread = await ownerThreadId(context);
  if ('denied' in thread) return thread.denied;

  try {
    const raw = await req.json().catch(() => null);
    const parsedBody = JsonObjectSchema.safeParse(raw);
    const body = parsedBody.success ? parsedBody.data : {};
    const payload = buildThreadStatePayload(thread.threadId, body);
    if (!payload) {
      return NextResponse.json(
        { error: 'activeTopicSlug, activeLessonId, or activeSection is required' },
        { status: 400 }
      );
    }

    await prisma.threadState.upsert({
      where: { threadId: thread.threadId },
      create: payload.createData,
      update: payload.updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API PATCH /api/v1/threads/[threadId]] Error:', error);
    return NextResponse.json({ error: 'Failed to save thread state' }, { status: 500 });
  }
}

// DELETE /api/v1/threads/[threadId] - Forget the Thread: its messages and its open Topic.
export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const thread = await ownerThreadId(context);
  if ('denied' in thread) return thread.denied;

  try {
    await prisma.threadMessage.deleteMany({ where: { threadId: thread.threadId } });
    await prisma.threadState.deleteMany({ where: { threadId: thread.threadId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API DELETE /api/v1/threads/[threadId]] Error:', error);
    return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 });
  }
}
