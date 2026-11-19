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

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": "machine-key" },
    body: JSON.stringify(body),
  });

describe("POST /api/v1/roadmaps topic slug generation", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_API_KEY", "machine-key");
    authMock.mockResolvedValue(null);
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("Backend giúp tôi -> slug backend-giup-toi", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t1", ...data }));
    const res = await createTopic(post("/api/v1/roadmaps", { title: "Backend giúp tôi" }));
    expect(res.status).toBe(201);
    expect(prismaMock.roadmap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "backend-giup-toi" }),
      })
    );
  });

  it("Mặc định -> slug mac-dinh", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t2", ...data }));
    const res = await createTopic(post("/api/v1/roadmaps", { title: "Mặc định" }));
    expect(res.status).toBe(201);
    expect(prismaMock.roadmap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "mac-dinh" }),
      })
    );
  });

  it("Kafka Streams -> slug kafka-streams (khong doi)", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t3", ...data }));
    const res = await createTopic(post("/api/v1/roadmaps", { title: "Kafka Streams" }));
    expect(res.status).toBe(201);
    expect(prismaMock.roadmap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "kafka-streams" }),
      })
    );
  });

  it("title toan ky tu dac biet -> bat dau bang topic-", async () => {
    prismaMock.roadmap.findMany.mockResolvedValueOnce([]);
    prismaMock.roadmap.create.mockImplementationOnce(async ({ data }) => ({ id: "t4", ...data }));
    const res = await createTopic(post("/api/v1/roadmaps", { title: "@@@###$$$%%%" }));
    expect(res.status).toBe(201);
    const createdSlug = prismaMock.roadmap.create.mock.calls[0][0].data.slug;
    expect(createdSlug).toMatch(/^topic-\d+$/);
  });
});
