import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  roadmapItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

const notifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/write-access", () => writeAccessMock);
vi.mock("@/lib/roadmap/rag-reindex", () => ({ notifyRoadmapChanged: notifyMock }));

import { PATCH } from "@/app/api/v1/roadmaps/items/[id]/route";

const currentItem = {
  id: "item-1",
  roadmapId: "topic-1",
  title: "Old Title",
  description: "Old description",
  section: "Old Section",
  status: "todo",
};

const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/roadmaps/items/item-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ id: "item-1" }) };

describe("PATCH /api/v1/roadmaps/items/[id] reindex notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roadmapItem.findUnique.mockResolvedValue({ ...currentItem });
    prismaMock.roadmapItem.findMany.mockResolvedValue([]);
    prismaMock.roadmapItem.update.mockImplementation(async ({ data }) => ({
      ...currentItem,
      ...data,
    }));
  });

  it("PATCH chỉ có status -> không gọi notifyRoadmapChanged", async () => {
    const res = await PATCH(patch({ status: "learning" }), context);
    expect(res.status).toBe(200);
    expect(prismaMock.roadmapItem.update).toHaveBeenCalledOnce();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("PATCH có title -> có gọi notifyRoadmapChanged", async () => {
    const res = await PATCH(patch({ title: "New Title" }), context);
    expect(res.status).toBe(200);
    expect(prismaMock.roadmapItem.update).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it("PATCH status + title -> có gọi notifyRoadmapChanged", async () => {
    const res = await PATCH(patch({ status: "known", title: "New Title" }), context);
    expect(res.status).toBe(200);
    expect(prismaMock.roadmapItem.update).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it("PATCH description -> có gọi notifyRoadmapChanged", async () => {
    const res = await PATCH(patch({ description: "Updated description" }), context);
    expect(res.status).toBe(200);
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it("PATCH section -> có gọi notifyRoadmapChanged", async () => {
    const res = await PATCH(patch({ section: "New Section" }), context);
    expect(res.status).toBe(200);
    expect(notifyMock).toHaveBeenCalledOnce();
  });
});
