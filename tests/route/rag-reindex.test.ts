import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: afterMock,
}));

import { notifyRoadmapChanged, requestRagReindex } from "@/lib/roadmap/rag-reindex";

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("RAG_SERVICE_URL", "https://rag.example.com/");
  vi.stubEnv("RAG_INTERNAL_KEY", "internal-secret");
  upstream.mockReset();
  upstream.mockResolvedValue(new Response('{"status":"queued"}', { status: 202 }));
  vi.stubGlobal("fetch", upstream);
  afterMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requestRagReindex", () => {
  it("posts to /internal/reindex with the internal key", async () => {
    await requestRagReindex();
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe("https://rag.example.com/internal/reindex");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-internal-key"]).toBe("internal-secret");
  });

  it("does nothing when the assistant is not configured", async () => {
    vi.stubEnv("RAG_INTERNAL_KEY", "");
    await requestRagReindex();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("never throws: the write already succeeded and the TTL refresh catches up", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    upstream.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(requestRagReindex()).resolves.toBeUndefined();
    upstream.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(requestRagReindex()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("notifyRoadmapChanged", () => {
  it("defers the request until the response is sent", () => {
    notifyRoadmapChanged();
    expect(afterMock).toHaveBeenCalledWith(requestRagReindex);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sends the request right away when after() is unavailable, instead of failing the write", () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    expect(() => notifyRoadmapChanged()).not.toThrow();
    expect(upstream).toHaveBeenCalledOnce();
  });
});

// The assistant indexes roadmaps, layers, groups and items. Every handler that changes them must report it,
// so a new write route that forgets fails here. Triage routes only touch KnowledgeTriage, except approve.
const ROADMAPS_DIR = path.join(process.cwd(), "app/api/v1/roadmaps");
const NOT_INDEXED = new Set([
  "triage/route.ts",
  "triage/[id]/route.ts",
  "triage/[id]/dismiss/route.ts",
  "triage/[id]/generate/route.ts",
  "triage/import/route.ts",
  "triage/golden-set/route.ts",
]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** Body of each exported mutating handler, up to the next export. */
function writeHandlers(source: string): { method: string; body: string }[] {
  const starts = [...source.matchAll(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g)];
  return starts.map((match) => {
    const next = source.indexOf("export ", match.index! + match[0].length);
    return { method: match[1], body: source.slice(match.index, next === -1 ? undefined : next) };
  });
}

const handlers = routeFiles(ROADMAPS_DIR)
  .map((file) => path.relative(ROADMAPS_DIR, file).split(path.sep).join("/"))
  .filter((rel) => !NOT_INDEXED.has(rel))
  .flatMap((rel) =>
    writeHandlers(readFileSync(path.join(ROADMAPS_DIR, rel), "utf8")).map((h) => ({ ...h, rel }))
  );

describe("roadmap write routes report their changes to the assistant", () => {
  it("discovers the write handlers", () => {
    // Topic, lesson, lesson-content, reorder, section rename and triage approve (ADR-0009)
    expect(handlers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(handlers.map((h) => [`${h.method} ${h.rel}`, h] as const))("%s calls notifyRoadmapChanged", (_, h) => {
    expect(h.body).toContain("notifyRoadmapChanged()");
  });
});
