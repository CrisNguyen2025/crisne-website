/**
 * Checks that run an existing tool (tsc, eslint, knip, ruff, pip-audit, test suites) and parse its output.
 * Parsers are pure functions so they can be tested against captured output.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import type { Finding, Severity } from "./types";

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Set when the binary could not be started at all */
  error?: string;
}

export function runCommand(command: string, args: string[], cwd: string, timeoutMs = 10 * 60_000): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function relative(repoRoot: string, file: string): string {
  return path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
}

export function tempFile(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cris-doctor-")), name);
}

/** Last non-empty lines of a command's output, for a one-line failure summary */
export function tail(output: string, lines = 3): string {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-lines)
    .join(" | ")
    .replace(/\d+(\.\d+)?\s*m?s\b/g, "")
    .slice(0, 300);
}

// ── tsc ────────────────────────────────────────────────────────────────────────

export function parseTscOutput(output: string): Finding[] {
  return [...output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)].map((match) => ({
    checkId: "BUILD-TSC",
    severity: "bug" as const,
    file: match[1].trim(),
    line: Number(match[2]),
    message: `${match[3]}: ${match[4].trim()}`,
  }));
}

// ── eslint ─────────────────────────────────────────────────────────────────────

interface EslintFileResult {
  filePath: string;
  messages: Array<{ ruleId: string | null; severity: number; message: string; line?: number }>;
}

export function parseEslintJson(json: string, repoRoot: string): Finding[] {
  const results = JSON.parse(json) as EslintFileResult[];
  return results.flatMap((result) =>
    result.messages.map((message) => ({
      checkId: "BUILD-ESLINT",
      severity: (message.severity === 2 ? "risk" : "nit") as Severity,
      file: relative(repoRoot, result.filePath),
      line: message.line,
      message: `${message.ruleId ?? "eslint"}: ${message.message}`,
    }))
  );
}

// ── knip ───────────────────────────────────────────────────────────────────────

interface KnipItem {
  name: string;
  line?: number;
}

interface KnipIssue {
  file: string;
  [type: string]: unknown;
}

const KNIP_LABELS: Record<string, { label: string; severity: Severity }> = {
  files: { label: "File không được dùng", severity: "nit" },
  exports: { label: "Export không được dùng", severity: "nit" },
  types: { label: "Type export không được dùng", severity: "nit" },
  enumMembers: { label: "Enum member không được dùng", severity: "nit" },
  duplicates: { label: "Export trùng", severity: "nit" },
  dependencies: { label: "Dependency không được dùng", severity: "nit" },
  devDependencies: { label: "devDependency không được dùng", severity: "nit" },
  unlisted: { label: "Import package chưa khai báo trong package.json", severity: "risk" },
  unresolved: { label: "Import không resolve được", severity: "risk" },
  binaries: { label: "Binary chưa khai báo", severity: "nit" },
};

export function parseKnipJson(json: string): Finding[] {
  const report = JSON.parse(json) as { issues?: KnipIssue[] };
  const findings: Finding[] = [];
  for (const issue of report.issues ?? []) {
    for (const [type, { label, severity }] of Object.entries(KNIP_LABELS)) {
      const items = issue[type];
      if (!Array.isArray(items)) continue;
      for (const raw of items as Array<KnipItem | KnipItem[]>) {
        const group = Array.isArray(raw) ? raw : [raw];
        const first = group[0];
        if (!first) continue;
        findings.push({
          checkId: "DEAD-KNIP",
          severity,
          file: issue.file,
          line: type === "files" ? undefined : first.line,
          message: type === "files" ? label : `${label}: ${group.map((item) => item.name).join(", ")}`,
        });
      }
    }
  }
  return findings;
}

// ── ruff ───────────────────────────────────────────────────────────────────────

/** Pyflakes errors, syntax errors, bugbear, blocking calls in async code, bandit security, plus Sonar-aligned complexity/simplification/async task safety */
export const RUFF_RULES = "F,E9,B,ASYNC,S,C901,SIM,RUF006,RUF019,RUF059,RUF100";

interface RuffMessage {
  code: string | null;
  message: string;
  filename: string;
  location: { row: number };
}

function ruffSeverity(code: string): Severity {
  if (/^(F82[123]|E9)/.test(code)) return "bug";
  if (/^(F|ASYNC|S|RUF006)/.test(code)) return "risk";
  return "nit";
}

export function parseRuffJson(json: string, repoRoot: string): Finding[] {
  const messages = JSON.parse(json) as RuffMessage[];
  return messages.map((message) => {
    const code = message.code ?? "syntax";
    return {
      checkId: "PY-RUFF",
      severity: message.code ? ruffSeverity(code) : "bug",
      file: relative(repoRoot, message.filename),
      line: message.location.row,
      message: `${code}: ${message.message}`,
    };
  });
}

// ── mypy ───────────────────────────────────────────────────────────────────────

/**
 * `--no-site-packages`: third-party imports become Any, so results depend only on our code and the
 * pinned mypy (with its bundled typeshed), not on what happens to be installed in a venv. That keeps
 * the CI ratchet deterministic; checks against library types are out of scope.
 */
export const MYPY_ARGS = [
  "--no-site-packages",
  "--ignore-missing-imports",
  "--python-version",
  "3.13",
  "--show-error-codes",
  "--no-error-summary",
  "--output",
  "json",
];

interface MypyMessage {
  file: string;
  line: number;
  message: string;
  code: string | null;
  severity: string;
}

/** One JSON object per line; paths are relative to the service directory mypy ran in */
export function parseMypyJson(output: string, serviceDir: string): Finding[] {
  return output
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as MypyMessage)
    .filter((message) => message.severity === "error")
    .map((message) => ({
      checkId: "PY-MYPY",
      severity: "risk" as const,
      file: path.join(serviceDir, message.file),
      line: message.line,
      // Messages like "already defined on line 12" would change the fingerprint on every line shift
      message: `${message.code ?? "mypy"}: ${message.message.replace(/\bline \d+/g, "line N")}`,
    }));
}

// ── pip-audit ──────────────────────────────────────────────────────────────────

interface PipAuditReport {
  dependencies?: Array<{
    name: string;
    version?: string;
    vulns?: Array<{ id: string; fix_versions?: string[] }>;
  }>;
}

export function parsePipAuditJson(json: string, requirementsFile: string): Finding[] {
  const report = JSON.parse(json) as PipAuditReport;
  // A package can show up twice when --path sees two dist-info folders for it
  const seen = new Set<string>();
  return (report.dependencies ?? []).flatMap((dependency) =>
    (dependency.vulns ?? []).filter((vuln) => {
      const key = `${dependency.name}|${dependency.version}|${vuln.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((vuln) => ({
      checkId: "DEPS-PIP-AUDIT",
      severity: "risk" as const,
      file: requirementsFile,
      message: `${dependency.name} ${dependency.version ?? ""} có lỗ hổng ${vuln.id}${
        vuln.fix_versions?.length ? `, sửa ở ${vuln.fix_versions.join(", ")}` : ", chưa có bản sửa"
      }`,
    }))
  );
}
