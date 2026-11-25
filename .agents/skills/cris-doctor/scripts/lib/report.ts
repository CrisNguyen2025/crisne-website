import type { CheckResult, Finding, Severity } from "./types";

export interface ReportContext {
  date: string;
  commit: string;
  target: string;
  mode: string;
  scope: string;
  since: string | null;
  hasBaseline: boolean;
  includeCrisAi: boolean;
}

const STATUS_ICON: Record<CheckResult["status"], string> = {
  ok: "✅",
  warn: "⚠️",
  fail: "❌",
  skipped: "⏭️",
  error: "💥",
};

const SEVERITY_ORDER: Severity[] = ["bug", "risk", "nit"];
const MAX_PER_CHECK = 40;

function countBy(findings: Finding[], severity: Severity): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function location(finding: Finding): string {
  if (!finding.file) return "(toàn bộ)";
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

export function renderSummaryTable(results: CheckResult[], fresh: Set<Finding>): string {
  const rows = results.map((result) => {
    const newCount = result.findings.filter((finding) => fresh.has(finding)).length;
    return `| ${STATUS_ICON[result.status]} | \`${result.id}\` | ${countBy(result.findings, "bug")} | ${countBy(
      result.findings,
      "risk"
    )} | ${countBy(result.findings, "nit")} | ${newCount} | ${result.note ?? ""} |`;
  });
  return ["| | Check | bug | risk | nit | mới | Ghi chú |", "|---|---|---|---|---|---|---|", ...rows].join("\n");
}

export function renderReport(context: ReportContext, results: CheckResult[], fresh: Set<Finding>): string {
  const all = results.flatMap((result) => result.findings);
  const lines: string[] = [
    `# Cris Doctor: ${context.date}`,
    "",
    `- **Commit:** \`${context.commit}\` · **Target:** \`${context.target}\` · **Mode:** \`${context.mode}\` · **Scope:** \`${context.scope}\``,
    `- **Since:** ${context.since ? `\`${context.since}\`` : "toàn repo"} · **Baseline:** ${
      context.hasBaseline ? "có, cột \"mới\" so với baseline" : "chưa có, mọi finding được tính là mới"
    } · **Cris AI:** ${context.includeCrisAi ? "có quét" : "bỏ qua"}`,
    `- **Tổng:** ${countBy(all, "bug")} bug · ${countBy(all, "risk")} risk · ${countBy(all, "nit")} nit · ${fresh.size} mới`,
    "",
    "## Tóm tắt",
    "",
    renderSummaryTable(results, fresh),
    "",
    "## Finding",
  ];

  for (const severity of SEVERITY_ORDER) {
    const bySeverity = results
      .map((result) => ({ result, findings: result.findings.filter((finding) => finding.severity === severity) }))
      .filter(({ findings }) => findings.length > 0);
    if (bySeverity.length === 0) continue;
    lines.push("", `### ${severity}`);
    for (const { result, findings } of bySeverity) {
      lines.push("", `**\`${result.id}\`** ${result.title} (${findings.length})`, "");
      // New findings first so they survive the cap
      const ordered = [...findings].sort((a, b) => Number(fresh.has(b)) - Number(fresh.has(a)));
      for (const finding of ordered.slice(0, MAX_PER_CHECK)) {
        lines.push(`- ${fresh.has(finding) ? "🆕 " : ""}\`${location(finding)}\`: ${finding.message}`);
      }
      if (ordered.length > MAX_PER_CHECK) {
        lines.push(`- … còn ${ordered.length - MAX_PER_CHECK} finding, xem \`.handoff/doctor/latest.json\``);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
