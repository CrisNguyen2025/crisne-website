import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({
  hasWriteAccess: vi.fn(),
  requireWriteAccess: vi.fn(),
}));
vi.mock("@/lib/auth/write-access", () => writeAccess);

const ragReindex = vi.hoisted(() => ({
  notifyOwnerMemoryChanged: vi.fn(),
  notifyRoadmapChanged: vi.fn(),
}));
vi.mock("@/lib/roadmap/rag-reindex", () => ragReindex);

import { prisma } from "@/lib/prisma";
import { DELETE as CLEAR_MEMORIES, GET, PATCH as PATCH_COLLECTION, POST } from "@/app/api/v1/memories/route";
import { DELETE, PATCH } from "@/app/api/v1/memories/[id]/route";
import { GET as GET_SETTINGS, PATCH as PATCH_SETTINGS } from "@/app/api/v1/memories/settings/route";
import { GET as GET_EVENTS, POST as POST_EVENT } from "@/app/api/v1/memories/activity-events/route";
import { GET as GET_SNAPSHOT } from "@/app/api/v1/memories/activity-snapshot/route";
import { DELETE as DELETE_TOPIC } from "@/app/api/v1/roadmaps/[slug]/route";
import { POST as PROXY_POST } from "@/app/api/roadmap-assistant/[...path]/route";

const makeReq = (method: string, url: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanUp() {
  await prisma.ownerMemory.deleteMany();
  await prisma.ownerActivityEvent.deleteMany();
  await prisma.ownerPreference.deleteMany();
  await prisma.roadmap.deleteMany({ where: { slug: "rovo-test-topic" } });
}

describe("/api/v1/memories (ADR-0015)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.hasWriteAccess.mockResolvedValue(true);
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("blocks unauthorized/Visitor access with 401 on all methods", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const [r1, r2, r3, r4, r5] = await Promise.all([
      GET(makeReq("GET", "http://localhost/api/v1/memories")),
      POST(makeReq("POST", "http://localhost/api/v1/memories", { kind: "techstack", content: "Next.js 15" })),
      PATCH_COLLECTION(makeReq("PATCH", "http://localhost/api/v1/memories", { ids: ["m1"] })),
      PATCH(makeReq("PATCH", "http://localhost/api/v1/memories/m1", { content: "x" }), ctxFor("m1")),
      DELETE(makeReq("DELETE", "http://localhost/api/v1/memories/m1"), ctxFor("m1")),
    ]);

    expect([r1.status, r2.status, r3.status, r4.status, r5.status]).toEqual([401, 401, 401, 401, 401]);
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

  it("skips cache invalidation for pending lifecycle and updates lastUsedAt in batch without invalidating", async () => {
    const p1Res = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "learning_note",
        content: "Hay quên fencing token trong distributed lock",
        source: "suggested",
        status: "pending",
      })
    );
    expect(p1Res.status).toBe(201);
    const p1 = (await p1Res.json()).memory;
    expect(p1.status).toBe("pending");
    expect(ragReindex.notifyOwnerMemoryChanged).not.toHaveBeenCalled();

    const p2Res = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "goal",
        content: "Ôn lại Raft consensus",
        source: "suggested",
        status: "pending",
      })
    );
    expect(p2Res.status).toBe(201);
    const p2 = (await p2Res.json()).memory;

    const editPending = await PATCH(
      makeReq("PATCH", `http://localhost/api/v1/memories/${p1.id}`, {
        kind: "preference",
        content: "Luôn minh họa fencing token bằng sơ đồ timeline",
        scopeTopicSlug: "distributed-systems",
      }),
      ctxFor(p1.id)
    );
    expect(editPending.status).toBe(200);
    const edited = (await editPending.json()).memory;
    expect(edited.kind).toBe("preference");
    expect(edited.scopeTopicSlug).toBe("distributed-systems");
    expect(edited.status).toBe("pending");
    expect(ragReindex.notifyOwnerMemoryChanged).not.toHaveBeenCalled();

    const delPending = await DELETE(makeReq("DELETE", `http://localhost/api/v1/memories/${p1.id}`), ctxFor(p1.id));
    expect(delPending.status).toBe(200);
    expect(ragReindex.notifyOwnerMemoryChanged).not.toHaveBeenCalled();

    const p3Res = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "Đang dùng Turso cho metadata",
      })
    );
    expect(p3Res.status).toBe(201);
    const activeMem = (await p3Res.json()).memory;
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(1);

    const touchRes = await PATCH_COLLECTION(
      makeReq("PATCH", "http://localhost/api/v1/memories", {
        ids: [activeMem.id, p2.id, "non-existent-id"],
      })
    );
    expect(touchRes.status).toBe(200);
    const touchJson = await touchRes.json();
    expect(touchJson.updatedCount).toBe(1);
    expect(typeof touchJson.lastUsedAt).toBe("string");
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(1);

    const [reloadedActive, reloadedPending] = await Promise.all([
      prisma.ownerMemory.findUnique({ where: { id: activeMem.id } }),
      prisma.ownerMemory.findUnique({ where: { id: p2.id } }),
    ]);
    expect(reloadedActive?.lastUsedAt).not.toBeNull();
    expect(reloadedPending?.lastUsedAt).toBeNull();

    for (const invalid of [{}, { ids: "bad" }, { ids: [] }, { ids: ["   "] }]) {
      const badRes = await PATCH_COLLECTION(makeReq("PATCH", "http://localhost/api/v1/memories", invalid));
      expect(badRes.status, JSON.stringify(invalid)).toBe(400);
    }
  });

  it("rejects secrets and placeholder-only PII while masking mixed PII", async () => {
    const secretRes = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      })
    );
    expect(secretRes.status).toBe(400);

    const credUrlRes = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "DB url postgres://admin:SecretPass99@db.example.com:5432/prod",
      })
    );
    expect(credUrlRes.status).toBe(400);

    const piiOnlyRes = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "profile",
        content: "Email: owner@example.com",
      })
    );
    expect(piiOnlyRes.status).toBe(400);

    const validStudyNote = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "learning_note",
        content: "Dùng Bearer JWT kết hợp local postgres://localhost:5432/app",
      })
    );
    expect(validStudyNote.status).toBe(201);

    const maskedPii = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "profile",
        content: "Dùng email work owner@example.com cho dự án",
      })
    );
    expect(maskedPii.status).toBe(201);
    const maskedBody = (await maskedPii.json()).memory;
    expect(maskedBody.content).toBe("Dùng email work [email] cho dự án");
  });

  it("manages settings kill-switches, includeSettings, origin/search filters, Clear All, and atomic Undo", async () => {
    const defRes = await GET_SETTINGS(makeReq("GET", "http://localhost/api/v1/memories/settings"));
    expect(defRes.status).toBe(200);
    expect((await defRes.json()).settings.memoryEnabled).toBe(true);

    const offObs = await PATCH_SETTINGS(
      makeReq("PATCH", "http://localhost/api/v1/memories/settings", { autoObserveEnabled: false })
    );
    expect(offObs.status).toBe(200);
    expect(ragReindex.notifyOwnerMemoryChanged).toHaveBeenCalledTimes(1);

    const blockedSuggested = await POST(
      makeReq("POST", "http://localhost/api/v1/memories", {
        kind: "techstack",
        content: "Thử suggest khi tắt autoObserve",
        source: "suggested",
      })
    );
    expect(blockedSuggested.status).toBe(409);

    await PATCH_SETTINGS(
      makeReq("PATCH", "http://localhost/api/v1/memories/settings", { autoObserveEnabled: true })
    );

    const oldMem = await (
      await POST(
        makeReq("POST", "http://localhost/api/v1/memories", {
          kind: "techstack",
          content: "Đang dùng Next.js 14",
        })
      )
    ).json();
    const pendingNew = await (
      await POST(
        makeReq("POST", "http://localhost/api/v1/memories", {
          kind: "techstack",
          content: "Đang dùng Next.js 16",
          source: "suggested",
          status: "pending",
          replacesMemoryId: oldMem.memory.id,
          confidence: 0.92,
          evidenceSnippet: "Nâng cấp Next.js 16",
        })
      )
    ).json();
    const obsMem = await (
      await POST(
        makeReq("POST", "http://localhost/api/v1/memories", {
          kind: "goal",
          content: "Đang ôn Distributed Caching",
          source: "observed",
        })
      )
    ).json();
    expect(obsMem.memory.status).toBe("active");

    await PATCH_COLLECTION(
      makeReq("PATCH", "http://localhost/api/v1/memories", { ids: [oldMem.memory.id] })
    );
    const afterTouch = await prisma.ownerMemory.findUnique({ where: { id: oldMem.memory.id } });
    expect(afterTouch?.useCount).toBe(1);

    const combinedRes = await GET(
      makeReq("GET", "http://localhost/api/v1/memories?status=active&includeSettings=1&origin=auto&q=Caching")
    );
    const combinedJson = await combinedRes.json();
    expect(combinedJson.memories).toHaveLength(1);
    expect(combinedJson.settings.autoObserveEnabled).toBe(true);

    await PATCH(
      makeReq("PATCH", `http://localhost/api/v1/memories/${pendingNew.memory.id}`, { status: "active" }),
      ctxFor(pendingNew.memory.id)
    );
    expect((await prisma.ownerMemory.findUnique({ where: { id: oldMem.memory.id } }))?.status).toBe("archived");

    const undoRes = await PATCH(
      makeReq("PATCH", `http://localhost/api/v1/memories/${pendingNew.memory.id}`, {
        status: "pending",
        restoreReplacedId: oldMem.memory.id,
      }),
      ctxFor(pendingNew.memory.id)
    );
    expect(undoRes.status).toBe(200);
    expect((await prisma.ownerMemory.findUnique({ where: { id: oldMem.memory.id } }))?.status).toBe("active");

    const clearRes = await CLEAR_MEMORIES(makeReq("DELETE", "http://localhost/api/v1/memories?status=all"));
    expect(clearRes.status).toBe(200);
    expect((await clearRes.json()).deletedCount).toBeGreaterThanOrEqual(3);
    expect(await prisma.ownerMemory.count()).toBe(0);
  });

  it("hard-deletes scoped memories on Topic delete and records activity events + snapshot + visitor proxy block", async () => {
    const topic = await prisma.roadmap.create({
      data: { slug: "rovo-test-topic", title: "Rovo Test Topic" },
    });
    await prisma.ownerMemory.create({
      data: { kind: "learning_note", content: "Ghi chú riêng topic", scopeTopicSlug: topic.slug },
    });
    await prisma.ownerMemory.create({
      data: { kind: "preference", content: "Quy ước toàn cục", scopeTopicSlug: null },
    });

    const delTopicRes = await DELETE_TOPIC(makeReq("DELETE", `http://localhost/api/v1/roadmaps/${topic.slug}`), {
      params: Promise.resolve({ slug: topic.slug }),
    });
    expect(delTopicRes.status).toBe(200);
    const remaining = await prisma.ownerMemory.findMany();
    expect(remaining.map((m) => m.scopeTopicSlug)).toEqual([null]);

    await prisma.ownerActivityEvent.create({
      data: {
        eventType: "quiz_completed",
        summary: "Old quiz event",
        createdAt: new Date(Date.now() - 95 * 86_400_000),
      },
    });
    const evRes = await POST_EVENT(
      makeReq("POST", "http://localhost/api/v1/memories/activity-events", {
        eventType: "memory_rejected",
        summary: "Không dùng Vue",
      })
    );
    expect(evRes.status).toBe(201);
    const eventsJson = await (await GET_EVENTS(makeReq("GET", "http://localhost/api/v1/memories/activity-events"))).json();
    expect(eventsJson.events).toHaveLength(1);
    expect(eventsJson.events[0].summary).toBe("Không dùng Vue");

    const snapRes = await GET_SNAPSHOT(makeReq("GET", "http://localhost/api/v1/memories/activity-snapshot"));
    expect(snapRes.status).toBe(200);
    const snapJson = await snapRes.json();
    expect(typeof snapJson.sourceHash).toBe("string");
    expect(snapJson.snapshot.activityEvents).toHaveLength(1);

    writeAccess.hasWriteAccess.mockResolvedValue(false);
    const visitorProxy = await PROXY_POST(
      makeReq("POST", "http://localhost/api/roadmap-assistant/memories/observations/refresh", { force: true }),
      { params: Promise.resolve({ path: ["memories", "observations", "refresh"] }) }
    );
    expect(visitorProxy.status).toBe(403);
  });
});
