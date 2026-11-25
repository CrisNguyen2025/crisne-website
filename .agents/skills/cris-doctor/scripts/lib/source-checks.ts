/**
 * Checks that only read file contents. Each one is a pure function so it can be unit tested
 * without running tools. Messages never contain line numbers or matched secret values.
 */
import { classifyArea, isClientFile } from "./files";
import type { Finding, SourceFile } from "./types";

export function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function isTsFile(file: string): boolean {
  return /\.tsx?$/.test(file);
}

// ── FE-SERVER-IMPORT ───────────────────────────────────────────────────────────

const SERVER_MODULES = [
  "@/lib/prisma",
  "@prisma/client",
  "@/auth",
  "@/lib/auth/",
  "@/lib/r2-client",
  "next/headers",
  "server-only",
  "fs",
  "fs/promises",
  "child_process",
  "crypto",
];

function isServerModule(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  return SERVER_MODULES.some((mod) =>
    mod.endsWith("/") ? specifier.startsWith(mod) : specifier === mod || specifier.startsWith(`${mod}/`)
  );
}

/** A "use client" file importing (at runtime, not `import type`) a module that only works on the server */
export function checkServerImportInClient(file: SourceFile): Finding[] {
  if (!isTsFile(file.path) || !isClientFile(file.content)) return [];
  const findings: Finding[] = [];
  const importPattern = /^\s*import\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const match of file.content.matchAll(importPattern)) {
    const [, typeOnly, specifier] = match;
    if (typeOnly || !isServerModule(specifier)) continue;
    findings.push({
      checkId: "FE-SERVER-IMPORT",
      severity: "bug",
      file: file.path,
      line: lineOf(file.content, match.index ?? 0),
      message: `Client component import module chỉ chạy phía server: ${specifier}`,
    });
  }
  return findings;
}

// ── FE-EFFECT-FETCH ────────────────────────────────────────────────────────────

/** Convention: new client code does not fetch inside useEffect (use a server action or Server Component) */
export function checkEffectFetch(file: SourceFile): Finding[] {
  if (!isTsFile(file.path) || !/\buseEffect\(/.test(file.content)) return [];
  const findings: Finding[] = [];
  for (const effect of file.content.matchAll(/\buseEffect\(/g)) {
    const start = (effect.index ?? 0) + "useEffect".length;
    const body = callText(file.content, start);
    for (const call of body.matchAll(/(?<![.\w])fetch\(/g)) {
      findings.push({
        checkId: "FE-EFFECT-FETCH",
        severity: "risk",
        file: file.path,
        line: lineOf(file.content, start + (call.index ?? 0)),
        message: "fetch() trong useEffect: code mới nên dùng server action hoặc Server Component",
      });
    }
  }
  return findings;
}

// ── CONV-USECASE-NAME ──────────────────────────────────────────────────────────

/** Naming follows the single component, not the use-case: `isLoading`, not `isChatLoading` */
export function checkUseCaseName(file: SourceFile): Finding[] {
  if (!isTsFile(file.path)) return [];
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const match of file.content.matchAll(/\bis[A-Z][A-Za-z]*Loading\b/g)) {
    const name = match[0];
    if (name === "isLoading" || seen.has(name)) continue;
    seen.add(name);
    findings.push({
      checkId: "CONV-USECASE-NAME",
      severity: "nit",
      file: file.path,
      line: lineOf(file.content, match.index ?? 0),
      message: `Tên gắn use-case "${name}": đặt theo đúng component/func (ví dụ isLoading)`,
    });
  }
  return findings;
}

// ── CONV-ESCAPE-HATCH ──────────────────────────────────────────────────────────

function hasCommentReason(lines: string[], index: number): boolean {
  const current = lines[index];
  const previous = index > 0 ? lines[index - 1].trim() : "";
  return /\/\/\s*\S/.test(current.replace(/https?:\/\/\S+/g, "")) || /^(\/\/|\/\*|\*)/.test(previous);
}

/** `any`, `@ts-ignore`, `@ts-expect-error` and `eslint-disable` need a written reason (CLAUDE.md) */
export function checkEscapeHatch(file: SourceFile): Finding[] {
  if (!isTsFile(file.path)) return [];
  const lines = file.content.split("\n");
  const findings: Finding[] = [];
  const add = (index: number, message: string) =>
    findings.push({ checkId: "CONV-ESCAPE-HATCH", severity: "nit", file: file.path, line: index + 1, message });

  lines.forEach((raw, index) => {
    const line = raw.replace(/\*\/\s*$/, "").trimEnd();
    if (/@ts-(ignore|expect-error)\s*$/.test(line)) {
      add(index, "@ts-ignore / @ts-expect-error không ghi lý do");
    }
    const disable = line.match(/eslint-disable(?:-next-line|-line)?\b(.*)$/);
    if (disable && !disable[1].includes("--")) {
      add(index, "eslint-disable không ghi lý do (thêm `-- <lý do>`)");
    }
    const code = line.replace(/\/\/.*$/, "");
    if (/(:\s*any\b|\bas\s+any\b|<any>|\bany\[\])/.test(code) && !hasCommentReason(lines, index)) {
      add(index, "Dùng `any` không ghi lý do");
    }
  });
  return findings;
}

// ── SEC-SECRET ─────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { kind: "Langfuse key", pattern: /\b[sp]k-lf-[0-9a-f-]{20,}/ },
  { kind: "Groq key", pattern: /\bgsk_[A-Za-z0-9]{20,}/ },
  { kind: "OpenAI-style key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { kind: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { kind: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "Private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/** Hardcoded credentials. The message names the kind only: the matched value is never printed */
export function checkHardcodedSecret(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  file.content.split("\n").forEach((line, index) => {
    for (const { kind, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          checkId: "SEC-SECRET",
          severity: "bug",
          file: file.path,
          line: index + 1,
          message: `Có chuỗi giống ${kind} viết cứng trong code`,
        });
      }
    }
  });
  return findings;
}

// ── BE-ROUTE-AUTH / BE-ROUTE-VALIDATION ───────────────────────────────────────

export function isApiRoute(file: string): boolean {
  return /^app\/api\/.+\/route\.ts$/.test(file);
}

/** NextAuth's own handler authenticates by itself */
const ROUTE_AUTH_ALLOWLIST = new Set(["app/api/auth/[...nextauth]/route.ts"]);
const ROUTE_GUARD = /\b(requireWriteAccess|hasWriteAccess|hasValidAdminKey|CRON_SECRET)\b/;

/**
 * Defence in depth (ADR-0019): every route runs its own guard instead of relying on middleware alone,
 * so a change in the middleware's rules cannot open a route by accident.
 */
export function checkRouteAuth(file: SourceFile): Finding[] {
  if (!isApiRoute(file.path) || ROUTE_AUTH_ALLOWLIST.has(file.path) || ROUTE_GUARD.test(file.content)) {
    return [];
  }
  const handler = file.content.search(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/);
  return [
    {
      checkId: "BE-ROUTE-AUTH",
      severity: "bug",
      file: file.path,
      line: handler >= 0 ? lineOf(file.content, handler) : undefined,
      message:
        "Route không tự gọi guard (requireWriteAccess/hasWriteAccess/hasValidAdminKey): chỉ dựa vào middleware, middleware đổi luật là route mở",
    },
  ];
}

export function checkRouteValidation(file: SourceFile): Finding[] {
  if (!isApiRoute(file.path)) return [];
  const body = file.content.search(/\.(json|formData)\(\)/);
  if (body < 0 || /(?<!JSON)\.(safeParse|parse|parseAsync|safeParseAsync)\(/.test(file.content)) return [];
  // nit: many routes validate by hand; the full-mode review judges whether that is enough
  return [
    {
      checkId: "BE-ROUTE-VALIDATION",
      severity: "nit",
      file: file.path,
      line: lineOf(file.content, body),
      message: "Route đọc body (.json()/.formData()) nhưng không validate bằng schema (parse/safeParse)",
    },
  ];
}

// ── BE-ROUTE-TEST ──────────────────────────────────────────────────────────────

/** Routes no test file references by their path (`app/api/<...>/route`) */
export function checkRouteTests(routes: string[], testFiles: SourceFile[]): Finding[] {
  return routes
    .filter((route) => {
      const reference = route.replace(/\.ts$/, "");
      return !testFiles.some((test) => test.content.includes(reference));
    })
    .map((route) => ({
      checkId: "BE-ROUTE-TEST",
      severity: "nit" as const,
      file: route,
      message: "Route chưa có test nào trong tests/ import tới",
    }));
}

// ── BE-FETCH-TIMEOUT ───────────────────────────────────────────────────────────

/** Text of the parenthesised call starting at `start` (the "(" or just before it) */
export function callText(content: string, start: number): string {
  let depth = 0;
  for (let i = start; i < content.length && i < start + 3000; i++) {
    if (content[i] === "(") depth++;
    if (content[i] === ")") {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return content.slice(start, start + 3000);
}

/** Server-side fetch() without an AbortSignal can hang a route until the platform kills it */
export function checkFetchTimeout(file: SourceFile): Finding[] {
  if (!isTsFile(file.path) || classifyArea(file.path, file.content) !== "next") return [];
  const findings: Finding[] = [];
  for (const match of file.content.matchAll(/(?<![.\w])fetch\(/g)) {
    const index = match.index ?? 0;
    const call = callText(file.content, index + "fetch".length);
    // A relative URL means browser code that lives in lib/ without "use client"
    if (/\bsignal\b/.test(call) || /^\(\s*["'`]\//.test(call)) continue;
    findings.push({
      checkId: "BE-FETCH-TIMEOUT",
      severity: "risk",
      file: file.path,
      line: lineOf(file.content, index),
      message: "fetch() phía server không có signal/timeout (AbortSignal.timeout)",
    });
  }
  return findings;
}

// ── BE-RAW-SQL ─────────────────────────────────────────────────────────────────

export function checkRawSql(file: SourceFile): Finding[] {
  if (!isTsFile(file.path)) return [];
  return [...file.content.matchAll(/\$(queryRawUnsafe|executeRawUnsafe)\b/g)].map((match) => ({
    checkId: "BE-RAW-SQL",
    severity: "risk" as const,
    file: file.path,
    line: lineOf(file.content, match.index ?? 0),
    message: `${match[1]}: kiểm tra mọi giá trị đi vào câu SQL đều là tham số, không nối chuỗi`,
  }));
}

// ── BE-CRON-ROUTE ──────────────────────────────────────────────────────────────

/** Every cron path in vercel.json must map to an existing app/api route file */
export function checkCronRoutes(vercelJson: string, repoFiles: Set<string>): Finding[] {
  let crons: Array<{ path?: string }> = [];
  try {
    crons = (JSON.parse(vercelJson) as { crons?: Array<{ path?: string }> }).crons ?? [];
  } catch {
    return [{ checkId: "BE-CRON-ROUTE", severity: "bug", file: "vercel.json", message: "vercel.json không parse được" }];
  }
  return crons
    .filter((cron) => cron.path && !repoFiles.has(`app${cron.path.split("?")[0]}/route.ts`))
    .map((cron) => ({
      checkId: "BE-CRON-ROUTE",
      severity: "bug" as const,
      file: "vercel.json",
      message: `Cron trỏ tới ${cron.path} nhưng không có route file tương ứng`,
    }));
}

// ── BE-ENV-DOC ─────────────────────────────────────────────────────────────────

/** Set by the platform or tooling, not by the deploy doc */
const PLATFORM_ENV = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "CI",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "ANALYZE",
  "PORT",
  "HOME",
  "PATH",
  "PYTEST_CURRENT_TEST",
]);

interface EnvUsage {
  names: string[];
  file: string;
  line: number;
  severity: "risk" | "nit";
}

function settingsFieldUsages(file: SourceFile): EnvUsage[] {
  const usages: EnvUsage[] = [];
  const lines = file.content.split("\n");
  let inSettings = false;
  lines.forEach((line, index) => {
    if (/^class \w+\(BaseSettings\):/.test(line)) {
      inSettings = true;
      return;
    }
    if (inSettings && /^\S/.test(line)) inSettings = false;
    if (!inSettings) return;
    const field = line.match(/^ {4}([a-z_][a-z0-9_]*)\s*:/);
    if (!field || field[1] === "model_config") return;
    // A Field(...) may span lines and list env aliases: collect until the next field
    let statement = line;
    for (let next = index + 1; next < lines.length && !/^ {4}[a-z_][a-z0-9_]*\s*[:=]/.test(lines[next]); next++) {
      if (/^\S/.test(lines[next])) break;
      statement += lines[next];
    }
    const aliases = [...statement.matchAll(/["']([A-Z][A-Z0-9_]+)["']/g)].map((m) => m[1]);
    usages.push({ names: [field[1].toUpperCase(), ...aliases], file: file.path, line: index + 1, severity: "nit" });
  });
  return usages;
}

export function collectEnvUsages(file: SourceFile): EnvUsage[] {
  const patterns = file.path.endsWith(".py")
    ? [/os\.(?:environ\.get|getenv)\(\s*["']([A-Z][A-Z0-9_]+)["']/g, /os\.environ\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g]
    : [/process\.env\.([A-Z][A-Z0-9_]+)/g, /process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g];
  const direct = patterns.flatMap((pattern) =>
    [...file.content.matchAll(pattern)].map((match) => ({
      names: [match[1]],
      file: file.path,
      line: lineOf(file.content, match.index ?? 0),
      severity: "risk" as const,
    }))
  );
  return file.path.endsWith(".py") ? [...direct, ...settingsFieldUsages(file)] : direct;
}

/** Env names the code reads but docs/DEPLOY_ENV.md never mentions. Compares names only, never values */
export function checkEnvDoc(files: SourceFile[], deployDoc: string): Finding[] {
  const documented = new Set(deployDoc.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []);
  const reported = new Set<string>();
  const findings: Finding[] = [];
  for (const usage of files.flatMap(collectEnvUsages)) {
    const primary = usage.names[0];
    if (PLATFORM_ENV.has(primary) || usage.names.some((name) => documented.has(name)) || reported.has(primary)) {
      continue;
    }
    reported.add(primary);
    findings.push({
      checkId: "BE-ENV-DOC",
      severity: usage.severity,
      file: usage.file,
      line: usage.line,
      message: `Biến môi trường ${primary} được dùng nhưng không có trong docs/DEPLOY_ENV.md`,
    });
  }
  return findings;
}

// ── DATA-FK-INDEX ──────────────────────────────────────────────────────────────

/** Relation scalar fields not covered by an index whose first column is that field (SQLite/Turso does not index FKs) */
export function checkFkIndex(schema: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const lines = schema.content.split("\n");
  let model: string | null = null;
  let fkFields: Array<{ field: string; line: number }> = [];
  let covered = new Set<string>();

  const flush = () => {
    for (const fk of fkFields) {
      if (covered.has(fk.field)) continue;
      findings.push({
        checkId: "DATA-FK-INDEX",
        severity: "risk",
        file: schema.path,
        line: fk.line,
        message: `${model}.${fk.field} là khoá ngoại nhưng không có @@index/@@unique bắt đầu bằng field này`,
      });
    }
  };

  lines.forEach((line, index) => {
    const start = line.match(/^model\s+(\w+)\s*\{/);
    if (start) {
      model = start[1];
      fkFields = [];
      covered = new Set();
      return;
    }
    if (!model) return;
    if (/^\}/.test(line)) {
      flush();
      model = null;
      return;
    }
    const relation = line.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/);
    if (relation) {
      const first = relation[1].split(",")[0].trim();
      fkFields.push({ field: first, line: index + 1 });
    }
    const blockIndex = line.match(/@@(?:index|unique|id)\(\s*(?:fields:\s*)?\[\s*([A-Za-z0-9_]+)/);
    if (blockIndex) covered.add(blockIndex[1]);
    const inline = line.match(/^\s+(\w+)\s+\S+.*@(?:unique|id)\b/);
    if (inline) covered.add(inline[1]);
  });
  return findings;
}

// ── PY-REQ-DRIFT ───────────────────────────────────────────────────────────────

function packageName(spec: string): string {
  return spec
    .trim()
    .replace(/^["']|["'],?$/g, "")
    .split(/[\s<>=!~;[]/)[0]
    .toLowerCase()
    .replace(/_/g, "-");
}

function tomlArray(toml: string, key: string, section: string): string[] {
  const sectionStart = toml.indexOf(`[${section}]`);
  if (sectionStart < 0) return [];
  const rest = toml.slice(sectionStart + section.length + 2);
  const nextSection = rest.search(/^\[/m);
  const body = nextSection >= 0 ? rest.slice(0, nextSection) : rest;
  const match = body.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => packageName(m[1]));
}

/** `[project].dependencies` and requirements.txt must list the same packages (dev extras may also appear) */
export function checkRequirementsDrift(pyproject: SourceFile, requirements: SourceFile): Finding[] {
  const runtime = tomlArray(pyproject.content, "dependencies", "project");
  if (runtime.length === 0) return [];
  const dev = new Set(tomlArray(pyproject.content, "dev", "project.optional-dependencies"));
  const listed = new Set(
    requirements.content
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line && !line.startsWith("-"))
      .map(packageName)
  );
  const findings: Finding[] = [];
  for (const name of runtime) {
    if (!listed.has(name)) {
      findings.push({
        checkId: "PY-REQ-DRIFT",
        severity: "nit",
        file: requirements.path,
        message: `${name} có trong pyproject.toml nhưng thiếu trong requirements.txt`,
      });
    }
  }
  for (const name of listed) {
    if (!runtime.includes(name) && !dev.has(name)) {
      findings.push({
        checkId: "PY-REQ-DRIFT",
        severity: "nit",
        file: requirements.path,
        message: `${name} có trong requirements.txt nhưng không khai báo trong pyproject.toml`,
      });
    }
  }
  return findings;
}
