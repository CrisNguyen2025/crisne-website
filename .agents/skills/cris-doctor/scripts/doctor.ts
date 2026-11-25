#!/usr/bin/env ts-node
/**
 * CRIS DOCTOR: khám sức khoẻ code FE + BE của crisne-website, chỉ đọc, không sửa file.
 *
 *   yarn doctor [--target fe|be|all] [--mode quick|full] [--scope ui,next,rag,worker]
 *               [--since <ref>] [--only CHECK_ID,...] [--include-cris-ai]
 *               [--check] [--update-baseline]
 *
 * Output: .handoff/doctor/DOCTOR-<date>.md, .handoff/doctor/latest.json; baseline ở .handoff/doctor/baseline.json.
 * Plan: .handoff/PLAN-cris-doctor.md
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  changedFilesSince,
  classifyArea,
  git,
  isCrisAiPath,
  listRepoFiles,
  readSourceFiles,
  selectSourcePaths,
} from "./lib/files";
import * as source from "./lib/source-checks";
import * as domain from "./lib/be-domain-checks";
import * as design from "./lib/design-checks";
import { checkCircularImports } from "./lib/import-graph";
import {
  MYPY_ARGS,
  RUFF_RULES,
  parseMypyJson,
  parseEslintJson,
  parseKnipJson,
  parsePipAuditJson,
  parseRuffJson,
  parseTscOutput,
  runCommand,
  tail,
  tempFile,
} from "./lib/tool-checks";
import { buildBaseline, newFindings, type Baseline } from "./lib/baseline";
import { renderReport, renderSummaryTable } from "./lib/report";
import {
  AREAS_BY_TARGET,
  type Area,
  type CheckResult,
  type CheckStatus,
  type Finding,
  type Mode,
  type SourceFile,
  type Target,
} from "./lib/types";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const OUTPUT_DIR = path.join(REPO_ROOT, ".handoff/doctor");
const BASELINE_PATH = path.join(OUTPUT_DIR, "baseline.json");
const PY_SERVICES = [
  { area: "rag" as const, dir: "roadmap-rag-assistant", pkg: "rag_service" },
  { area: "worker" as const, dir: "news-ingest-worker", pkg: "news_worker" },
];
/** ruff and pip-audit come from the rag service's dev extra and also scan the worker */
const PY_TOOLS_BIN = path.join(REPO_ROOT, "roadmap-rag-assistant/.venv/bin");
const LINT_PATHS = ["app", "lib", "logic", "components", "hooks", "scripts", "middleware.ts", "auth.ts"];

// ── Arguments ──────────────────────────────────────────────────────────────────

interface Options {
  targets: Target[];
  targetLabel: string;
  mode: Mode;
  scope: Area[] | null;
  since: string | null;
  only: string[] | null;
  includeCrisAi: boolean;
  check: boolean;
  updateBaseline: boolean;
}

const HELP = `cris-doctor: khám sức khoẻ code FE + BE (chỉ đọc)

  --target fe|be|all     Phần cần quét (mặc định all)
  --mode quick|full      quick: check máy móc; full: thêm test suite, pip-audit (mặc định quick)
  --scope ui,next,rag,worker  Thu hẹp theo vùng code
  --since <ref>          Chỉ giữ finding ở file đổi so với <ref> (kể cả chưa commit)
  --only ID,...          Chỉ chạy các check này
  --include-cris-ai      Quét cả Cris AI (mặc định bỏ qua theo AGENTS.md)
  --check                Exit 1 khi có finding bug/risk mới so với baseline
  --update-baseline      Ghi baseline (chỉ khi --target all, không --scope/--since/--only)`;

function fail(message: string): never {
  console.error(`cris-doctor: ${message}\n\n${HELP}`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    targets: ["fe", "be"],
    targetLabel: "all",
    mode: "quick",
    scope: null,
    since: null,
    only: null,
    includeCrisAi: false,
    check: false,
    updateBaseline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`thiếu giá trị cho ${arg}`);
    switch (arg) {
      case "--target": {
        const target = value();
        if (!["fe", "be", "all"].includes(target)) fail(`--target không hợp lệ: ${target}`);
        options.targets = target === "all" ? ["fe", "be"] : [target as Target];
        options.targetLabel = target;
        break;
      }
      case "--mode": {
        const mode = value();
        if (mode !== "quick" && mode !== "full") fail(`--mode không hợp lệ: ${mode}`);
        options.mode = mode;
        break;
      }
      case "--scope": {
        const scope = value().split(",") as Area[];
        const invalid = scope.filter((area) => !["ui", "next", "rag", "worker"].includes(area));
        if (invalid.length) fail(`--scope không hợp lệ: ${invalid.join(", ")}`);
        options.scope = scope;
        break;
      }
      case "--since":
        options.since = value();
        break;
      case "--only":
        options.only = value().split(",");
        break;
      case "--include-cris-ai":
        options.includeCrisAi = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--update-baseline":
        options.updateBaseline = true;
        break;
      case "--help":
      case "-h":
        console.log(HELP);
        process.exit(0);
        break;
      default:
        fail(`tham số lạ: ${arg}`);
    }
  }
  if (
    options.updateBaseline &&
    (options.targetLabel !== "all" || options.scope || options.since || options.only)
  ) {
    fail("--update-baseline cần quét đủ: --target all, không --scope/--since/--only");
  }
  return options;
}

// ── Check registry ─────────────────────────────────────────────────────────────

interface Context {
  sources: SourceFile[];
  /** Every source file regardless of --target/--scope, for checks that need the whole graph */
  allSources: SourceFile[];
  repoFiles: Set<string>;
  areas: Area[];
}

interface CheckOutcome {
  findings: Finding[];
  note?: string;
  skipped?: string;
  error?: string;
}

interface CheckDef {
  id: string;
  title: string;
  areas: Area[];
  mode: Mode;
  run: (ctx: Context) => CheckOutcome;
}

function perFile(check: (file: SourceFile) => Finding[]): (ctx: Context) => CheckOutcome {
  return (ctx) => ({ findings: ctx.sources.flatMap(check) });
}

function readRepoFile(file: string): SourceFile | null {
  const full = path.join(REPO_ROOT, file);
  return fs.existsSync(full) ? { path: file, content: fs.readFileSync(full, "utf8") } : null;
}

function yarnStatusCheck(args: string[], failureMessage: string, checkId: string): CheckOutcome {
  const result = runCommand("yarn", args, REPO_ROOT);
  if (result.error) return { findings: [], error: result.error };
  if (result.status === 0) return { findings: [] };
  return {
    findings: [{ checkId, severity: checkId === "INTEL-STATUS" ? "risk" : "bug", message: failureMessage }],
    note: tail(result.stdout + result.stderr, 2),
  };
}

const CHECKS: CheckDef[] = [
  {
    id: "BUILD-TSC",
    title: "TypeScript typecheck",
    areas: ["ui", "next"],
    mode: "quick",
    run: () => {
      const result = runCommand("yarn", ["tsc", "--noEmit", "-p", "."], REPO_ROOT);
      if (result.error) return { findings: [], error: result.error };
      const findings = parseTscOutput(result.stdout);
      if (result.status !== 0 && findings.length === 0) return { findings, error: tail(result.stdout + result.stderr) };
      return { findings };
    },
  },
  {
    id: "BUILD-ESLINT",
    title: "ESLint toàn bộ source",
    areas: ["ui", "next"],
    mode: "quick",
    run: () => {
      const output = tempFile("eslint.json");
      const result = runCommand("yarn", ["eslint", "--format", "json", "--output-file", output, ...LINT_PATHS], REPO_ROOT);
      if (result.error) return { findings: [], error: result.error };
      if (!fs.existsSync(output)) return { findings: [], error: tail(result.stdout + result.stderr) };
      return { findings: parseEslintJson(fs.readFileSync(output, "utf8"), REPO_ROOT) };
    },
  },
  {
    id: "DEAD-KNIP",
    title: "Code và dependency không dùng (knip)",
    areas: ["ui", "next"],
    mode: "quick",
    run: () => {
      const result = runCommand("yarn", ["knip", "--reporter", "json", "--no-exit-code"], REPO_ROOT);
      if (result.error) return { findings: [], error: result.error };
      try {
        return { findings: parseKnipJson(result.stdout) };
      } catch {
        return { findings: [], error: tail(result.stdout + result.stderr) };
      }
    },
  },
  {
    id: "PY-RUFF",
    title: `Ruff (${RUFF_RULES})`,
    areas: ["rag", "worker"],
    mode: "quick",
    run: (ctx) => {
      const ruff = path.join(PY_TOOLS_BIN, "ruff");
      if (!fs.existsSync(ruff)) return { findings: [], skipped: 'Chưa có ruff: chạy `pip install -e ".[dev]"` trong roadmap-rag-assistant' };
      const targets = PY_SERVICES.filter((svc) => ctx.areas.includes(svc.area)).map((svc) => `${svc.dir}/${svc.pkg}`);
      const result = runCommand(
        ruff,
        ["check", "--isolated", "--select", RUFF_RULES, "--output-format", "json", ...targets],
        REPO_ROOT
      );
      if (result.error) return { findings: [], error: result.error };
      try {
        return { findings: parseRuffJson(result.stdout, REPO_ROOT) };
      } catch {
        return { findings: [], error: tail(result.stdout + result.stderr) };
      }
    },
  },
  {
    id: "PY-MYPY",
    title: "Mypy (code của repo, thư viện ngoài coi là Any)",
    areas: ["rag", "worker"],
    mode: "quick",
    run: (ctx) => {
      const mypy = path.join(PY_TOOLS_BIN, "mypy");
      if (!fs.existsSync(mypy)) return { findings: [], skipped: 'Chưa có mypy: chạy `pip install -e ".[dev]"` trong roadmap-rag-assistant' };
      const findings: Finding[] = [];
      const errors: string[] = [];
      for (const svc of PY_SERVICES.filter((s) => ctx.areas.includes(s.area))) {
        const cacheDir = path.join(os.tmpdir(), "cris-doctor-mypy", svc.dir);
        const result = runCommand(mypy, [...MYPY_ARGS, "--cache-dir", cacheDir, svc.pkg], path.join(REPO_ROOT, svc.dir));
        // Exit 1 = type errors found; 2 = mypy itself failed (bad flag, syntax error it cannot parse)
        if (result.error || result.status === 2) {
          errors.push(`${svc.dir}: ${result.error ?? tail(result.stderr || result.stdout, 1)}`);
          continue;
        }
        findings.push(...parseMypyJson(result.stdout, svc.dir));
      }
      return { findings, error: errors.join(" · ") || undefined };
    },
  },
  {
    id: "CIRCULAR-IMPORT",
    title: "Không import vòng (TS, chỉ import lúc chạy)",
    areas: ["ui", "next"],
    mode: "quick",
    run: (ctx) => ({ findings: checkCircularImports(REPO_ROOT, ctx.allSources) }),
  },
  {
    id: "DATA-SCHEMA-SQL",
    title: "Schema SQL fixture khớp Prisma",
    areas: ["next", "rag"],
    mode: "quick",
    run: () => yarnStatusCheck(["test:schema-sql", "--check"], "Schema SQL fixture lệch prisma/schema.prisma", "DATA-SCHEMA-SQL"),
  },
  {
    id: "INTEL-STATUS",
    title: "cris-workspace-map khớp code",
    areas: ["ui", "next", "rag", "worker"],
    mode: "quick",
    run: () => yarnStatusCheck(["intel", "status"], "cris-workspace-map.json lệch code (yarn intel status)", "INTEL-STATUS"),
  },
  {
    id: "BE-ROUTE-AUTH",
    title: "Route API tự kiểm quyền",
    areas: ["next"],
    mode: "quick",
    run: perFile(source.checkRouteAuth),
  },
  {
    id: "BE-ROUTE-VALIDATION",
    title: "Route API validate body",
    areas: ["next"],
    mode: "quick",
    run: perFile(source.checkRouteValidation),
  },
  {
    id: "BE-ROUTE-TEST",
    title: "Route API có test",
    areas: ["next"],
    mode: "quick",
    run: (ctx) => {
      const testFiles = readSourceFiles(
        REPO_ROOT,
        [...ctx.repoFiles].filter((file) => file.startsWith("tests/") && /\.test\.tsx?$/.test(file))
      );
      const routes = ctx.sources.map((file) => file.path).filter(source.isApiRoute);
      return { findings: source.checkRouteTests(routes, testFiles) };
    },
  },
  {
    id: "BE-FETCH-TIMEOUT",
    title: "fetch phía server có timeout",
    areas: ["next"],
    mode: "quick",
    run: perFile(source.checkFetchTimeout),
  },
  { id: "BE-RAW-SQL", title: "SQL raw unsafe", areas: ["next"], mode: "quick", run: perFile(source.checkRawSql) },
  {
    id: "BE-CRON-ROUTE",
    title: "Cron trong vercel.json trỏ tới route có thật",
    areas: ["next"],
    mode: "quick",
    run: (ctx) => {
      const vercel = readRepoFile("vercel.json");
      return { findings: vercel ? source.checkCronRoutes(vercel.content, ctx.repoFiles) : [] };
    },
  },
  {
    id: "BE-ENV-DOC",
    title: "Env dùng trong code có trong DEPLOY_ENV.md",
    areas: ["ui", "next", "rag", "worker"],
    mode: "quick",
    run: (ctx) => {
      const doc = readRepoFile("docs/DEPLOY_ENV.md");
      if (!doc) return { findings: [], skipped: "Không có docs/DEPLOY_ENV.md" };
      return { findings: source.checkEnvDoc(ctx.sources, doc.content) };
    },
  },
  {
    id: "DATA-FK-INDEX",
    title: "Khoá ngoại có index",
    areas: ["next"],
    mode: "quick",
    run: () => {
      const schema = readRepoFile("prisma/schema.prisma");
      return { findings: schema ? source.checkFkIndex(schema) : [] };
    },
  },
  {
    id: "PY-REQ-DRIFT",
    title: "pyproject.toml khớp requirements.txt",
    areas: ["rag", "worker"],
    mode: "quick",
    run: (ctx) => ({
      findings: PY_SERVICES.filter((svc) => ctx.areas.includes(svc.area)).flatMap((svc) => {
        const pyproject = readRepoFile(`${svc.dir}/pyproject.toml`);
        const requirements = readRepoFile(`${svc.dir}/requirements.txt`);
        return pyproject && requirements ? source.checkRequirementsDrift(pyproject, requirements) : [];
      }),
    }),
  },
  {
    id: "FE-SERVER-IMPORT",
    title: "Client component không import code server",
    areas: ["ui"],
    mode: "quick",
    run: perFile(source.checkServerImportInClient),
  },
  {
    id: "FE-EFFECT-FETCH",
    title: "Không fetch trong useEffect",
    areas: ["ui"],
    mode: "quick",
    run: perFile(source.checkEffectFetch),
  },
  {
    id: "CONV-USECASE-NAME",
    title: "Tên không gắn use-case",
    areas: ["ui", "next"],
    mode: "quick",
    run: perFile(source.checkUseCaseName),
  },
  {
    id: "CONV-ESCAPE-HATCH",
    title: "any / ts-ignore / eslint-disable có lý do",
    areas: ["ui", "next"],
    mode: "quick",
    run: perFile(source.checkEscapeHatch),
  },
  {
    id: "SEC-SECRET",
    title: "Không có secret viết cứng",
    areas: ["ui", "next", "rag", "worker"],
    mode: "quick",
    run: perFile(source.checkHardcodedSecret),
  },
  {
    id: "BE-RAG-REINDEX",
    title: "Route ghi Topic/Lesson gọi reindex cho Abot",
    areas: ["next"],
    mode: "quick",
    run: perFile(domain.checkRagReindex),
  },
  {
    id: "BE-ERROR-LEAK",
    title: "Không trả chi tiết lỗi nội bộ ra client",
    areas: ["next"],
    mode: "quick",
    run: perFile(domain.checkErrorLeak),
  },
  {
    id: "BE-QUERY-IN-LOOP",
    title: "Không query Prisma trong vòng lặp (N+1)",
    areas: ["next"],
    mode: "quick",
    run: perFile(domain.checkQueryInLoop),
  },
  {
    id: "PY-ROUTE-AUTH",
    title: "Endpoint FastAPI kiểm x-internal-key",
    areas: ["rag", "worker"],
    mode: "quick",
    run: (ctx) => ({
      findings: PY_SERVICES.filter((svc) => ctx.areas.includes(svc.area)).flatMap((svc) =>
        domain.checkPyRouteAuth(ctx.sources.filter((file) => file.path.startsWith(`${svc.dir}/${svc.pkg}/`)))
      ),
    }),
  },
  {
    id: "DS-RAW-COLOR",
    title: "Màu qua token (docs/design-system.md)",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkRawColor),
  },
  {
    id: "DS-DARK-VARIANT",
    title: "Không viết dark: trong component",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkDarkVariant),
  },
  {
    id: "DS-ARBITRARY-VALUE",
    title: "Không cỡ chữ/spacing/z-index tuỳ ý",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkArbitraryValue),
  },
  {
    id: "DS-RAW-BUTTON",
    title: "Nút dùng <Button>",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkRawButton),
  },
  {
    id: "DS-STATIC-INLINE-STYLE",
    title: "Inline style chỉ cho giá trị runtime",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkStaticInlineStyle),
  },
  {
    id: "DS-ICON-LIB",
    title: "Icon chỉ từ lucide-react",
    areas: ["ui"],
    mode: "quick",
    run: perFile(design.checkIconLib),
  },
  {
    id: "TEST-VITEST",
    title: "Vitest pass",
    areas: ["ui", "next"],
    mode: "full",
    run: () => yarnStatusCheck(["test"], "yarn test fail", "TEST-VITEST"),
  },
  {
    id: "PY-PYTEST",
    title: "Pytest của service Python pass",
    areas: ["rag", "worker"],
    mode: "full",
    run: (ctx) => {
      const findings: Finding[] = [];
      const notes: string[] = [];
      for (const svc of PY_SERVICES.filter((s) => ctx.areas.includes(s.area))) {
        const python = path.join(REPO_ROOT, svc.dir, ".venv/bin/python");
        if (!fs.existsSync(python)) {
          notes.push(`${svc.dir}: chưa có .venv`);
          continue;
        }
        const result = runCommand(python, ["-m", "pytest", "-q"], path.join(REPO_ROOT, svc.dir));
        if (result.status !== 0) {
          findings.push({ checkId: "PY-PYTEST", severity: "bug", message: `pytest của ${svc.dir} fail` });
          notes.push(`${svc.dir}: ${tail(result.stdout + result.stderr, 1)}`);
        }
      }
      return { findings, note: notes.join(" · ") || undefined };
    },
  },
  {
    id: "DEPS-PIP-AUDIT",
    title: "Lỗ hổng dependency Python (pip-audit)",
    areas: ["rag", "worker"],
    mode: "full",
    run: (ctx) => {
      const pipAudit = path.join(PY_TOOLS_BIN, "pip-audit");
      if (!fs.existsSync(pipAudit)) return { findings: [], skipped: 'Chưa có pip-audit: chạy `pip install -e ".[dev]"` trong roadmap-rag-assistant' };
      const findings: Finding[] = [];
      const errors: string[] = [];
      for (const svc of PY_SERVICES.filter((s) => ctx.areas.includes(s.area))) {
        const requirements = `${svc.dir}/requirements.txt`;
        const python = path.join(REPO_ROOT, svc.dir, ".venv/bin/python");
        if (!fs.existsSync(python)) {
          errors.push(`${svc.dir}: chưa có .venv`);
          continue;
        }
        // Audit what is installed in the service's .venv: `pip-audit -r` builds a temp venv,
        // which needs ensurepip and fails on some machines
        const sitePackages = runCommand(python, ["-c", "import sysconfig; print(sysconfig.get_paths()['purelib'])"], REPO_ROOT)
          .stdout.trim();
        const result = runCommand(pipAudit, ["--path", sitePackages, "-f", "json", "--progress-spinner", "off"], REPO_ROOT);
        try {
          findings.push(...parsePipAuditJson(result.stdout, requirements));
        } catch {
          errors.push(`${svc.dir}: ${tail(result.stderr || result.stdout, 1)}`);
        }
      }
      return { findings, error: errors.join(" · ") || undefined };
    },
  },
];

// ── Run ────────────────────────────────────────────────────────────────────────

function statusOf(outcome: CheckOutcome, findings: Finding[]): CheckStatus {
  if (outcome.skipped) return "skipped";
  if (outcome.error) return "error";
  if (findings.some((finding) => finding.severity === "bug")) return "fail";
  return findings.length > 0 ? "warn" : "ok";
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const targetAreas = options.targets.flatMap((target) => AREAS_BY_TARGET[target]);
  const areas = options.scope ? targetAreas.filter((area) => options.scope?.includes(area)) : targetAreas;
  if (areas.length === 0) fail("--scope không nằm trong --target đã chọn");

  const repoFileList = listRepoFiles(REPO_ROOT);
  const repoFiles = new Set(repoFileList);
  const allSources = readSourceFiles(REPO_ROOT, selectSourcePaths(repoFileList));
  const contentByPath = new Map(allSources.map((file) => [file.path, file.content]));
  const areaOf = (file: string) => classifyArea(file, contentByPath.get(file));
  const changed = options.since ? changedFilesSince(REPO_ROOT, options.since) : null;

  const keep = (finding: Finding): boolean => {
    if (!finding.file) return true;
    if (!options.includeCrisAi && isCrisAiPath(finding.file)) return false;
    if (changed && !changed.has(finding.file)) return false;
    const area = areaOf(finding.file);
    // Files outside the known areas (e.g. package.json findings) follow the BE side
    return areas.includes(area === "other" ? "next" : area);
  };

  const ctx: Context = {
    sources: allSources.filter((file) => areas.includes(areaOf(file.path))),
    allSources,
    repoFiles,
    areas,
  };

  const selected = CHECKS.filter(
    (check) =>
      check.areas.some((area) => areas.includes(area)) &&
      (options.mode === "full" || check.mode === "quick") &&
      (!options.only || options.only.includes(check.id))
  );
  if (options.only) {
    const unknown = options.only.filter((id) => !CHECKS.some((check) => check.id === id));
    if (unknown.length) fail(`--only có check không tồn tại: ${unknown.join(", ")}`);
  }

  const results: CheckResult[] = selected.map((check) => {
    const started = Date.now();
    process.stderr.write(`▶ ${check.id} … `);
    let outcome: CheckOutcome;
    try {
      outcome = check.run(ctx);
    } catch (error) {
      outcome = { findings: [], error: error instanceof Error ? error.message : String(error) };
    }
    const findings = outcome.findings.filter(keep);
    const result: CheckResult = {
      id: check.id,
      title: check.title,
      status: statusOf(outcome, findings),
      findings,
      note: outcome.skipped ?? outcome.error ?? outcome.note,
      durationMs: Date.now() - started,
    };
    process.stderr.write(`${result.status} (${findings.length}, ${Math.round(result.durationMs / 100) / 10}s)\n`);
    return result;
  });

  const baseline: Baseline | null = fs.existsSync(BASELINE_PATH)
    ? (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline)
    : null;
  const findings = results.flatMap((result) => result.findings);
  const fresh = newFindings(findings, baseline);
  const commit = git(REPO_ROOT, ["rev-parse", "--short", "HEAD"]).trim();
  const date = new Date().toISOString().slice(0, 10);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, `DOCTOR-${date}.md`);
  const context = {
    date,
    commit,
    target: options.targetLabel,
    mode: options.mode,
    scope: options.scope?.join(",") ?? areas.join(","),
    since: options.since,
    hasBaseline: Boolean(baseline),
    includeCrisAi: options.includeCrisAi,
  };
  fs.writeFileSync(reportPath, renderReport(context, results, fresh));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "latest.json"),
    `${JSON.stringify({ context, results: results.map((r) => ({ ...r, findings: r.findings.map((f) => ({ ...f, isNew: fresh.has(f) })) })) }, null, 2)}\n`
  );

  if (options.updateBaseline) {
    const next = buildBaseline(
      results.filter((result) => result.status !== "error" && result.status !== "skipped").map((result) => result.id),
      findings,
      baseline,
      commit,
      new Date().toISOString()
    );
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  }

  console.log(`\n${renderSummaryTable(results, fresh)}\n`);
  console.log(`Report: ${path.relative(REPO_ROOT, reportPath)}`);
  if (options.updateBaseline) console.log(`Baseline: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);

  if (options.check) {
    const blocking = findings.filter((finding) => fresh.has(finding) && finding.severity !== "nit");
    if (!baseline) console.log("Chưa có baseline: mọi finding được tính là mới.");
    if (blocking.length > 0) {
      console.log(`❌ ${blocking.length} finding bug/risk mới so với baseline.`);
      process.exit(1);
    }
    console.log("✅ Không có finding bug/risk mới.");
  }
}

main();
