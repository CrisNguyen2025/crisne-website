import { describe, expect, it } from "vitest";
import {
  checkErrorLeak,
  checkPyRouteAuth,
  checkQueryInLoop,
  checkRagReindex,
} from "../../../.agents/skills/cris-doctor/scripts/lib/be-domain-checks";
import {
  checkArbitraryValue,
  checkDarkVariant,
  checkIconLib,
  checkRawButton,
  checkRawColor,
  checkStaticInlineStyle,
  isDesignSystemFile,
} from "../../../.agents/skills/cris-doctor/scripts/lib/design-checks";

const file = (path: string, content: string) => ({ path, content });
const lines = (findings: Array<{ line?: number }>) => findings.map((f) => f.line);

describe("BE-RAG-REINDEX", () => {
  it("flags a route that writes Topic/Lesson without asking for a reindex", () => {
    const route = "export async function PATCH() {\n  await prisma.roadmapItem.update({ where, data });\n}";
    expect(lines(checkRagReindex(file("app/api/v1/x/route.ts", route)))).toEqual([2]);
    expect(checkRagReindex(file("app/api/v1/x/route.ts", `${route}\nnotifyRoadmapChanged();`))).toEqual([]);
    expect(checkRagReindex(file("app/api/v1/x/route.ts", "await prisma.roadmapItem.findMany();"))).toEqual([]);
  });

  it("covers writes inside a transaction", () => {
    const route = "await prisma.$transaction(async (tx) => { await tx.roadmap.delete({ where }); });";
    expect(checkRagReindex(file("app/api/v1/x/route.ts", route))[0].message).toContain("roadmap");
  });
});

describe("BE-ERROR-LEAK", () => {
  it("flags generic error messages sent to the client, not domain errors", () => {
    const route = [
      "} catch (error) {",
      "  if (error instanceof FeedError) return NextResponse.json({ error: error.message, code: error.code });",
      "  return NextResponse.json(",
      "    { error: (error instanceof Error ? error.message : undefined) || 'Failed' },",
      "    { status: 500 }",
      "  );",
      "}",
      "span.update({ statusMessage: String(error) });",
    ].join("\n");
    expect(lines(checkErrorLeak(file("app/api/x/route.ts", route)))).toEqual([3]);
  });
});

describe("BE-QUERY-IN-LOOP", () => {
  it("flags Prisma calls inside loop bodies only", () => {
    const content = [
      "for (const k of keys) allKeys.add(k);",
      "const rows = await prisma.item.findMany({ where: { id: { in: ids } } });",
      "for (const { id } of rows) {",
      "  await prisma.relation.upsert({ where: { id } });",
      "}",
      "await Promise.all(ids.map(async (id) => tx.item.delete({ where: { id } })));",
    ].join("\n");
    expect(lines(checkQueryInLoop(file("lib/news/x.ts", content)))).toEqual([3, 6]);
  });

  it("skips one-off scripts and client code", () => {
    const loop = "for (const x of xs) { await prisma.a.create({ data: x }); }";
    expect(checkQueryInLoop(file("scripts/migrate.ts", loop))).toEqual([]);
    expect(checkQueryInLoop(file("prisma/seed.ts", loop))).toEqual([]);
    expect(checkQueryInLoop(file("components/x.tsx", loop))).toEqual([]);
  });
});

describe("PY-ROUTE-AUTH", () => {
  it("only allows /health in PUBLIC_PATHS of a central middleware", () => {
    const server = file(
      "svc/server.py",
      [
        'PUBLIC_PATHS = {"/health", "/internal/debug"}',
        '@app.middleware("http")',
        "async def guard(request, call_next):",
        "    if not is_valid_internal_key(request.headers.get('x-internal-key'), key): ...",
      ].join("\n")
    );
    const routes = file("svc/routes.py", '@router.post("/chat")\nasync def chat(): ...');
    const findings = checkPyRouteAuth([server, routes]);
    expect(findings.map((f) => f.message)).toEqual(["Path /internal/debug được miễn kiểm x-internal-key trong PUBLIC_PATHS"]);
  });

  it("requires a key check in each endpoint when there is no middleware", () => {
    const server = file(
      "svc/server.py",
      [
        '    @app.get("/health")',
        "    async def health(): return {}",
        '    @app.post("/internal/wake")',
        "    async def wake(request):",
        "        if not is_valid_internal_key(request.headers.get('x-internal-key'), key): ...",
        '    @app.post("/internal/run")',
        "    async def run(): ...",
      ].join("\n")
    );
    const findings = checkPyRouteAuth([server]);
    expect(findings.map((f) => [f.line, f.message])).toEqual([[6, "Endpoint /internal/run không kiểm x-internal-key"]]);
  });
});

describe("design system checks", () => {
  it("scopes to FE tsx files outside shadcn primitives and ImageResponse files", () => {
    expect(isDesignSystemFile(file("components/news/Card.tsx", ""))).toBe(true);
    expect(isDesignSystemFile(file("components/ui/editor/Toolbar.tsx", ""))).toBe(true);
    expect(isDesignSystemFile(file("components/ui/button.tsx", ""))).toBe(false);
    expect(isDesignSystemFile(file("app/[topicSlug]/opengraph-image.tsx", ""))).toBe(false);
    expect(isDesignSystemFile(file("app/api/x/route.ts", ""))).toBe(false);
  });

  it("flags raw palette classes and literal colours, allowing tokens, SVG artwork and themeColor", () => {
    const content = [
      '<span className="text-rose-500 bg-muted" />',
      '<div className="bg-[#ff0000]" style={{ color: "rgb(0 0 0)" }} />',
      '<path fill="#4285F4" />',
      '{ media: "(prefers-color-scheme: dark)", color: "#161513" },',
      '<i className="text-[var(--status-learning)]" />',
      'const href = "#section";',
    ].join("\n");
    const findings = checkRawColor(file("components/a.tsx", content));
    expect(findings.map((f) => [f.line, f.message.split(":")[0]])).toEqual([
      [1, 'Màu palette thô "text-rose-500"'],
      [2, "Màu viết cứng (hex/rgb/hsl/oklch)"],
      [2, "Màu viết cứng (hex/rgb/hsl/oklch)"],
    ]);
  });

  it("flags dark: variants except prose-invert", () => {
    const content = '<div className="dark:bg-gray-900 dark:prose-invert" />';
    expect(checkDarkVariant(file("components/a.tsx", content)).map((f) => f.message)).toEqual([
      'Variant "dark:bg-gray-900": token đã có giá trị cho .dark',
    ]);
  });

  it("flags numeric arbitrary text, spacing and z-index values only", () => {
    const content = '<p className="text-[0.8125rem] px-[7px] z-[60] w-[320px] text-[var(--status-known)] mt-2" />';
    expect(checkArbitraryValue(file("components/a.tsx", content)).map((f) => f.message.split('"')[1])).toEqual([
      "text-[0.8125rem]",
      "px-[7px]",
      "z-[60]",
    ]);
  });

  it("flags raw buttons and foreign icon libraries", () => {
    const content = 'import { FaX } from "react-icons/fa";\nimport { X } from "lucide-react";\n<button onClick={f}>x</button>\n<Button>ok</Button>';
    expect(lines(checkRawButton(file("components/a.tsx", content)))).toEqual([3]);
    expect(checkIconLib(file("components/a.tsx", content)).map((f) => f.message)).toEqual([
      "Icon từ react-icons/fa: chỉ dùng lucide-react",
    ]);
  });

  it("flags inline styles whose values are all literals", () => {
    const content = [
      '<div style={{ display: "none", zIndex: 10 }} />',
      "<div style={{ width: `${pct}%` }} />",
      "<div style={{ height, opacity: 1 }} />",
      "<div style={{ ...base, color: 'red' }} />",
    ].join("\n");
    expect(lines(checkStaticInlineStyle(file("components/a.tsx", content)))).toEqual([1]);
  });
});
