import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupMswServer } from "../setup/msw";

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth/write-access", () => writeAccessMock);

import { GET } from "@/app/api/news/worker-health/route";

const WORKER_ORIGIN = "https://news-worker.internal.test";

const server = setupMswServer([
  http.get(`${WORKER_ORIGIN}/health`, () =>
    HttpResponse.json({ status: "ok" })
  ),
]);

describe("GET /api/news/worker-health with MSW network interception", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAccessMock.requireWriteAccess.mockResolvedValue(null);
    vi.stubEnv("NEWS_WORKER_URL", `${WORKER_ORIGIN}/`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok when the worker health endpoint returns 200", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/news/worker-health")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await res.json()).toEqual({ configured: true, status: "ok" });
  });

  it("reports offline when the worker returns 503", async () => {
    server.use(
      http.get(
        `${WORKER_ORIGIN}/health`,
        () => new HttpResponse(null, { status: 503 })
      )
    );

    const res = await GET(
      new NextRequest("http://localhost/api/news/worker-health")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, status: "offline" });
  });

  it("reports offline on network transport error", async () => {
    server.use(http.get(`${WORKER_ORIGIN}/health`, () => HttpResponse.error()));

    const res = await GET(
      new NextRequest("http://localhost/api/news/worker-health")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, status: "offline" });
  });

  it("reports unconfigured without calling fetch when NEWS_WORKER_URL is blank", async () => {
    vi.stubEnv("NEWS_WORKER_URL", "");
    const res = await GET(
      new NextRequest("http://localhost/api/news/worker-health")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: false,
      status: "unconfigured",
    });
  });
});
