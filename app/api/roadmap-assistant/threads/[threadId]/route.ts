import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import {
  MAX_THREAD_MESSAGES,
  OWNER_THREAD_PREFIX,
  THREAD_RETENTION_MS,
  stripOwnerThreadPrefix,
  toOwnerThreadId,
} from "@/lib/roadmap/thread-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const SwitchThreadBodySchema = z.object({ action: z.enum(["activate"]).optional() }).passthrough();

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

async function readThreadDetail(scopedThreadId: string) {
  const [newestFirst, rawState] = await Promise.all([
    prisma.threadMessage.findMany({
      where: { threadId: scopedThreadId },
      orderBy: { id: "desc" },
      take: MAX_THREAD_MESSAGES,
      select: { id: true, role: true, content: true, createdAt: true },
    }),
    prisma.threadState.findUnique({
      where: { threadId: scopedThreadId },
      select: {
        activeTopicSlug: true,
        activeTopicTitle: true,
        activeLessonId: true,
        activeLessonTitle: true,
        activeSection: true,
      },
    }),
  ]);

  const messages = newestFirst.reverse().map((m) => ({
    id: `restored-${m.id}`,
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
    timestamp: m.createdAt.toISOString(),
    isRestored: true,
  }));

  const state = rawState
    ? {
        activeTopicSlug: rawState.activeTopicSlug,
        activeTopicTitle: rawState.activeTopicTitle,
        ...(rawState.activeLessonId ? { activeLessonId: rawState.activeLessonId } : {}),
        ...(rawState.activeLessonTitle ? { activeLessonTitle: rawState.activeLessonTitle } : {}),
        ...(rawState.activeSection ? { activeSection: rawState.activeSection } : {}),
      }
    : null;

  return {
    threadId: stripOwnerThreadPrefix(scopedThreadId),
    messages,
    state,
  };
}

function invalidThreadIdResponse() {
  return NextResponse.json({ error: "Invalid threadId" }, { status: 400, headers: NO_STORE });
}

// GET /api/roadmap-assistant/threads/[threadId] - Read one Owner Thread without activating it.
export async function GET(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { threadId } = await context.params;
  const scoped = toOwnerThreadId(threadId);
  if (!scoped) return invalidThreadIdResponse();

  try {
    const cutoff = new Date(Date.now() - THREAD_RETENTION_MS);
    const count = await prisma.threadMessage.count({
      where: { threadId: scoped, createdAt: { gte: cutoff } },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404, headers: NO_STORE });
    }

    const detail = await readThreadDetail(scoped);
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    console.error("[API GET /api/roadmap-assistant/threads/[threadId]] Error:", error);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500, headers: NO_STORE });
  }
}

// PATCH /api/roadmap-assistant/threads/[threadId] - Switch to this Thread and make it the active open Thread.
export async function PATCH(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { threadId } = await context.params;
  const scoped = toOwnerThreadId(threadId);
  if (!scoped) return invalidThreadIdResponse();

  const rawBody = await req.json().catch(() => ({}));
  const parsed = SwitchThreadBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });
  }

  try {
    const cutoff = new Date(Date.now() - THREAD_RETENTION_MS);
    const count = await prisma.threadMessage.count({
      where: { threadId: scoped, createdAt: { gte: cutoff } },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404, headers: NO_STORE });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const latestMessage = await tx.threadMessage.findFirst({
        where: { threadId: { startsWith: OWNER_THREAD_PREFIX }, createdAt: { gte: cutoff } },
        orderBy: { id: "desc" },
        select: { threadId: true },
      });

      await tx.threadState.updateMany({
        where: { threadId: { startsWith: OWNER_THREAD_PREFIX, not: scoped }, closedAt: null },
        data: { closedAt: now },
      });

      // Ensure an unstated active thread with a newer message does not override this switched thread on reload
      if (latestMessage && latestMessage.threadId !== scoped) {
        await tx.threadState.upsert({
          where: { threadId: latestMessage.threadId },
          create: { threadId: latestMessage.threadId, closedAt: now },
          update: { closedAt: now },
        });
      }

      await tx.threadState.upsert({
        where: { threadId: scoped },
        create: { threadId: scoped, closedAt: null },
        update: { closedAt: null },
      });
    });

    const detail = await readThreadDetail(scoped);
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    console.error("[API PATCH /api/roadmap-assistant/threads/[threadId]] Error:", error);
    return NextResponse.json({ error: "Failed to switch thread" }, { status: 500, headers: NO_STORE });
  }
}

// DELETE /api/roadmap-assistant/threads/[threadId] - Permanently remove one Owner Thread from history.
export async function DELETE(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const { threadId } = await context.params;
  const scoped = toOwnerThreadId(threadId);
  if (!scoped) return invalidThreadIdResponse();

  try {
    await prisma.$transaction([
      prisma.threadMessage.deleteMany({ where: { threadId: scoped } }),
      prisma.threadState.deleteMany({ where: { threadId: scoped } }),
    ]);
    return NextResponse.json(
      { ok: true, threadId: stripOwnerThreadPrefix(scoped) },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("[API DELETE /api/roadmap-assistant/threads/[threadId]] Error:", error);
    return NextResponse.json({ error: "Failed to delete thread" }, { status: 500, headers: NO_STORE });
  }
}
