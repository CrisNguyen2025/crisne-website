import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

const prismaMock = vi.hoisted(() => ({
  roadmap: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  roadmapItem: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as createTopic } from "@/app/api/v1/roadmaps/route";
import { POST as createItem } from "@/app/api/v1/roadmaps/items/route";
import { normalizeTitle } from "@/lib/roadmap/duplicates";

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": "machine-key" },
    body: JSON.stringify(body),
  });

describe("normalizeTitle", () => {
  it("ignores case and spacing but keeps diacritics", () => {
    expect(normalizeTitle("  Mock   1 ")).toBe(normalizeTitle("mock 1"));
    expect(normalizeTitle("Cơ bản")).not.toBe(normalizeTitle("Co ban"));
  });
});

describe("create routes refuse duplicates with 409", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_API_KEY", "machine-key");
    authMock.mockResolvedValue(null);
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("topic: same title in another case", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([{ id: "t1", slug: "backend", title: "Backend" }]);
    const res = await createTopic(post("/api/v1/roadmaps", { title: "backend " }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kind: "topic", existing: { id: "t1" } });
    expect(prismaMock.roadmap.create).not.toHaveBeenCalled();
  });

  it("topic: a new title is created once, with no lessons yet", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t2", ...data }));
    const res = await createTopic(post("/api/v1/roadmaps", { title: "AI Engineering" }));
    expect(res.status).toBe(201);
    const data = prismaMock.roadmap.create.mock.calls[0][0].data;
    expect(data.slug).toBe("ai-engineering");
    expect(data).not.toHaveProperty("shortCode");
  });

  it("topic: a blank title is refused", async () => {
    const res = await createTopic(post("/api/v1/roadmaps", { title: "   " }));
    expect(res.status).toBe(400);
    expect(prismaMock.roadmap.create).not.toHaveBeenCalled();
  });

  it("item: same title elsewhere in the topic, whatever its section", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({
      id: "t1",
      slug: "ai",
      items: [{ id: "i1", title: "Docker Basics", section: "Core", order: 1 }],
    });
    const res = await createItem(post("/api/v1/roadmaps/items", { roadmapSlug: "ai", section: "Production", title: "docker  basics" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kind: "item", existing: { id: "i1" } });
    expect(prismaMock.roadmapItem.create).not.toHaveBeenCalled();
  });

  it("item: a new lesson without a section is created at the end of the topic", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({
      id: "t1",
      slug: "ai",
      items: [{ id: "i1", title: "A", section: "RAG", order: 3 }],
    });
    prismaMock.roadmapItem.create.mockImplementationOnce(async ({ data }) => ({ id: "i2", createdAt: new Date(), updatedAt: new Date(), ...data }));
    const res = await createItem(post("/api/v1/roadmaps/items", { roadmapSlug: "ai", title: "Kafka" }));
    expect(res.status).toBe(201);
    const data = prismaMock.roadmapItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ roadmapId: "t1", section: null, order: 4, title: "Kafka" });
  });

  it("item: a section named with another case reuses the topic's spelling", async () => {
    prismaMock.roadmap.findUnique.mockResolvedValueOnce({
      id: "t1",
      slug: "ai",
      items: [{ id: "i1", title: "A", section: "RAG", order: 1 }],
    });
    prismaMock.roadmapItem.create.mockImplementationOnce(async ({ data }) => ({ id: "i2", createdAt: new Date(), updatedAt: new Date(), ...data }));
    await createItem(post("/api/v1/roadmaps/items", { roadmapSlug: "ai", section: "rag ", title: "Kafka" }));
    expect(prismaMock.roadmapItem.create.mock.calls[0][0].data.section).toBe("RAG");
  });
});
