import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() =>
  vi.fn((handler: (req: NextRequest & { auth?: { user?: { email?: string } } | null }) => unknown) => {
    return async (req: NextRequest & { auth?: { user?: { email?: string } } | null }) => {
      return handler(req);
    };
  })
);

vi.mock("@/auth", () => ({ auth: authMock }));

import middleware from "@/middleware";

const createRequest = (
  pathname: string,
  options: {
    headers?: Record<string, string>;
    auth?: { user?: { email?: string } } | null;
  } = {}
) => {
  const req = new NextRequest(`http://localhost:3334${pathname}`, {
    headers: options.headers,
  }) as NextRequest & { auth?: { user?: { email?: string } } | null };
  req.auth = options.auth ?? null;
  return req;
};

describe("Private App Middleware Auth Guard", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_OWNER_BYPASS", "false");
    vi.stubEnv("AUTH_OWNER_EMAILS", "owner@example.com");
  });

  it("redirects unauthenticated page requests to /login with callbackUrl", async () => {
    const req = createRequest("/");
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3334/login?callbackUrl=%2F");
  });

  it("returns 401 JSON for unauthenticated API requests", async () => {
    const req = createRequest("/api/v1/roadmaps");
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("allows unauthenticated access to /login", async () => {
    const req = createRequest("/login");
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects authenticated owner away from /login to /", async () => {
    const req = createRequest("/login", {
      auth: { user: { email: "owner@example.com" } },
    });
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3334/");
  });

  it("allows requests with x-admin-key machine header", async () => {
    const req = createRequest("/api/v1/roadmaps", {
      headers: { "x-admin-key": "secret" },
    });
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(401);
  });

  it("allows requests with x-internal-key machine header", async () => {
    const req = createRequest("/api/roadmap-assistant/chat", {
      headers: { "x-internal-key": "internal" },
    });
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(401);
  });

  it("allows access to public health check", async () => {
    const req = createRequest("/api/roadmap-assistant/health");
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(401);
  });

  it("allows access to pages when authenticated as owner", async () => {
    const req = createRequest("/roadmaps/ai", {
      auth: { user: { email: "owner@example.com" } },
    });
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
  });

  it("allows access in development when DEV_OWNER_BYPASS=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_OWNER_BYPASS", "true");
    const req = createRequest("/");
    const res = (await middleware(req, {} as never)) as Response;
    expect(res.headers.get("location")).toBeNull();
  });
});
