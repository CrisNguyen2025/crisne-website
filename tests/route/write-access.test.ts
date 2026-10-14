import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Auth.js is replaced by a controllable session; no Google round-trip in tests
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

// Guarded routes must reject before touching storage or Notion
const notionMock = vi.hoisted(() => ({
  addFavorite: vi.fn(async () => ({})),
  removeFavorite: vi.fn(async () => undefined),
  getFavorites: vi.fn(async () => []),
  createPost: vi.fn(async () => ({ id: "post-1" })),
}));
vi.mock("@/lib/notion", () => notionMock);

const storageMock = vi.hoisted(() => ({
  findUnusedStorageFiles: vi.fn(async () => ({ unusedFiles: [] })),
  cleanupUnusedStorageFiles: vi.fn(async () => ({ deletedCount: 0 })),
}));
vi.mock("@/lib/r2-client", () => storageMock);

import { requireWriteAccess } from "@/lib/auth/write-access";
import { POST as createRoadmap } from "@/app/api/v1/roadmaps/route";
import { POST as cleanupStorage } from "@/app/api/storage/cleanup/route";
import { POST as clip } from "@/app/api/v1/clipper/route";
import { POST as addFavorite } from "@/app/api/favorites/route";

const OWNER = "owner@example.com";
let ip = 0;
const request = (url: string, init: { headers?: Record<string, string>; body?: unknown } = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${++ip}`, ...init.headers },
    body: JSON.stringify(init.body ?? {}),
  });

beforeEach(() => {
  vi.stubEnv("AUTH_OWNER_EMAILS", OWNER);
  vi.stubEnv("ADMIN_API_KEY", "machine-key");
  authMock.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("requireWriteAccess", () => {
  it("rejects anonymous requests with 401", async () => {
    const denied = await requireWriteAccess(request("/api/x"));
    expect(denied?.status).toBe(401);
  });

  it("allows the signed-in owner", async () => {
    authMock.mockResolvedValue({ user: { email: OWNER } });
    expect(await requireWriteAccess(request("/api/x"))).toBeNull();
  });

  it("rejects a signed-in user who is not on the allowlist", async () => {
    authMock.mockResolvedValue({ user: { email: "stranger@example.com" } });
    expect((await requireWriteAccess(request("/api/x")))?.status).toBe(401);
  });

  it("allows machines with the admin key", async () => {
    expect(await requireWriteAccess(request("/api/x", { headers: { "x-admin-key": "machine-key" } }))).toBeNull();
  });

  it("fails closed when the session check itself throws (e.g. missing AUTH_SECRET)", async () => {
    authMock.mockRejectedValue(new Error("MissingSecret"));
    expect((await requireWriteAccess(request("/api/x")))?.status).toBe(401);
  });

  it("fails closed when the owner allowlist is empty, even for a signed-in user", async () => {
    vi.stubEnv("AUTH_OWNER_EMAILS", "");
    authMock.mockResolvedValue({ user: { email: OWNER } });
    expect((await requireWriteAccess(request("/api/x")))?.status).toBe(401);
  });
});

describe("guarded write routes", () => {
  it("POST /api/v1/roadmaps rejects anonymous callers (e.g. the Python assistant without a key)", async () => {
    const res = await createRoadmap(request("/api/v1/roadmaps", { body: { title: "x", shortCode: "X", layers: [{}] } }));
    expect(res.status).toBe(401);
  });

  it("POST /api/storage/cleanup never deletes files for anonymous callers", async () => {
    const res = await cleanupStorage(request("/api/storage/cleanup"));
    expect(res.status).toBe(401);
    expect(storageMock.cleanupUnusedStorageFiles).not.toHaveBeenCalled();
  });

  it("POST /api/storage/cleanup runs for the signed-in owner", async () => {
    authMock.mockResolvedValue({ user: { email: OWNER } });
    const res = await cleanupStorage(request("/api/storage/cleanup"));
    expect(res.status).not.toBe(401);
    expect(storageMock.cleanupUnusedStorageFiles).toHaveBeenCalled();
  });
});

describe("clipper (Chrome extension, admin key only)", () => {
  it("rejects requests without ADMIN_API_KEY configured, even with a header (fail-closed)", async () => {
    vi.stubEnv("ADMIN_API_KEY", "");
    const res = await clip(request("/api/v1/clipper", { headers: { "x-admin-key": "" }, body: { title: "t" } }));
    expect(res.status).toBe(401);
    expect(notionMock.createPost).not.toHaveBeenCalled();
  });

  it("accepts the configured key and keeps CORS headers on errors", async () => {
    const res = await clip(request("/api/v1/clipper", { headers: { "x-admin-key": "machine-key" }, body: {} }));
    expect(res.status).toBe(400); // passed auth, failed validation (missing title)
    const unauthorized = await clip(request("/api/v1/clipper", { headers: { "x-admin-key": "wrong" }, body: {} }));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });
});

describe("favorites (public, rate limited)", () => {
  it("stays public but returns 429 after 30 writes from one IP", async () => {
    const send = () =>
      addFavorite(
        new NextRequest("http://localhost/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.77", "X-User-ID": "visitor-1" },
          body: JSON.stringify({ tagId: "tag-1" }),
        })
      );
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await send()).status);

    expect(statuses.slice(0, 30).every((s) => s !== 401 && s !== 429)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
