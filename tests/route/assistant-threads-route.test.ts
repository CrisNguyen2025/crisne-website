import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({
  requireWriteAccess: vi.fn(),
}));
vi.mock("@/lib/auth/write-access", () => writeAccess);

// Isolate in its own SQLite copy because list/search/switch query across all `owner:*` Threads
const isolatedDb = await vi.hoisted(async () => {
  const [fsMod, osMod, pathMod, prismaPkg] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
    import("@prisma/client"),
  ]);
  const src = pathMod.resolve(process.cwd(), "prisma/test.db");
  const dbPath = pathMod.join(osMod.tmpdir(), `crisne-assistant-threads-${process.pid}-${Date.now()}.db`);
  fsMod.copyFileSync(src, dbPath);
  const client = new prismaPkg.PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  return { dbPath, client };
});
vi.mock("@/lib/prisma", () => ({ prisma: isolatedDb.client }));

import { prisma } from "@/lib/prisma";
import { GET as listThreads } from "@/app/api/roadmap-assistant/threads/route";
import {
  DELETE as deleteThread,
  GET as getThread,
  PATCH as switchThread,
} from "@/app/api/roadmap-assistant/threads/[threadId]/route";
import { THREAD_RETENTION_MS } from "@/lib/roadmap/thread-state";

const makeListReq = (query = "") =>
  new NextRequest(`http://localhost/api/roadmap-assistant/threads${query}`);

const makeItemReq = (method: string, threadId: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/roadmap-assistant/threads/${threadId}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });

const ctxFor = (threadId: string) => ({ params: Promise.resolve({ threadId }) });

async function cleanUp() {
  await prisma.threadMessage.deleteMany();
  await prisma.threadState.deleteMany();
}

describe("/api/roadmap-assistant/threads", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      fs.rmSync(`${isolatedDb.dbPath}${suffix}`, { force: true });
    }
  });

  describe("access guard", () => {
    it("returns 401 for Visitors on every endpoint", async () => {
      writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

      const responses = await Promise.all([
        listThreads(makeListReq()),
        getThread(makeItemReq("GET", "t1"), ctxFor("t1")),
        switchThread(makeItemReq("PATCH", "t1", { action: "activate" }), ctxFor("t1")),
        deleteThread(makeItemReq("DELETE", "t1"), ctxFor("t1")),
      ]);

      expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    });

    it("rejects invalid or default threadIds with 400", async () => {
      for (const badId of ["default", "   ", "x".repeat(210)]) {
        const res = await switchThread(makeItemReq("PATCH", badId, {}), ctxFor(badId));
        expect(res.status, badId).toBe(400);
      }
    });
  });

  describe("GET /api/roadmap-assistant/threads (list + search)", () => {
    it("lists recent Owner Threads newest-first, skips trivial greetings for titles, and excludes Visitor/expired data", async () => {
      const old = new Date(Date.now() - THREAD_RETENTION_MS - 60_000);
      await prisma.threadMessage.create({
        data: { threadId: "owner:expired", role: "user", content: "old msg", createdAt: old },
      });
      await prisma.threadMessage.create({
        data: { threadId: "visitor:v1", role: "user", content: "visitor msg" },
      });

      await prisma.threadMessage.create({
        data: { threadId: "owner:t-old", role: "user", content: "Hi!" },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-old", role: "assistant", content: "Chào bạn" },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-old", role: "user", content: "Giải thích hybrid search trong RAG" },
      });
      await prisma.threadState.create({
        data: {
          threadId: "owner:t-old",
          activeTopicSlug: "ai-architecture",
          activeTopicTitle: "AI & LLM Architecture",
          closedAt: new Date(),
        },
      });

      await prisma.threadMessage.create({
        data: { threadId: "owner:t-new", role: "user", content: "Tóm tắt kiến thức Backend" },
      });

      const res = await listThreads(makeListReq());
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.threads).toHaveLength(2);
      expect(data.threads[0]).toMatchObject({
        threadId: "t-new",
        title: "Tóm tắt kiến thức Backend",
        messageCount: 1,
        activeTopicSlug: null,
        isClosed: false,
      });
      expect(data.threads[1]).toMatchObject({
        threadId: "t-old",
        title: "Giải thích hybrid search trong RAG",
        messageCount: 3,
        activeTopicSlug: "ai-architecture",
        activeTopicTitle: "AI & LLM Architecture",
        isClosed: true,
      });
    });

    it("supports Vietnamese accent-insensitive search across message bodies and Topics with snippets", async () => {
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-mem", role: "user", content: "Hỏi chung về lộ trình" },
      });
      await prisma.threadMessage.create({
        data: {
          threadId: "owner:t-mem",
          role: "assistant",
          content: "Mục Bộ nhớ Owner sẽ được nạp vào khối owner_memory ở mỗi lượt trả lời.",
        },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-topic", role: "user", content: "Học gì tiếp?" },
      });
      await prisma.threadState.create({
        data: {
          threadId: "owner:t-topic",
          activeTopicSlug: "nextjs-app-router",
          activeTopicTitle: "Next.js App Router",
        },
      });

      const contentSearch = await listThreads(makeListReq("?q=bo+nho"));
      const contentJson = await contentSearch.json();
      expect(contentJson.threads).toHaveLength(1);
      expect(contentJson.threads[0].threadId).toBe("t-mem");
      expect(contentJson.threads[0].matchedSnippet).toContain("Bộ nhớ Owner");

      const topicSearch = await listThreads(makeListReq("?q=App+Router"));
      const topicJson = await topicSearch.json();
      expect(topicJson.threads).toHaveLength(1);
      expect(topicJson.threads[0].threadId).toBe("t-topic");
    });

    it("respects limit, falls back to assistant content when no user message exists, and adds ellipsis on long snippets", async () => {
      const longMiddle = `${"a".repeat(65)} từ khóa bí mật ${"b".repeat(65)}`;
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-assistant-only", role: "assistant", content: longMiddle },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-latest", role: "user", content: "Chủ đề mới nhất" },
      });

      const limitedRes = await listThreads(makeListReq("?limit=1"));
      const limitedJson = await limitedRes.json();
      expect(limitedJson.threads).toHaveLength(1);
      expect(limitedJson.threads[0].threadId).toBe("t-latest");

      const snippetRes = await listThreads(makeListReq("?q=bi+mat"));
      const snippetJson = await snippetRes.json();
      expect(snippetJson.threads).toHaveLength(1);
      expect(snippetJson.threads[0].threadId).toBe("t-assistant-only");
      expect(snippetJson.threads[0].matchedSnippet).toMatch(/^….*từ khóa bí mật.*…$/);
    });

    it("ignores HITL confirmation 'ok' messages and substring matches inside words when searching 'ok'", async () => {
      // Quiz/CUD thread where Owner clicked Confirm ("ok") and answer contains "token"
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-quiz", role: "user", content: "ôn nhanh 1 câu bài cần ôn nhất" },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-quiz", role: "assistant", content: "Giới hạn token trong context window." },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-quiz", role: "user", content: "ok" },
      });

      // Thread with only a bare confirmation "ok"
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-bare-ok", role: "user", content: "ok" },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-bare-ok", role: "assistant", content: "Đã thực hiện." },
      });

      // Meaningful thread actually discussing "ok" as a standalone word
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-real-ok", role: "user", content: "Kiểm tra deploy ok chưa?" },
      });

      const res = await listThreads(makeListReq("?q=ok"));
      const json = await res.json();
      expect(json.threads).toHaveLength(1);
      expect(json.threads[0].threadId).toBe("t-real-ok");
      expect(json.threads[0].matchedSnippet).toBeNull();
    });
  });

  describe("GET | PATCH | DELETE /api/roadmap-assistant/threads/[threadId]", () => {
    it("switches cleanly to an older Thread, closes an unstated newer Thread, and deletes Threads", async () => {
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-first", role: "user", content: "Câu hỏi cũ" },
      });
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-first", role: "assistant", content: "Trả lời cũ" },
      });
      await prisma.threadState.create({
        data: {
          threadId: "owner:t-first",
          activeTopicSlug: "ai",
          activeTopicTitle: "AI",
          closedAt: new Date("2026-11-25T00:00:00.000Z"),
        },
      });
      // Active newer Thread without a ThreadState row yet
      await prisma.threadMessage.create({
        data: { threadId: "owner:t-second", role: "user", content: "Câu hỏi mới" },
      });

      // GET does not mutate closedAt
      const peekRes = await getThread(makeItemReq("GET", "t-first"), ctxFor("t-first"));
      expect(peekRes.status).toBe(200);
      expect(
        (await prisma.threadState.findUnique({ where: { threadId: "owner:t-first" } }))?.closedAt
      ).not.toBeNull();

      // PATCH activates t-first and closes t-second
      const switchRes = await switchThread(
        makeItemReq("PATCH", "t-first", { action: "activate" }),
        ctxFor("t-first")
      );
      expect(switchRes.status).toBe(200);
      const switched = await switchRes.json();
      expect(switched.threadId).toBe("t-first");
      expect(switched.messages).toHaveLength(2);
      expect(switched.messages.every((m: { isRestored?: boolean }) => m.isRestored)).toBe(true);
      expect(switched.state).toEqual({ activeTopicSlug: "ai", activeTopicTitle: "AI" });

      const [firstState, secondState] = await Promise.all([
        prisma.threadState.findUnique({ where: { threadId: "owner:t-first" } }),
        prisma.threadState.findUnique({ where: { threadId: "owner:t-second" } }),
      ]);
      expect(firstState?.closedAt).toBeNull();
      expect(secondState?.closedAt).not.toBeNull();

      // DELETE removes t-first only
      const delRes = await deleteThread(makeItemReq("DELETE", "t-first"), ctxFor("t-first"));
      expect(delRes.status).toBe(200);
      expect(await prisma.threadMessage.count({ where: { threadId: "owner:t-first" } })).toBe(0);
      expect(await prisma.threadState.count({ where: { threadId: "owner:t-first" } })).toBe(0);
      expect(await prisma.threadMessage.count({ where: { threadId: "owner:t-second" } })).toBe(1);

      const missingRes = await switchThread(makeItemReq("PATCH", "t-first", {}), ctxFor("t-first"));
      expect(missingRes.status).toBe(404);
    });
  });
});
