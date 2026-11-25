import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

const prismaMock = vi.hoisted(() => ({
  roadmapItem: {
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const notifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/write-access", () => writeAccessMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/roadmap/rag-reindex", () => ({ notifyRoadmapChanged: notifyMock }));

import { PATCH as updateContent } from "@/app/api/v1/roadmaps/items/[id]/content/route";
import { POST as reorderItems } from "@/app/api/v1/roadmaps/items/reorder/route";

const contentReq = (body: unknown, rawText?: string) =>
  new NextRequest("http://localhost/api/v1/roadmaps/items/item-1/content", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: rawText ?? JSON.stringify(body),
  });

const reorderReq = (body: unknown, rawText?: string) =>
  new NextRequest("http://localhost/api/v1/roadmaps/items/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawText ?? JSON.stringify(body),
  });

const ctx = { params: Promise.resolve({ id: "item-1" }) };

describe("PATCH /api/v1/roadmaps/items/[id]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAccessMock.requireWriteAccess.mockResolvedValue(null);
  });

  it("returns 401 when write access is denied", async () => {
    writeAccessMock.requireWriteAccess.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await updateContent(contentReq({ content: "<p>hello</p>" }), ctx);
    expect(res.status).toBe(401);
    expect(prismaMock.roadmapItem.update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON or non-string content with 400", async () => {
    const badJson = await updateContent(contentReq(null, "{bad"), ctx);
    expect(badJson.status).toBe(400);

    const badType = await updateContent(contentReq({ content: 123 }), ctx);
    expect(badType.status).toBe(400);
    expect(prismaMock.roadmapItem.update).not.toHaveBeenCalled();
  });

  it("updates content, allows null, and notifies reindex", async () => {
    prismaMock.roadmapItem.update.mockResolvedValueOnce({ id: "item-1", content: "<p>updated</p>" });
    const res = await updateContent(contentReq({ content: "<p>updated</p>" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ item: { id: "item-1", content: "<p>updated</p>" } });
    expect(prismaMock.roadmapItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { content: "<p>updated</p>" },
    });
    expect(notifyMock).toHaveBeenCalledOnce();
  });
});

describe("POST /api/v1/roadmaps/items/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAccessMock.requireWriteAccess.mockResolvedValue(null);
    prismaMock.roadmapItem.update.mockImplementation(async (args) => args);
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("returns 401 when write access is denied", async () => {
    writeAccessMock.requireWriteAccess.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await reorderItems(reorderReq({ orderedItemIds: ["a", "b"] }));
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-array or empty-id items with 400", async () => {
    const missing = await reorderItems(reorderReq({}));
    expect(missing.status).toBe(400);

    const badElem = await reorderItems(reorderReq({ orderedItemIds: ["a", "  "] }));
    expect(badElem.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates lesson order in a transaction and notifies reindex", async () => {
    const res = await reorderItems(reorderReq({ orderedItemIds: ["i2", "i1"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(prismaMock.roadmapItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: "i2" },
      data: { order: 1 },
    });
    expect(prismaMock.roadmapItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: "i1" },
      data: { order: 2 },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledOnce();
  });
});
