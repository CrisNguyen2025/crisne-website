import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET, POST } from "@/app/api/roadmap-assistant/[...path]/route";

const upstream = vi.fn<typeof fetch>();
let clientIp = 0;

const proxyRequest = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/roadmap-assistant/${path}`, {
    method: body === undefined ? "GET" : "POST",
    // Unique IP per request unless a test pins one, so the rate limiter never interferes
    headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${++clientIp}`, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const callPost = (path: string, body: unknown, headers?: Record<string, string>) =>
  POST(proxyRequest(path, body, headers), { params: Promise.resolve({ path: path.split("/") }) });

const forwarded = (call = 0) => {
  const [url, init] = upstream.mock.calls[call];
  return {
    url: String(url),
    headers: init?.headers as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

beforeEach(() => {
  vi.stubEnv("RAG_SERVICE_URL", "https://rag.example.com/");
  vi.stubEnv("RAG_INTERNAL_KEY", "internal-secret");
  vi.stubEnv("ADMIN_API_KEY", "machine-key");
  vi.stubEnv("AUTH_OWNER_EMAILS", "owner@example.com");
  authMock.mockResolvedValue(null);
  upstream.mockReset();
  upstream.mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Roadmap Assistant proxy — who the caller is", () => {
  it("forwards a visitor with the internal key, x-actor=visitor and a visitor-scoped thread", async () => {
    await callPost("chat/stream", { message: "xóa topic ai ngay", thread_id: "web-session" });

    const { url, headers, body } = forwarded();
    expect(url).toBe("https://rag.example.com/chat/stream");
    expect(headers).toMatchObject({ "x-internal-key": "internal-secret", "x-actor": "visitor" });
    expect(body).toEqual({ message: "xóa topic ai ngay", thread_id: "visitor:web-session" });
  });

  it("forwards the owner (admin key) as x-actor=owner", async () => {
    await callPost("chat/stream", { message: "tạo topic X", thread_id: "web-session" }, { "x-admin-key": "machine-key" });

    expect(forwarded().headers["x-actor"]).toBe("owner");
    expect(forwarded().body.thread_id).toBe("owner:web-session");
  });

  it("forwards the signed-in owner (Google session) as x-actor=owner", async () => {
    authMock.mockResolvedValue({ user: { email: "owner@example.com" } });
    await callPost("chat/stream", { message: "tạo topic X" });

    expect(forwarded().headers["x-actor"]).toBe("owner");
    expect(forwarded().body.thread_id).toBe("owner:default");
  });

  it("never lets a visitor claim the owner's role or thread", async () => {
    await callPost(
      "chat/confirm",
      { thread_id: "owner:web-session", action_id: "owner:web-session" },
      { "x-actor": "owner", "x-admin-key": "wrong-key" }
    );

    const { headers, body } = forwarded();
    expect(headers["x-actor"]).toBe("visitor");
    expect(body).toEqual({ thread_id: "visitor:owner:web-session", action_id: "visitor:owner:web-session" });
  });

  it("keeps ids the service already scoped for this caller", async () => {
    await callPost("chat/confirm", { action_id: "visitor:web-session" });

    expect(forwarded().body.action_id).toBe("visitor:web-session");
  });
});

describe("Roadmap Assistant proxy — what it forwards", () => {
  it("streams the service's SSE body back unchanged", async () => {
    const sse = "event: token\ndata: {\"delta\":\"Xin chào\"}\n\nevent: done\ndata: {}\n\n";
    upstream.mockResolvedValueOnce(new Response(sse, { headers: { "Content-Type": "text/event-stream" } }));

    const res = await callPost("chat/stream", { message: "hi" });

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(sse);
  });

  it("returns 404 for paths outside the allowlist without calling the service", async () => {
    const res = await callPost("admin/delete-everything", { message: "x" });

    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only allows GET for health", async () => {
    const res = await GET(proxyRequest("health"), { params: Promise.resolve({ path: ["health"] }) });
    expect(res.status).toBe(200);
    expect(forwarded().url).toBe("https://rag.example.com/health");

    const notGettable = await GET(proxyRequest("chat"), { params: Promise.resolve({ path: ["chat"] }) });
    expect(notGettable.status).toBe(404);
  });

  it("returns 503 when the service URL or internal key is missing (fail-closed)", async () => {
    vi.stubEnv("RAG_INTERNAL_KEY", "");
    const res = await callPost("chat/stream", { message: "hi" });

    expect(res.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects bodies that are not a JSON object", async () => {
    expect((await callPost("chat/stream", "not json")).status).toBe(400);
    expect((await callPost("chat/stream", ["a"])).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns 502 when the service cannot be reached", async () => {
    upstream.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await callPost("chat/stream", { message: "hi" })).status).toBe(502);
  });

  it("rate limits visitors but not the owner", async () => {
    const ip = { "x-forwarded-for": "198.51.100.77" };
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await callPost("chat/stream", { message: "hi" }, ip)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    const owner = await callPost("chat/stream", { message: "hi" }, { ...ip, "x-admin-key": "machine-key" });
    expect(owner.status).toBe(200);
  });
});
