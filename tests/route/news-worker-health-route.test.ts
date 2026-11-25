import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

const healthMock = vi.hoisted(() => ({
  checkNewsWorkerHealth: vi.fn(),
}));

vi.mock("@/lib/auth/write-access", () => writeAccessMock);
vi.mock("@/lib/news/worker-health", () => healthMock);

import { GET } from "@/app/api/news/worker-health/route";

describe("GET /api/news/worker-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAccessMock.requireWriteAccess.mockResolvedValue(null);
  });

  it("rejects unauthorized callers with 401 before probing worker", async () => {
    writeAccessMock.requireWriteAccess.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await GET(new NextRequest("http://localhost/api/news/worker-health"));
    expect(res.status).toBe(401);
    expect(healthMock.checkNewsWorkerHealth).not.toHaveBeenCalled();
  });

  it("returns worker health status with no-store cache headers", async () => {
    healthMock.checkNewsWorkerHealth.mockResolvedValueOnce({ configured: true, status: "ok" });
    const res = await GET(new NextRequest("http://localhost/api/news/worker-health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await res.json()).toEqual({ configured: true, status: "ok" });
  });
});
