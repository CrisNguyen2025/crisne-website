import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/roadmap-assistant/me/route";

const request = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/roadmap-assistant/me", { headers });

describe("GET /api/roadmap-assistant/me", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_API_KEY", "machine-key");
    authMock.mockReset();
  });

  it("reports canWrite=false for a reader", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(await res.json()).toEqual({ canWrite: false });
  });

  it("reports canWrite=true with a valid admin key", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(request({ "x-admin-key": "machine-key" }));
    expect(await res.json()).toEqual({ canWrite: true });
  });

  it("reports canWrite=false with a wrong key", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(request({ "x-admin-key": "wrong" }));
    expect(await res.json()).toEqual({ canWrite: false });
  });
});
