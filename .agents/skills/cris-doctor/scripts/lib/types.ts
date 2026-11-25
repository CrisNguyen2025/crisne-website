export type Target = "fe" | "be";
/** ui = FE (components, hooks, pages); next = Next.js server side; rag/worker = FastAPI services */
export type Area = "ui" | "next" | "rag" | "worker" | "other";
export type Severity = "bug" | "risk" | "nit";
export type Mode = "quick" | "full";
export type CheckStatus = "ok" | "warn" | "fail" | "skipped" | "error";

export interface Finding {
  checkId: string;
  severity: Severity;
  /** Repo-relative path; absent for findings about the whole run (e.g. a test suite failing) */
  file?: string;
  line?: number;
  /** Must not contain line numbers or secret values: it is part of the baseline fingerprint */
  message: string;
}

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  findings: Finding[];
  note?: string;
  durationMs: number;
}

export interface SourceFile {
  path: string;
  content: string;
}

export const AREAS_BY_TARGET: Record<Target, Area[]> = {
  fe: ["ui"],
  be: ["next", "rag", "worker"],
};
