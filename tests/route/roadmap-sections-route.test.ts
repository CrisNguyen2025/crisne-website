import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  roadmap: {
    findUnique: vi.fn(),
  },
  roadmapItem: {
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const ragReindexMock = vi.hoisted(() => ({
  notifyRoadmapChanged: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/write-access", () => ({ requireWriteAccess: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/roadmap/rag-reindex", () => ragReindexMock);

import { DELETE } from "@/app/api/v1/roadmaps/[slug]/sections/route";

describe("DELETE /api/v1/roadmaps/[slug]/sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createReq = (url: string) => new NextRequest(url, { method: "DELETE" });
  const contextFor = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("returns 400 when section query param is missing or blank without calling prisma", async () => {
    const req1 = createReq("http://localhost/api/v1/roadmaps/my-topic/sections");
    const res1 = await DELETE(req1, contextFor("my-topic"));
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toBe("section is required");
    expect(prismaMock.roadmap.findUnique).not.toHaveBeenCalled();

    const req2 = createReq("http://localhost/api/v1/roadmaps/my-topic/sections?section=%20");
    const res2 = await DELETE(req2, contextFor("my-topic"));
    expect(res2.status).toBe(400);
    expect(prismaMock.roadmap.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when topic does not exist", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce(null);

    const req = createReq("http://localhost/api/v1/roadmaps/missing-topic/sections?section=Core");
    const res = await DELETE(req, contextFor("missing-topic"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Roadmap not found");
    expect(prismaMock.roadmapItem.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when no lessons in the topic match the section", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({
      id: "rm-1",
      slug: "my-topic",
      items: [
        { id: "item-1", section: "Other Section" },
        { id: "item-2", section: null },
      ],
    });

    const req = createReq("http://localhost/api/v1/roadmaps/my-topic/sections?section=Core");
    const res = await DELETE(req, contextFor("my-topic"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No section "Core" in this topic');
    expect(prismaMock.roadmapItem.updateMany).not.toHaveBeenCalled();
  });

  it("matches case-insensitively with trimmed whitespace and updates only matching items to section: null", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({
      id: "rm-1",
      slug: "my-topic",
      items: [
        { id: "item-1", section: "React Hooks" },
        { id: "item-2", section: "react   hooks" },
        { id: "item-3", section: "Other Section" },
        { id: "item-4", section: null },
      ],
    });
    prismaMock.roadmapItem.updateMany.mockResolvedValueOnce({ count: 2 });

    const req = createReq("http://localhost/api/v1/roadmaps/my-topic/sections?section=%20react%20%20hooks%20");
    const res = await DELETE(req, contextFor("my-topic"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, dissolved: 2 });

    expect(prismaMock.roadmapItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1", "item-2"] } },
      data: { section: null },
    });
    expect(prismaMock.roadmapItem.delete).not.toHaveBeenCalled();
    expect(prismaMock.roadmapItem.deleteMany).not.toHaveBeenCalled();
    expect(ragReindexMock.notifyRoadmapChanged).toHaveBeenCalledTimes(1);
  });
});
