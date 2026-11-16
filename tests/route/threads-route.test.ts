import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Real test database (prisma/test.db): pruning and upsert are the logic worth testing
const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

import { prisma } from "@/lib/prisma";
import { DELETE, GET, PATCH, POST } from "@/app/api/v1/threads/[threadId]/route";
import { MAX_MESSAGE_CONTENT_CHARS, MAX_THREAD_MESSAGES, THREAD_RETENTION_MS } from "@/lib/roadmap/thread-state";

const OWNER = "owner:test-thread-a";
const OTHER_OWNER = "owner:test-thread-b";

const contextFor = (threadId: string) => ({ params: Promise.resolve({ threadId }) });
const request = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/v1/threads/x", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
const append = (threadId: string, role: string, content: string) =>
  POST(request("POST", { role, content }), contextFor(threadId));

async function cleanUp() {
  await prisma.threadMessage.deleteMany({ where: { threadId: { startsWith: "owner:test-" } } });
  await prisma.threadState.deleteMany({ where: { threadId: { startsWith: "owner:test-" } } });
}

describe("/api/v1/threads/[threadId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });
  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  describe("access", () => {
    it("returns the guard's 401 for every method without touching the database", async () => {
      writeAccess.requireWriteAccess.mockResolvedValue(new Response("no", { status: 401 }));

      const responses = await Promise.all([
        GET(request("GET") as NextRequest, contextFor(OWNER)),
        POST(request("POST", { role: "user", content: "hi" }), contextFor(OWNER)),
        PATCH(request("PATCH", { activeTopicSlug: "x" }), contextFor(OWNER)),
        DELETE(request("DELETE"), contextFor(OWNER)),
      ]);

      expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
      expect(await prisma.threadMessage.count({ where: { threadId: OWNER } })).toBe(0);
    });

    it("refuses a Visitor thread and a bare prefix with 400, for every method", async () => {
      for (const id of ["visitor:abc", "abc", "owner:"]) {
        const responses = await Promise.all([
          GET(request("GET") as NextRequest, contextFor(id)),
          POST(request("POST", { role: "user", content: "hi" }), contextFor(id)),
          PATCH(request("PATCH", { activeTopicSlug: "x" }), contextFor(id)),
          DELETE(request("DELETE"), contextFor(id)),
        ]);
        expect(responses.map((r) => r.status), id).toEqual([400, 400, 400, 400]);
      }
      expect(await prisma.threadMessage.count({ where: { threadId: { not: { startsWith: "owner:" } } } })).toBe(0);
      expect(await prisma.threadState.count({ where: { threadId: { not: { startsWith: "owner:" } } } })).toBe(0);
    });
  });

  describe("POST + GET", () => {
    it("returns the messages oldest first, with a null state before any topic is set", async () => {
      await append(OWNER, "user", "first");
      await append(OWNER, "assistant", "second");

      const res = await GET(request("GET") as NextRequest, contextFor(OWNER));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "second" },
        ],
        state: null,
      });
    });

    it("keeps threads apart", async () => {
      await append(OWNER, "user", "mine");
      await append(OTHER_OWNER, "user", "theirs");

      const res = await GET(request("GET") as NextRequest, contextFor(OWNER));
      expect((await res.json()).messages).toEqual([{ role: "user", content: "mine" }]);
    });

    it("keeps only the newest messages of a thread", async () => {
      for (let i = 0; i < MAX_THREAD_MESSAGES + 5; i++) await append(OWNER, "user", `m${i}`);
      await append(OTHER_OWNER, "user", "untouched");

      const { messages } = await (await GET(request("GET") as NextRequest, contextFor(OWNER))).json();
      expect(messages).toHaveLength(MAX_THREAD_MESSAGES);
      expect(messages[0].content).toBe("m5");
      expect(messages.at(-1).content).toBe(`m${MAX_THREAD_MESSAGES + 4}`);
      expect(await prisma.threadMessage.count({ where: { threadId: OTHER_OWNER } })).toBe(1);
    });

    it("clips a long message", async () => {
      await append(OWNER, "assistant", "x".repeat(MAX_MESSAGE_CONTENT_CHARS + 100));
      const { messages } = await (await GET(request("GET") as NextRequest, contextFor(OWNER))).json();
      expect(messages[0].content).toHaveLength(MAX_MESSAGE_CONTENT_CHARS);
    });

    it("rejects a bad role or empty content with 400 and stores nothing", async () => {
      for (const body of [
        { role: "system", content: "hi" },
        { role: "user", content: "" },
        { role: "user" },
        { content: "hi" },
        null,
      ]) {
        const res = await POST(request("POST", body), contextFor(OWNER));
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(await prisma.threadMessage.count({ where: { threadId: OWNER } })).toBe(0);
    });

    it("deletes data older than the retention period on the next write", async () => {
      const old = new Date(Date.now() - THREAD_RETENTION_MS - 60_000);
      await prisma.threadMessage.create({ data: { threadId: OTHER_OWNER, role: "user", content: "stale", createdAt: old } });
      await prisma.threadState.create({ data: { threadId: OTHER_OWNER, activeTopicSlug: "stale", updatedAt: old } });
      // @updatedAt overrides a value given on create, so age the row directly
      await prisma.$executeRaw`UPDATE "ThreadState" SET "updatedAt" = ${old.getTime()} WHERE "threadId" = ${OTHER_OWNER}`;

      await append(OWNER, "user", "fresh");

      expect(await prisma.threadMessage.count({ where: { threadId: OTHER_OWNER } })).toBe(0);
      expect(await prisma.threadState.count({ where: { threadId: OTHER_OWNER } })).toBe(0);
      expect(await prisma.threadMessage.count({ where: { threadId: OWNER } })).toBe(1);
    });
  });

  describe("PATCH", () => {
    it("sets, then changes, the open topic", async () => {
      await PATCH(request("PATCH", { activeTopicSlug: "ai", activeTopicTitle: "AI" }), contextFor(OWNER));
      await PATCH(request("PATCH", { activeTopicSlug: "backend", activeTopicTitle: "Backend" }), contextFor(OWNER));

      const { state } = await (await GET(request("GET") as NextRequest, contextFor(OWNER))).json();
      expect(state).toEqual({ activeTopicSlug: "backend", activeTopicTitle: "Backend" });
    });

    it("keeps the stored title when none is sent", async () => {
      await PATCH(request("PATCH", { activeTopicSlug: "ai", activeTopicTitle: "AI" }), contextFor(OWNER));
      await PATCH(request("PATCH", { activeTopicSlug: "ai" }), contextFor(OWNER));

      const { state } = await (await GET(request("GET") as NextRequest, contextFor(OWNER))).json();
      expect(state).toEqual({ activeTopicSlug: "ai", activeTopicTitle: "AI" });
    });

    it("rejects a missing or blank slug with 400", async () => {
      for (const body of [{}, { activeTopicSlug: "  " }, { activeTopicSlug: 3 }]) {
        const res = await PATCH(request("PATCH", body), contextFor(OWNER));
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(await prisma.threadState.count({ where: { threadId: OWNER } })).toBe(0);
    });
  });

  describe("DELETE", () => {
    it("removes the messages and the open topic of that thread only", async () => {
      await append(OWNER, "user", "hi");
      await PATCH(request("PATCH", { activeTopicSlug: "ai" }), contextFor(OWNER));
      await append(OTHER_OWNER, "user", "keep");

      const res = await DELETE(request("DELETE"), contextFor(OWNER));
      expect(res.status).toBe(200);

      expect(await (await GET(request("GET") as NextRequest, contextFor(OWNER))).json()).toEqual({
        messages: [],
        state: null,
      });
      expect(await prisma.threadMessage.count({ where: { threadId: OTHER_OWNER } })).toBe(1);
    });

    it("succeeds for a thread that does not exist", async () => {
      const res = await DELETE(request("DELETE"), contextFor("owner:test-never-seen"));
      expect(res.status).toBe(200);
    });
  });
});
