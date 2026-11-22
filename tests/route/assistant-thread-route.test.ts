import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccess = vi.hoisted(() => ({
  hasWriteAccess: vi.fn(),
  requireWriteAccess: vi.fn(),
}));
vi.mock("@/lib/auth/write-access", () => writeAccess);

// Isolate this suite in its own SQLite copy because GET /api/roadmap-assistant/thread queries the
// globally latest `owner:*` ThreadMessage and would otherwise race with threads-route.test.ts in parallel.
const isolatedDb = await vi.hoisted(async () => {
  const [fsMod, osMod, pathMod, prismaPkg] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
    import("@prisma/client"),
  ]);
  const src = pathMod.resolve(process.cwd(), "prisma/test.db");
  const dbPath = pathMod.join(osMod.tmpdir(), `crisne-assistant-thread-${process.pid}-${Date.now()}.db`);
  fsMod.copyFileSync(src, dbPath);
  const client = new prismaPkg.PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  return { dbPath, client };
});
vi.mock("@/lib/prisma", () => ({ prisma: isolatedDb.client }));

import { prisma } from "@/lib/prisma";
import { DELETE, GET } from "@/app/api/roadmap-assistant/thread/route";

const T1 = "owner:latest-test-1";
const T2 = "owner:latest-test-2";

const makeReq = (method: string, body?: unknown, query = "") =>
  new NextRequest(`http://localhost/api/roadmap-assistant/thread${query}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });

async function cleanUp() {
  await prisma.threadMessage.deleteMany();
  await prisma.threadState.deleteMany();
}

describe("/api/roadmap-assistant/thread", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writeAccess.hasWriteAccess.mockResolvedValue(true);
    writeAccess.requireWriteAccess.mockResolvedValue(null);
    await cleanUp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      fs.rmSync(`${isolatedDb.dbPath}${suffix}`, { force: true });
    }
  });

  it("returns empty response for Visitors without leaking Owner threads", async () => {
    await prisma.threadMessage.create({ data: { threadId: T1, role: "user", content: "secret owner msg" } });
    writeAccess.hasWriteAccess.mockResolvedValue(false);

    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threadId: null, messages: [] });
  });

  it("returns 401 on DELETE for Visitors", async () => {
    writeAccess.requireWriteAccess.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const res = await DELETE(makeReq("DELETE", { threadId: "latest-test-1" }));
    expect(res.status).toBe(401);
  });

  it("restores the Owner's latest open Thread with stripped owner prefix", async () => {
    await prisma.threadMessage.create({ data: { threadId: T1, role: "user", content: "older thread" } });
    await prisma.threadMessage.create({ data: { threadId: T2, role: "user", content: "hi" } });
    await prisma.threadMessage.create({ data: { threadId: T2, role: "assistant", content: "hello owner" } });

    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.threadId).toBe("latest-test-2");
    expect(data.messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ["user", "hi"],
      ["assistant", "hello owner"],
    ]);
  });

  it("does not resurrect an older Thread after closing the latest Thread", async () => {
    await prisma.threadMessage.create({ data: { threadId: T1, role: "user", content: "yesterday" } });
    await prisma.threadMessage.create({ data: { threadId: T2, role: "user", content: "today" } });

    const closeRes = await DELETE(makeReq("DELETE", { threadId: "latest-test-2" }));
    expect(closeRes.status).toBe(200);

    const afterClose = await GET(makeReq("GET"));
    expect(await afterClose.json()).toEqual({ threadId: null, messages: [] });
  });
});
