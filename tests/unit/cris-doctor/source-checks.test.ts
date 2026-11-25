import { describe, expect, it } from "vitest";
import { classifyArea, isClientFile, isCrisAiPath } from "../../../.agents/skills/cris-doctor/scripts/lib/files";
import {
  checkCronRoutes,
  checkEffectFetch,
  checkEnvDoc,
  checkEscapeHatch,
  checkFetchTimeout,
  checkFkIndex,
  checkHardcodedSecret,
  checkRequirementsDrift,
  checkRouteAuth,
  checkRouteTests,
  checkRouteValidation,
  checkServerImportInClient,
  checkUseCaseName,
} from "../../../.agents/skills/cris-doctor/scripts/lib/source-checks";

const file = (path: string, content: string) => ({ path, content });

describe("files", () => {
  it("detects a use client directive after comments", () => {
    expect(isClientFile('// header\n/* block */\n"use client";\nimport x from "y";')).toBe(true);
    expect(isClientFile('import x from "y";\n"use client";')).toBe(false);
  });

  it("classifies areas, including client files under lib/", () => {
    expect(classifyArea("app/api/news/route.ts")).toBe("next");
    expect(classifyArea("app/news/page.tsx")).toBe("ui");
    expect(classifyArea("logic/news/newsService.ts")).toBe("ui");
    expect(classifyArea("lib/news/ingest.ts", "export const a = 1;")).toBe("next");
    expect(classifyArea("lib/hooks/x.ts", '"use client";\n')).toBe("ui");
    expect(classifyArea("roadmap-rag-assistant/rag_service/x.py")).toBe("rag");
    expect(classifyArea("news-ingest-worker/news_worker/x.py")).toBe("worker");
    expect(classifyArea("tests/unit/x.test.ts")).toBe("other");
  });

  it("marks Cris AI paths as out of scope", () => {
    expect(isCrisAiPath("app/api/chat/feedback/route.ts")).toBe(true);
    expect(isCrisAiPath("hooks/use-floating-chat.ts")).toBe(true);
    expect(isCrisAiPath("app/api/news/route.ts")).toBe(false);
  });
});

describe("FE checks", () => {
  it("flags runtime server imports in client files but not type-only imports", () => {
    const findings = checkServerImportInClient(
      file(
        "components/a.tsx",
        '"use client";\nimport type { User } from "@prisma/client";\nimport { prisma } from "@/lib/prisma";\nimport { readFile } from "node:fs";\nimport { cn } from "@/lib/utils";'
      )
    );
    expect(findings.map((f) => [f.line, f.message])).toEqual([
      [3, "Client component import module chỉ chạy phía server: @/lib/prisma"],
      [4, "Client component import module chỉ chạy phía server: node:fs"],
    ]);
  });

  it("ignores server imports in server files", () => {
    expect(checkServerImportInClient(file("app/page.tsx", 'import { prisma } from "@/lib/prisma";'))).toEqual([]);
  });

  it("flags fetch only inside a useEffect body", () => {
    const content = [
      '"use client";',
      "useEffect(() => {",
      '  fetch("/api/a");',
      "}, []);",
      "const onClick = () => fetch('/api/b');",
    ].join("\n");
    expect(checkEffectFetch(file("components/a.tsx", content)).map((f) => f.line)).toEqual([3]);
  });

  it("flags use-case loading names once per name", () => {
    const content = "const [isChatLoading] = x;\nif (isChatLoading) {}\nconst isLoading = true;";
    const findings = checkUseCaseName(file("components/a.tsx", content));
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it("requires reasons for escape hatches", () => {
    const content = [
      "const a: any = 1;",
      "// Notion SDK returns untyped blocks",
      "const b: any = 2;",
      "const c = d as any; // third-party shape",
      "// @ts-ignore",
      "// @ts-expect-error -- lexical types lag behind",
      "// eslint-disable-next-line react-hooks/exhaustive-deps",
      "// eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount",
    ].join("\n");
    expect(checkEscapeHatch(file("lib/a.ts", content)).map((f) => f.line)).toEqual([1, 5, 7]);
  });
});

describe("BE checks", () => {
  it("requires a guard in API routes, except NextAuth", () => {
    const unguarded = file("app/api/x/route.ts", "export async function GET() { return Response.json([]); }");
    const guarded = file(
      "app/api/y/route.ts",
      "export async function POST(req) { const denied = await requireWriteAccess(req); }"
    );
    const nextAuth = file("app/api/auth/[...nextauth]/route.ts", "export const { GET, POST } = handlers;");
    expect(checkRouteAuth(unguarded)).toHaveLength(1);
    expect(checkRouteAuth(unguarded)[0].line).toBe(1);
    expect(checkRouteAuth(guarded)).toEqual([]);
    expect(checkRouteAuth(nextAuth)).toEqual([]);
    expect(checkRouteAuth(file("lib/x.ts", "export function GET() {}"))).toEqual([]);
  });

  it("flags body reads without schema validation, ignoring JSON.parse", () => {
    const raw = file("app/api/x/route.ts", "const body = await req.json();\nJSON.parse(text);");
    const validated = file("app/api/x/route.ts", "const body = schema.safeParse(await req.json());");
    expect(checkRouteValidation(raw)).toHaveLength(1);
    expect(checkRouteValidation(validated)).toEqual([]);
  });

  it("finds routes without a test referencing them", () => {
    // Fake route names: real ones here would count as "tested" for the BE-ROUTE-TEST check itself
    const tests = [file("tests/route/a.test.ts", 'import { GET } from "@/app/api/fixture-alpha/route";')];
    const findings = checkRouteTests(["app/api/fixture-alpha/route.ts", "app/api/fixture-beta/route.ts"], tests);
    expect(findings.map((f) => f.file)).toEqual(["app/api/fixture-beta/route.ts"]);
  });

  it("flags server fetch without a signal, skipping relative URLs and client areas", () => {
    const content = [
      "await fetch(url, { signal: AbortSignal.timeout(5000) });",
      "await fetch(url, {",
      "  method: 'POST',",
      "});",
      "await fetch('/api/upload', { method: 'POST' });",
      "await this.fetch(url);",
    ].join("\n");
    expect(checkFetchTimeout(file("lib/news/x.ts", content)).map((f) => f.line)).toEqual([2]);
    expect(checkFetchTimeout(file("components/x.tsx", "fetch(url);"))).toEqual([]);
  });

  it("checks cron paths against route files", () => {
    const vercel = JSON.stringify({ crons: [{ path: "/api/news/cron" }, { path: "/api/gone" }] });
    const findings = checkCronRoutes(vercel, new Set(["app/api/news/cron/route.ts"]));
    expect(findings.map((f) => f.message)).toEqual(["Cron trỏ tới /api/gone nhưng không có route file tương ứng"]);
  });

  it("compares env names with the deploy doc, including pydantic fields and aliases", () => {
    const files = [
      file("lib/a.ts", "const a = process.env.DOCUMENTED_KEY;\nconst b = process.env.MISSING_KEY;\nprocess.env.NODE_ENV;"),
      file("rag/x.py", 'import os\nos.getenv("PY_MISSING")\nos.environ["DOCUMENTED_KEY"]'),
      file(
        "rag/config.py",
        [
          "class Settings(BaseSettings):",
          "    model_config = {}",
          "    tuned_value: int = 3",
          "    internal_api_key: str = Field(",
          "        default='',",
          '        validation_alias=AliasChoices("INTERNAL_API_KEY", "DOCUMENTED_ALIAS"),',
          "    )",
        ].join("\n")
      ),
    ];
    const findings = checkEnvDoc(files, "| `DOCUMENTED_KEY` | ... |\n| DOCUMENTED_ALIAS |");
    expect(findings.map((f) => [f.message.split(" ")[3], f.severity])).toEqual([
      ["MISSING_KEY", "risk"],
      ["PY_MISSING", "risk"],
      ["TUNED_VALUE", "nit"],
    ]);
  });

  it("flags relation fields without a leading index", () => {
    const schema = [
      "model NewsItem {",
      "  id       String  @id",
      "  sourceId String?",
      "  source   NewsSource? @relation(fields: [sourceId], references: [id])",
      "  topicId  String",
      "  topic    Topic @relation(fields: [topicId], references: [id])",
      "  ownerId  String @unique",
      "  owner    Owner @relation(fields: [ownerId], references: [id])",
      "  @@index([topicId, createdAt])",
      "}",
    ].join("\n");
    const findings = checkFkIndex(file("prisma/schema.prisma", schema));
    expect(findings.map((f) => [f.line, f.message.split(" ")[0]])).toEqual([[4, "NewsItem.sourceId"]]);
  });

  it("compares pyproject runtime deps with requirements.txt, allowing dev extras", () => {
    const pyproject = file(
      "svc/pyproject.toml",
      [
        "[project]",
        'dependencies = [',
        '    "fastapi>=0.140.0",',
        '    "pydantic_settings>=2.0.0",',
        '    "httpx>=0.28.0",',
        "]",
        "",
        "[project.optional-dependencies]",
        'dev = ["pytest>=9.0.0"]',
      ].join("\n")
    );
    const requirements = file("svc/requirements.txt", "fastapi>=0.140.0\npydantic-settings>=2.0.0\npytest>=9.0.0\nrequests\n# note");
    expect(checkRequirementsDrift(pyproject, requirements).map((f) => f.message)).toEqual([
      "httpx có trong pyproject.toml nhưng thiếu trong requirements.txt",
      "requests có trong requirements.txt nhưng không khai báo trong pyproject.toml",
    ]);
  });
});

describe("SEC-SECRET", () => {
  it("names the secret kind without printing the value", () => {
    const value = `AIza${"x".repeat(35)}`;
    const findings = checkHardcodedSecret(file("lib/a.ts", `const key = "${value}";`));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).not.toContain(value);
    expect(checkHardcodedSecret(file("lib/a.ts", "const key = process.env.GEMINI_API_KEY;"))).toEqual([]);
  });
});
