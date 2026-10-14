import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Every mutating handler under app/api must reject anonymous callers with 401,
// except routes that are public on purpose (rate limited, see their own tests).
// New routes are discovered from disk, so forgetting a guard fails this test.
const PUBLIC_WRITE_ROUTES = new Set(["chat/route.ts", "chat/feedback/route.ts", "favorites/route.ts"]);
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

// Any data access means the guard did not run first: fail loudly instead of writing.
const forbidden = (name: string) =>
  new Proxy(
    {},
    {
      get(_, key) {
        if (key === "then") return undefined;
        throw new Error(`${name}.${String(key)} touched by an anonymous request`);
      },
    }
  );
const forbiddenModule = (name: string, exports: string[]) =>
  Object.fromEntries([...exports, "default"].map((key) => [key, forbidden(`${name}:${key}`)]));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => forbiddenModule("prisma", ["prisma"]));
vi.mock("@/lib/r2-client", async (importOriginal) =>
  forbiddenModule("r2-client", Object.keys(await importOriginal<object>()))
);
vi.mock("@/lib/notion", async (importOriginal) =>
  forbiddenModule("notion", Object.keys(await importOriginal<object>()))
);
vi.mock("@/lib/image-upload", async (importOriginal) =>
  forbiddenModule("image-upload", Object.keys(await importOriginal<object>()))
);

const API_DIR = path.join(process.cwd(), "app/api");

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const guardedHandlers = findRouteFiles(API_DIR)
  .map((file) => ({ file, rel: path.relative(API_DIR, file).split(path.sep).join("/") }))
  .filter(({ rel }) => !PUBLIC_WRITE_ROUTES.has(rel))
  .flatMap(({ file, rel }) => {
    const source = readFileSync(file, "utf8");
    return MUTATING_METHODS.filter((method) =>
      new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${method}\\b`).test(source)
    ).map((method) => ({ file, rel, method }));
  });

// Dynamic segments: any value works because the guard must reject before reading it
const params = Promise.resolve({ id: "x", slug: "x" });

beforeAll(() => {
  vi.stubEnv("AUTH_OWNER_EMAILS", "owner@example.com");
  vi.stubEnv("ADMIN_API_KEY", "machine-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network call from an anonymous request");
    })
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("write routes reject anonymous callers", () => {
  it("discovers the write routes", () => {
    expect(guardedHandlers.length).toBeGreaterThan(20);
  });

  it.each(guardedHandlers.map((h) => [`${h.method} /api/${h.rel.replace(/\/?route\.ts$/, "")}`, h] as const))(
    "%s → 401",
    async (_, { file, method }) => {
      const mod = (await import(file)) as Record<string, (req: NextRequest, ctx: unknown) => Promise<Response>>;
      const res = await mod[method](
        new NextRequest("http://localhost/api/test", {
          method,
          headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.1" },
          body: "{}",
        }),
        { params }
      );
      expect(res.status).toBe(401);
    }
  );
});
