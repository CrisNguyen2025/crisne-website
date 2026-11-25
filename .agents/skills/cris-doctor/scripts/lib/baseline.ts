import { createHash } from "crypto";
import type { Finding } from "./types";

export interface Baseline {
  version: 1;
  createdAt: string;
  commit: string;
  /** checkId → fingerprint → number of findings with that fingerprint */
  checks: Record<string, Record<string, number>>;
}

export const NEVER_BASELINED = new Set(["BUILD-TSC", "SEC-SECRET"]);

/** Stable across line shifts: built from check, file and message only */
export function fingerprint(finding: Finding): string {
  return createHash("sha1")
    .update(`${finding.checkId}|${finding.file ?? ""}|${finding.message}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * New baseline from the checks that ran. Checks that did not run this time (e.g. full-mode checks
 * during a quick run) keep their previous entries.
 */
export function buildBaseline(
  ranChecks: string[],
  findings: Finding[],
  previous: Baseline | null,
  commit: string,
  createdAt: string
): Baseline {
  const checks: Baseline["checks"] = { ...(previous?.checks ?? {}) };
  for (const id of ranChecks) checks[id] = {};
  // Never accepted, so they always show up as new: run-level findings (a test suite failing),
  // type errors (CI already requires zero) and hardcoded secrets
  const acceptable = findings.filter((f) => f.file && !NEVER_BASELINED.has(f.checkId));
  for (const finding of acceptable) {
    const bucket = (checks[finding.checkId] ??= {});
    const key = fingerprint(finding);
    bucket[key] = (bucket[key] ?? 0) + 1;
  }
  return { version: 1, createdAt, commit, checks };
}

/**
 * Findings not covered by the baseline. Counts matter: if a file had one `any` and now has two
 * with the same message, one of them is new. Without a baseline every finding is new.
 */
export function newFindings(findings: Finding[], baseline: Baseline | null): Set<Finding> {
  if (!baseline) return new Set(findings);
  const remaining: Record<string, number> = {};
  for (const bucket of Object.values(baseline.checks)) {
    for (const [key, count] of Object.entries(bucket)) remaining[key] = (remaining[key] ?? 0) + count;
  }
  const fresh = new Set<Finding>();
  for (const finding of findings) {
    const key = fingerprint(finding);
    if ((remaining[key] ?? 0) > 0) {
      remaining[key] -= 1;
    } else {
      fresh.add(finding);
    }
  }
  return fresh;
}
