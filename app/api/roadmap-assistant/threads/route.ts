import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import {
  OWNER_THREAD_PREFIX,
  THREAD_RETENTION_MS,
  type ThreadSummary,
  buildThreadTitle,
  extractMatchSnippet,
  foldThreadSearchText,
  isConfirmationThreadMessage,
  isTrivialThreadGreeting,
  matchesThreadSearchText,
  parseThreadListLimit,
  parseThreadSearchQuery,
  stripOwnerThreadPrefix,
} from "@/lib/roadmap/thread-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_SEARCH_SCAN_MESSAGES = 2500;
const MAX_SEARCH_SCAN_STATES = 300;

interface ThreadStateRow {
  threadId: string;
  activeTopicSlug: string | null;
  activeTopicTitle: string | null;
  activeLessonTitle: string | null;
  closedAt: Date | null;
}

const THREAD_STATE_SELECT = {
  threadId: true,
  activeTopicSlug: true,
  activeTopicTitle: true,
  activeLessonTitle: true,
  closedAt: true,
} as const;

function toSummary(
  threadId: string,
  opts: {
    userContents: string[];
    fallbackContent?: string;
    matchedSnippet: string | null;
    lastMessageAt: Date;
    messageCount: number;
    state?: ThreadStateRow;
  }
): ThreadSummary {
  let candidates: string[] = [];
  if (opts.userContents.length > 0) {
    candidates = opts.userContents;
  } else if (opts.fallbackContent) {
    candidates = [opts.fallbackContent];
  }
  return {
    threadId: stripOwnerThreadPrefix(threadId),
    title: buildThreadTitle(candidates),
    matchedSnippet: opts.matchedSnippet,
    lastMessageAt: opts.lastMessageAt.toISOString(),
    messageCount: opts.messageCount,
    activeTopicSlug: opts.state?.activeTopicSlug ?? null,
    activeTopicTitle: opts.state?.activeTopicTitle ?? null,
    activeLessonTitle: opts.state?.activeLessonTitle ?? null,
    isClosed: Boolean(opts.state?.closedAt),
  };
}

async function listRecentThreads(cutoff: Date, limit: number): Promise<ThreadSummary[]> {
  const groups = await prisma.threadMessage.groupBy({
    by: ["threadId"],
    where: {
      threadId: { startsWith: OWNER_THREAD_PREFIX },
      createdAt: { gte: cutoff },
    },
    _max: { createdAt: true, id: true },
    _count: { id: true },
    orderBy: { _max: { id: "desc" } },
    take: limit,
  });

  if (groups.length === 0) return [];

  const threadIds = groups.map((g) => g.threadId);
  const [states, firstUserGroups, firstAnyGroups] = await Promise.all([
    prisma.threadState.findMany({
      where: { threadId: { in: threadIds } },
      select: THREAD_STATE_SELECT,
    }),
    prisma.threadMessage.groupBy({
      by: ["threadId"],
      where: { threadId: { in: threadIds }, role: "user" },
      _min: { id: true },
    }),
    prisma.threadMessage.groupBy({
      by: ["threadId"],
      where: { threadId: { in: threadIds } },
      _min: { id: true },
    }),
  ]);

  const firstMsgIds = Array.from(
    new Set(
      [...firstUserGroups, ...firstAnyGroups]
        .map((g) => g._min.id)
        .filter((id): id is number => typeof id === "number")
    )
  );

  const firstMessages =
    firstMsgIds.length > 0
      ? await prisma.threadMessage.findMany({
          where: { id: { in: firstMsgIds } },
          select: { id: true, threadId: true, role: true, content: true },
        })
      : [];

  const firstUserByThread = new Map<string, string>();
  const firstAnyByThread = new Map<string, string>();
  for (const msg of firstMessages) {
    if (!firstAnyByThread.has(msg.threadId)) {
      firstAnyByThread.set(msg.threadId, msg.content);
    }
    if (msg.role === "user" && !firstUserByThread.has(msg.threadId)) {
      firstUserByThread.set(msg.threadId, msg.content);
    }
  }

  const trivialThreadIds = threadIds.filter((id) => {
    const first = firstUserByThread.get(id);
    return first !== undefined && isTrivialThreadGreeting(first);
  });

  const extraUserContents = new Map<string, string[]>();
  if (trivialThreadIds.length > 0) {
    const extraMsgs = await prisma.threadMessage.findMany({
      where: { threadId: { in: trivialThreadIds }, role: "user" },
      orderBy: { id: "asc" },
      select: { threadId: true, content: true },
      take: trivialThreadIds.length * 5,
    });
    for (const msg of extraMsgs) {
      const list = extraUserContents.get(msg.threadId) ?? [];
      list.push(msg.content);
      extraUserContents.set(msg.threadId, list);
    }
  }

  const stateByThread = new Map(states.map((s) => [s.threadId, s]));

  return groups
    .filter((g) => g._max.createdAt !== null)
    .map((g) => {
      const firstUser = firstUserByThread.get(g.threadId);
      const userContents =
        extraUserContents.get(g.threadId) ?? (firstUser !== undefined ? [firstUser] : []);
      return toSummary(g.threadId, {
        userContents,
        fallbackContent: firstAnyByThread.get(g.threadId),
        matchedSnippet: null,
        lastMessageAt: g._max.createdAt!,
        messageCount: g._count.id,
        state: stateByThread.get(g.threadId),
      });
    });
}

interface SearchBucket {
  lastMessageAt: Date;
  messageCount: number;
  userContentsAsc: string[];
  fallbackContent?: string;
  matchedMessageContent?: string;
}

function buildSearchBuckets(
  messages: { threadId: string; role: string; content: string; createdAt: Date }[],
  query: string
): Map<string, SearchBucket> {
  const buckets = new Map<string, SearchBucket>();

  // Messages arrive newest-first so the first match found is the most recent snippet
  for (const msg of messages) {
    let bucket = buckets.get(msg.threadId);
    if (!bucket) {
      bucket = { lastMessageAt: msg.createdAt, messageCount: 0, userContentsAsc: [] };
      buckets.set(msg.threadId, bucket);
    }
    bucket.messageCount += 1;

    // Ignore button-driven HITL confirmations ("ok", "hủy") so searching "ok" does not pollute quiz/CUD threads
    if (msg.role === "user" && isConfirmationThreadMessage(msg.content)) {
      continue;
    }

    if (!bucket.matchedMessageContent && matchesThreadSearchText(msg.content, query)) {
      bucket.matchedMessageContent = msg.content;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const bucket = buckets.get(msg.threadId);
    if (!bucket) continue;
    bucket.fallbackContent ??= msg.content;
    if (msg.role === "user" && bucket.userContentsAsc.length < 5) {
      bucket.userContentsAsc.push(msg.content);
    }
  }

  return buckets;
}

async function searchThreads(cutoff: Date, query: string, limit: number): Promise<ThreadSummary[]> {
  const foldedQuery = foldThreadSearchText(query);
  if (!foldedQuery) {
    return listRecentThreads(cutoff, limit);
  }

  const [messages, states] = await Promise.all([
    prisma.threadMessage.findMany({
      where: {
        threadId: { startsWith: OWNER_THREAD_PREFIX },
        createdAt: { gte: cutoff },
      },
      orderBy: { id: "desc" },
      take: MAX_SEARCH_SCAN_MESSAGES,
      select: { id: true, threadId: true, role: true, content: true, createdAt: true },
    }),
    prisma.threadState.findMany({
      where: {
        threadId: { startsWith: OWNER_THREAD_PREFIX },
        updatedAt: { gte: cutoff },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_SEARCH_SCAN_STATES,
      select: THREAD_STATE_SELECT,
    }),
  ]);

  const stateByThread = new Map(states.map((s) => [s.threadId, s]));
  const buckets = buildSearchBuckets(messages, query);

  const results: ThreadSummary[] = [];
  for (const [threadId, bucket] of buckets) {
    const state = stateByThread.get(threadId);
    const metaText = [state?.activeTopicTitle, state?.activeTopicSlug, state?.activeLessonTitle]
      .filter(Boolean)
      .join(" ");
    const metaMatches = Boolean(metaText) && matchesThreadSearchText(metaText, query);

    const summary = toSummary(threadId, {
      userContents: bucket.userContentsAsc,
      fallbackContent: bucket.fallbackContent,
      matchedSnippet: null,
      lastMessageAt: bucket.lastMessageAt,
      messageCount: bucket.messageCount,
      state,
    });

    const titleMatches =
      !isConfirmationThreadMessage(summary.title) && matchesThreadSearchText(summary.title, query);
    if (!bucket.matchedMessageContent && !metaMatches && !titleMatches) {
      continue;
    }

    const matchedSnippet =
      !titleMatches && bucket.matchedMessageContent
        ? extractMatchSnippet(bucket.matchedMessageContent, query)
        : null;

    results.push({ ...summary, matchedSnippet });
    if (results.length >= limit) break;
  }

  return results;
}

// GET /api/roadmap-assistant/threads?q=&limit= - List recent Owner Threads (with optional search).
export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const query = parseThreadSearchQuery(req.nextUrl.searchParams.get("q"));
    const limit = parseThreadListLimit(req.nextUrl.searchParams.get("limit"));
    const cutoff = new Date(Date.now() - THREAD_RETENTION_MS);

    const threads = query
      ? await searchThreads(cutoff, query, limit)
      : await listRecentThreads(cutoff, limit);

    return NextResponse.json({ threads }, { headers: NO_STORE });
  } catch (error) {
    console.error("[API GET /api/roadmap-assistant/threads] Error:", error);
    return NextResponse.json({ error: "Failed to load threads" }, { status: 500, headers: NO_STORE });
  }
}
