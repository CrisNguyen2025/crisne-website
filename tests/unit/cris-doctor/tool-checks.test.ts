import { describe, expect, it } from "vitest";
import { buildBaseline, newFindings } from "../../../.agents/skills/cris-doctor/scripts/lib/baseline";
import {
  parseEslintJson,
  parseKnipJson,
  parsePipAuditJson,
  parseRuffJson,
  parseTscOutput,
} from "../../../.agents/skills/cris-doctor/scripts/lib/tool-checks";
import type { Finding } from "../../../.agents/skills/cris-doctor/scripts/lib/types";

const ROOT = "/repo";

describe("tool output parsers", () => {
  it("parses tsc errors", () => {
    const output = "app/a.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\nFound 1 error.";
    expect(parseTscOutput(output)).toEqual([
      {
        checkId: "BUILD-TSC",
        severity: "bug",
        file: "app/a.ts",
        line: 12,
        message: "TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ]);
  });

  it("maps eslint errors to risk and warnings to nit with repo-relative paths", () => {
    const json = JSON.stringify([
      {
        filePath: "/repo/app/a.ts",
        messages: [
          { ruleId: "no-console", severity: 2, message: "Unexpected console", line: 3 },
          { ruleId: null, severity: 1, message: "Unused directive", line: 9 },
        ],
      },
    ]);
    expect(parseEslintJson(json, ROOT).map((f) => [f.file, f.severity, f.message])).toEqual([
      ["app/a.ts", "risk", "no-console: Unexpected console"],
      ["app/a.ts", "nit", "eslint: Unused directive"],
    ]);
  });

  it("parses knip issues, including duplicate groups", () => {
    const json = JSON.stringify({
      issues: [
        { file: "components/old.tsx", files: [{ name: "components/old.tsx" }], exports: [] },
        { file: "package.json", dependencies: [{ name: "left-pad", line: 7 }], unlisted: [{ name: "zod", line: 1 }] },
        { file: "lib/x.ts", duplicates: [[{ name: "A", line: 2 }, { name: "default", line: 9 }]] },
      ],
    });
    expect(parseKnipJson(json).map((f) => [f.file, f.line, f.severity, f.message])).toEqual([
      ["components/old.tsx", undefined, "nit", "File không được dùng"],
      ["package.json", 7, "nit", "Dependency không được dùng: left-pad"],
      ["package.json", 1, "risk", "Import package chưa khai báo trong package.json: zod"],
      ["lib/x.ts", 2, "nit", "Export trùng: A, default"],
    ]);
  });

  it("maps ruff codes to severities", () => {
    const json = JSON.stringify([
      { code: "F821", message: "Undefined name `x`", filename: "/repo/svc/a.py", location: { row: 4 } },
      { code: "S608", message: "Possible SQL injection", filename: "/repo/svc/a.py", location: { row: 8 } },
      { code: "B905", message: "zip() without strict", filename: "/repo/svc/a.py", location: { row: 9 } },
    ]);
    expect(parseRuffJson(json, ROOT).map((f) => [f.file, f.severity])).toEqual([
      ["svc/a.py", "bug"],
      ["svc/a.py", "risk"],
      ["svc/a.py", "nit"],
    ]);
  });

  it("parses pip-audit vulnerabilities", () => {
    const json = JSON.stringify({
      dependencies: [
        { name: "httpx", version: "0.28.0", vulns: [] },
        { name: "jinja2", version: "3.1.0", vulns: [{ id: "GHSA-1", fix_versions: ["3.1.5"] }] },
        { name: "jinja2", version: "3.1.0", vulns: [{ id: "GHSA-1", fix_versions: ["3.1.5"] }] },
      ],
    });
    expect(parsePipAuditJson(json, "svc/requirements.txt").map((f) => f.message)).toEqual([
      "jinja2 3.1.0 có lỗ hổng GHSA-1, sửa ở 3.1.5",
    ]);
  });
});

describe("baseline", () => {
  const finding = (message: string, line = 1): Finding => ({
    checkId: "CONV-ESCAPE-HATCH",
    severity: "nit",
    file: "lib/a.ts",
    line,
    message,
  });

  it("treats every finding as new without a baseline", () => {
    const findings = [finding("a")];
    expect(newFindings(findings, null).size).toBe(1);
  });

  it("ignores line shifts but counts duplicates", () => {
    const baseline = buildBaseline(["CONV-ESCAPE-HATCH"], [finding("any")], null, "abc", "2026-11-25");
    const current = [finding("any", 10), finding("any", 20)];
    const fresh = newFindings(current, baseline);
    expect(fresh.size).toBe(1);
    expect(fresh.has(current[1])).toBe(true);
  });

  it("resets the entries of checks that ran again", () => {
    const first = buildBaseline(
      ["CONV-ESCAPE-HATCH", "PY-PYTEST"],
      [finding("any"), { checkId: "PY-PYTEST", severity: "bug", message: "fail" }],
      null,
      "abc",
      "t1"
    );
    const second = buildBaseline(["CONV-ESCAPE-HATCH"], [], first, "def", "t2");
    expect(second.checks["PY-PYTEST"]).toEqual({});
    expect(Object.keys(first.checks["CONV-ESCAPE-HATCH"])).toHaveLength(1);
    expect(second.checks["CONV-ESCAPE-HATCH"]).toEqual({});
  });

  it("never accepts run-level findings, so a failing suite always counts as new", () => {
    const suiteFail: Finding = { checkId: "TEST-VITEST", severity: "bug", message: "yarn test fail" };
    const baseline = buildBaseline(["TEST-VITEST"], [suiteFail], null, "abc", "t1");
    expect(newFindings([suiteFail], baseline).size).toBe(1);
  });

  it("never accepts type errors or hardcoded secrets", () => {
    const typeError: Finding = { checkId: "BUILD-TSC", severity: "bug", file: "app/a.ts", line: 1, message: "TS2300: x" };
    const secret: Finding = { checkId: "SEC-SECRET", severity: "bug", file: "lib/a.ts", line: 1, message: "key" };
    const baseline = buildBaseline(["BUILD-TSC", "SEC-SECRET"], [typeError, secret], null, "abc", "t1");
    expect(newFindings([typeError, secret], baseline).size).toBe(2);
  });

  it("keeps entries of checks that did not run", () => {
    const first = buildBaseline(["DEAD-KNIP"], [{ ...finding("x"), checkId: "DEAD-KNIP" }], null, "abc", "t1");
    const second = buildBaseline(["CONV-ESCAPE-HATCH"], [], first, "def", "t2");
    expect(Object.keys(second.checks["DEAD-KNIP"])).toHaveLength(1);
  });
});
