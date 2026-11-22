import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({ requireWriteAccess: vi.fn() }));
vi.mock("@/lib/auth/write-access", () => writeAccess);

const ragReindex = vi.hoisted(() => ({ notifyOwnerMemoryChanged: vi.fn() }));
vi.mock("@/lib/roadmap/rag-reindex", () => ragReindex);

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/v1/memories/route";
import { DELETE, PATCH } from "@/app/api/v1/memories/[id]/route";

const makeReq = (method: string, url: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanUp() {
  await prisma.ownerMemory.deleteMany();
}

describe("/api/v1/memories (ADR-0015)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("blocks unauthorized/Visitor access with 401 on all methods", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const [r1, r2, r3, r4] = await Promise.all([
      GET(makeReq("GET", "http://localhost/api/v1/memories")),
      POST(makeReq("POST", "http://localhost/api/v1/memories", { kind: "techstack", content: "Next.js 15" })),
      PATCH(makeReq("PATCH", "http://localhost/api/v1/memories/m1", { content: "x" }), ctxFor("m1")),
      DELETE(makeReq("DELETE", "http://localhost/api/v1/memories/m1"), ctxFor("m1")),
    ]);

    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([401, 401, 401, 401]);
    expect(await prisma.ownerMemory.count()).toBe(0);
    expect(ragReindex.notifyOwnerMemoryChanged).not.toHaveBeenCalled();
  });

  it("creates, deduplicates, filters by topic & status, updates, and deletes memories", async () => {
    const c1 = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "Đang dùng Next.js 15 và FastAPI",
      })
    );
    expect(c1.status).toBe(201);
    const m1 = (await c1.json()).memory;
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(1);

    // Duplicate content (case-insensitive) returns existing entry with 200 without re-notifying
    const dup = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "đang dùng next.js 15 và fastapi",
      })
    );
    expect(dup.status).toBe(200);
    expect((await dup.json()).deduplicated).toBe(true);
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(1);

    // Topic-scoped memory for ai-architecture and another for backend
    await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "learning_note",
        content: "Hay nhầm RRF với cross-encoder rerank",
        scopeTopicSlug: "ai-architecture",
      })
    );
    await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "learning_note",
        content: "Ưu tiên ví dụ PostgreSQL",
        scopeTopicSlug: "backend",
      })
    );

    const aiScoped = await GET(makeReq("GET", "http://localhost/api/v1/memories?status=active&topic=ai-architecture"));
    expect(aiScoped.status).toBe(200);
    const aiList = (await aiScoped.json()).memories;
    expect(aiList).toHaveLength(2); // global + ai-architecture (excludes backend)
    expect(aiList.map((m: { scopeTopicSlug: string | null }) => m.scopeTopicSlug).sort()).toEqual([
      "ai-architecture",
      null,
    ]);

    // Update content and kind
    const callsBeforePatch = ragReindex.notifyOwnerMemoryChanged.mock.calls.length;
    const patched = await PATCH(
      makeReq("PATCH", `http://localhost/api/v1/memories/${m1.id}`, {
        kind: "preference",
        content: "Giải thích ngắn gọn kèm ví dụ code",
      }),
      ctxFor(m1.id)
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).memory.kind).toBe("preference");
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(callsBeforePatch + 1);

    // Delete
    const deleted = await DELETE(makeReq("DELETE", `http://localhost/api/v1/memories/${m1.id}`), ctxFor(m1.id));
    expect(deleted.status).toBe(200);
    expect(await prisma.ownerMemory.findUnique({ where: { id: m1.id } })).toBeNull();
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(callsBeforePatch + 2);
  });

  it("archives replacesMemoryId atomically when approving a pending memory", async () => {
    const oldRes = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "Đang dùng Next.js 14",
      })
    );
    const oldMem = (await oldRes.json()).memory;

    const pendingRes = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "Đang dùng Next.js 15",
        source: "suggested",
        status: "pending",
        replacesMemoryId: oldMem.id,
      })
    );
    expect(pendingRes.status).toBe(201);
    const pendingMem = (await pendingRes.json()).memory;
    expect(pendingMem.status).toBe("pending");

    // Approve pending -> active
    const approveRes = await PATCH(
      makeReq("PATCH", `http://localhost/api/v1/memories/${pendingMem.id}`, { status: "active" }),
      ctxFor(pendingMem.id)
    );
    expect(approveRes.status).toBe(200);

    const refreshedOld = await prisma.ownerMemory.findUnique({ where: { id: oldMem.id } });
    const refreshedNew = await prisma.ownerMemory.findUnique({ where: { id: pendingMem.id } });
    expect(refreshedOld?.status).toBe("archived");
    expect(refreshedNew?.status).toBe("active");
  });

  it("rejects invalid kind, oversized content, bad scope slug, and invalid status", async () => {
    const cases = [
      { kind: "unknown", content: "ok" },
      { kind: "profile", content: "   " },
      { kind: "profile", content: "x".repeat(301) },
      { kind: "profile", content: "ok", scopeTopicSlug: "BAD SLUG!" },
      { kind: "profile", content: "ok", status: "archived" },
    ];
    for (const body of cases) {
      const res = await POST(makeReq("POST", "http://localhost/api/v1/memories", body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});
