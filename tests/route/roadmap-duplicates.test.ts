import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

const prismaMock = vi.hoisted(() => ({
  roadmap: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  roadmapLayer: { findMany: vi.fn(), create: vi.fn() },
  roadmapGroup: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  roadmapItem: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as createTopic } from "@/app/api/v1/roadmaps/route";
import { POST as createLayer } from "@/app/api/v1/roadmaps/[slug]/layers/route";
import { POST as createGroup } from "@/app/api/v1/roadmaps/groups/route";
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
    const res = await createTopic(post("/api/v1/roadmaps", { title: "backend ", shortCode: "BE", layers: [{ title: "General", shortTag: "01-GEN" }] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DUPLICATE", kind: "topic", existing: { slug: "backend" } });
    expect(prismaMock.roadmap.create).not.toHaveBeenCalled();
  });

  it("topic: a new title is created once, repeated initial layers collapse", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t2", ...data }));
    const res = await createTopic(
      post("/api/v1/roadmaps", {
        title: "AI Engineering",
        shortCode: "AI",
        layers: [
          { title: "Core", shortTag: "01-COR" },
          { title: "core", shortTag: "02-COR" },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = prismaMock.roadmap.create.mock.calls[0][0].data;
    expect(data.slug).toBe("ai-engineering");
    expect(data.layers.create).toHaveLength(1);
  });

  it("layer: same title already in the topic", async () => {
    prismaMock.roadmap.findUnique
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValueOnce({ id: "t1", _count: { layers: 1 } });
    prismaMock.roadmapLayer.findMany.mockResolvedValueOnce([{ id: "l1", title: "Mock 1", shortTag: "01-MOC" }]);
    const res = await createLayer(post("/api/v1/roadmaps/backend/layers", { title: "mock 1", shortTag: "02-MOC" }), {
      params: Promise.resolve({ slug: "backend" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kind: "layer", existing: { id: "l1" } });
    expect(prismaMock.roadmapLayer.create).not.toHaveBeenCalled();
  });

  it("group: same level already in the layer", async () => {
    prismaMock.roadmapGroup.findMany.mockResolvedValueOnce([{ id: "g1", title: "🟢 Core", level: "core" }]);
    const res = await createGroup(post("/api/v1/roadmaps/groups", { layerId: "l1", title: "Core basics", level: "core" }));
    expect(res.status).toBe(409);
    expect(prismaMock.roadmapGroup.create).not.toHaveBeenCalled();
  });

  it("item: same title at another level of the layer", async () => {
    prismaMock.roadmapItem.findMany.mockResolvedValueOnce([{ id: "i1", title: "Docker Basics", group: { level: "core" } }]);
    const res = await createItem(post("/api/v1/roadmaps/items", { layerId: "l1", level: "advanced", title: "docker  basics" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kind: "item", existing: { id: "i1", level: "core" } });
    expect(prismaMock.roadmapGroup.create).not.toHaveBeenCalled();
    expect(prismaMock.roadmapItem.create).not.toHaveBeenCalled();
  });
});
