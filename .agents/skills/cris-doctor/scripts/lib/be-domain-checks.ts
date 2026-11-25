/**
 * BE checks tied to this repo's own invariants (reindex after writes, internal-key guard of the
 * FastAPI services) plus error leaks and queries inside loops. Pure functions over file contents.
 */
import { classifyArea } from "./files";
import { callText, isApiRoute, lineOf } from "./source-checks";
import type { Finding, SourceFile } from "./types";

// ── BE-RAG-REINDEX ─────────────────────────────────────────────────────────────

const ROADMAP_WRITE = /\b\w+\.(roadmap|roadmapItem)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
const REINDEX_CALL = /\b(notifyRoadmapChanged|requestRagReindex)\b/;

/** Abot answers from an index of Topic/Lesson: a route that writes them must ask for a reindex */
export function checkRagReindex(file: SourceFile): Finding[] {
  if (!isApiRoute(file.path)) return [];
  const write = file.content.match(ROADMAP_WRITE);
  if (!write || REINDEX_CALL.test(file.content)) return [];
  return [
    {
      checkId: "BE-RAG-REINDEX",
      severity: "risk",
      file: file.path,
      line: lineOf(file.content, write.index ?? 0),
      message: `Route ghi ${write[1]} nhưng không gọi notifyRoadmapChanged: Abot đọc dữ liệu cũ tới lần reindex sau`,
    },
  ];
}

// ── BE-ERROR-LEAK ──────────────────────────────────────────────────────────────

/** Message or stack of an arbitrary caught error; domain errors with their own message are fine */
const LEAK_PATTERNS = [
  /instanceof Error\s*\?\s*\w+\.message/,
  /\(\s*\w+\s+as\s+Error\s*\)\.message/,
  /\bString\(\s*(error|err|e)\s*\)/,
  /\b(error|err|e)\.stack\b/,
];

export function checkErrorLeak(file: SourceFile): Finding[] {
  if (!isApiRoute(file.path)) return [];
  const findings: Finding[] = [];
  for (const response of file.content.matchAll(/\b(?:NextResponse|Response)\.json\(|new Response\(/g)) {
    const start = (response.index ?? 0) + response[0].length - 1;
    const call = callText(file.content, start);
    if (!LEAK_PATTERNS.some((pattern) => pattern.test(call))) continue;
    findings.push({
      checkId: "BE-ERROR-LEAK",
      severity: "risk",
      file: file.path,
      line: lineOf(file.content, response.index ?? 0),
      message: "Trả message/stack của lỗi bất kỳ ra client: log ở server và trả thông báo cố định",
    });
  }
  return findings;
}

// ── BE-QUERY-IN-LOOP (N+1) ─────────────────────────────────────────────────────

function blockFrom(content: string, start: number): string {
  let depth = 0;
  for (let i = start; i < content.length && i < start + 20000; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return content.slice(start, start + 20000);
}

/** Body of a for/while loop whose header starts at `headerStart` (the "(") */
function loopBody(content: string, headerStart: number): string {
  const header = callText(content, headerStart);
  let i = headerStart + header.length;
  while (i < content.length && /\s/.test(content[i])) i++;
  if (content[i] === "{") return blockFrom(content, i);
  const end = content.slice(i).search(/;|\n/);
  return content.slice(i, end >= 0 ? i + end : undefined);
}

const PRISMA_CALL = /\b(prisma|tx)\.\w+\.\w+\(/;

/** A Prisma call per loop iteration (N+1); one-off scripts (scripts/, prisma/seed.ts) are not checked */
export function checkQueryInLoop(file: SourceFile): Finding[] {
  if (!/\.tsx?$/.test(file.path) || /^(scripts|prisma)\//.test(file.path)) return [];
  if (classifyArea(file.path, file.content) !== "next") return [];
  const findings: Finding[] = [];
  for (const loop of file.content.matchAll(/\b(?:for\s*(?:await\s*)?|while\s*)\(|\.(?:map|forEach|flatMap)\(\s*async\b/g)) {
    const index = loop.index ?? 0;
    const open = file.content.indexOf("(", index);
    const body = loop[0].startsWith(".") ? callText(file.content, open) : loopBody(file.content, open);
    if (!PRISMA_CALL.test(body)) continue;
    findings.push({
      checkId: "BE-QUERY-IN-LOOP",
      severity: "risk",
      file: file.path,
      line: lineOf(file.content, index),
      message: "Query Prisma trong vòng lặp (N+1): gộp bằng findMany({ where: { id: { in } } }), createMany hoặc một transaction",
    });
  }
  return findings;
}

// ── PY-ROUTE-AUTH ──────────────────────────────────────────────────────────────

const PY_PUBLIC_OK = new Set(["/health"]);
const PY_GUARD = /\b(is_valid_internal_key|require_internal_key)\b/;

/**
 * FastAPI services only serve requests carrying a valid `x-internal-key` (ADR-0001, ADR-0016).
 * With a central HTTP middleware, only its PUBLIC_PATHS skip the key; without one, every endpoint
 * checks the key itself. `/health` stays public for uptime checks.
 */
export function checkPyRouteAuth(serviceFiles: SourceFile[]): Finding[] {
  const python = serviceFiles.filter((file) => file.path.endsWith(".py"));
  const findings: Finding[] = [];
  const middleware = python.find(
    (file) => /@\w+\.middleware\(\s*["']http["']\s*\)/.test(file.content) && PY_GUARD.test(file.content)
  );

  if (middleware) {
    const publicPaths = middleware.content.match(/PUBLIC_PATHS\s*=\s*\{([^}]*)\}/);
    for (const path of [...(publicPaths?.[1] ?? "").matchAll(/["']([^"']+)["']/g)]) {
      if (PY_PUBLIC_OK.has(path[1])) continue;
      findings.push({
        checkId: "PY-ROUTE-AUTH",
        severity: "bug",
        file: middleware.path,
        line: lineOf(middleware.content, publicPaths?.index ?? 0),
        message: `Path ${path[1]} được miễn kiểm x-internal-key trong PUBLIC_PATHS`,
      });
    }
    return findings;
  }

  for (const file of python) {
    const routes = [...file.content.matchAll(/^\s*@\w+\.(?:get|post|put|patch|delete)\(\s*["']([^"']+)["']/gm)];
    routes.forEach((route, i) => {
      if (PY_PUBLIC_OK.has(route[1])) return;
      const body = file.content.slice(route.index ?? 0, routes[i + 1]?.index ?? undefined);
      if (PY_GUARD.test(body) || /Depends\(/.test(body)) return;
      findings.push({
        checkId: "PY-ROUTE-AUTH",
        severity: "bug",
        file: file.path,
        line: lineOf(file.content, (route.index ?? 0) + route[0].indexOf("@")),
        message: `Endpoint ${route[1]} không kiểm x-internal-key`,
      });
    });
  }
  return findings;
}
