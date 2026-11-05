import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Lesson Status is the Owner's personal progress (ADR-0010): a Visitor never gets it

const prismaMock = vi.hoisted(() => ({
  roadmap: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

const writeAccessMock = vi.hoisted(() => ({
  hasWriteAccess: vi.fn(),
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/write-access", () => writeAccessMock);
vi.mock("@/lib/roadmap/rag-reindex", () => ({ notifyRoadmapChanged: vi.fn() }));

import { GET } from "@/app/api/v1/roadmaps/[slug]/route";

const now = new Date("2026-11-05T00:00:00.000Z");
const topic = {
  id: "t1",
  slug: "ai",
  title: "AI",
  description: null,
  icon: null,
  order: 0,
  isLocked: false,
  items: [
    {
      id: "l1",
      roadmapId: "t1",
      section: null,
      title: "RAG",
      description: null,
      content: null,
      order: 0,
      createdAt: now,
      updatedAt: now,
      status: "learning",
      statusUpdatedAt: now,
    },
  ],
};

describe("GET /api/v1/roadmaps/[slug] Lesson Status visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roadmap.findUnique.mockResolvedValue(topic);
  });

  const get = () =>
    GET(new NextRequest("http://localhost/api/v1/roadmaps/ai"), { params: Promise.resolve({ slug: "ai" }) });

  it("gives the Owner the status and when it changed", async () => {
    writeAccessMock.hasWriteAccess.mockResolvedValue(true);
    const { items } = await (await get()).json();
    expect(items[0].status).toBe("learning");
    expect(items[0].statusUpdatedAt).toBe(now.toISOString());
  });

  it("gives a Visitor neither field", async () => {
    writeAccessMock.hasWriteAccess.mockResolvedValue(false);
    const { items } = await (await get()).json();
    expect(items[0]).not.toHaveProperty("status");
    expect(items[0]).not.toHaveProperty("statusUpdatedAt");
    expect(items[0].title).toBe("RAG");
  });
});
