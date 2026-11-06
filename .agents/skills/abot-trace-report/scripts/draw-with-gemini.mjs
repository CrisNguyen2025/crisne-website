// Draws the trace diagram with Gemini CLI for the abot-trace-report skill.
//
//   node .agents/skills/abot-trace-report/scripts/draw-with-gemini.mjs <trace.json> <out.html>
//
// Gemini gets the trace on stdin and returns HTML on stdout: it needs no file or shell tool,
// so it runs in the default approval mode, where such tools are not auto-approved.
// The HTML is checked (complete document, no external resources, no script) before it is written.
// Exit 0 and prints the output path on success; exit 1 with the reason otherwise.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 5 * 60_000;

const PROMPT = `Input on stdin is one Langfuse trace of the bot "Abot" (roadmap-assistant), as JSON:
observations in time order, each with depth, name, type, level, startTime, latencyMs, metadata; plus totalLatencyMs.

Return ONE complete, self-contained HTML document and nothing else (no markdown fences, no explanation).
Rules:
- Pure HTML + one inline <style>. No <script>, no external URL of any kind (no CDN, fonts, images, links to other hosts).
- Define your own colors for light mode and for dark mode with @media (prefers-color-scheme: dark). Text must stay readable in both.
- Flat, clean design, system font stack, min font size 12px, width fits 680px, no fixed heights.
- Do not include sessionId, keys, emails or phone numbers.
Content, in this order:
1. Title "Abot trace <first 8 chars of traceId>" and one line: total ms, environment, startTime.
2. Time waterfall: one horizontal bar per observation, x from its startTime offset to the root, width = latencyMs, indented by depth, label "name · type · ms".
   Inside the root, any time not covered by a child observation is a gap: draw it as an amber hatched bar labelled "no span · <ms> ms".
   Bars with level WARNING are amber, ERROR are red, others neutral.
3. Router phases strip for the observation named "intent-router" (skip if absent): 9 cells P0..P8 from metadata "phases.P<n>_<name>",
   each cell shows the phase name and its value (or "—" if empty); highlight the cell named in metadata "phases.decided_by".
   Under it one line: method, act, target, and rules joined by ", ".
4. A small legend for the colors used.`;

function extractHtml(text) {
  const start = text.search(/<!doctype html|<html[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) return null;
  return text.slice(start, end + "</html>".length);
}

function rejectReason(html) {
  if (/<script[\s>]/i.test(html)) return "HTML contains <script>";
  if (/<(link|iframe|object|embed|img|video|audio)[\s>]/i.test(html)) return "HTML loads an external element";
  if (/(src|href)\s*=\s*["']?\s*(https?:)?\/\//i.test(html)) return "HTML references an external URL";
  if (/@import|url\(\s*["']?\s*(https?:)?\/\//i.test(html)) return "CSS loads an external resource";
  return null;
}

function runGemini(input) {
  // Run outside the repo so Gemini does not pull project context files into the prompt
  const cwd = mkdtempSync(join(tmpdir(), "abot-trace-gemini-"));
  return new Promise((resolve, reject) => {
    const child = spawn("gemini", ["--approval-mode", "default", "-o", "text", PROMPT], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`gemini timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(cwd, { recursive: true, force: true });
      if (code === 0) resolve(stdout);
      else reject(new Error(`gemini exited with ${code}: ${stderr.trim().slice(-800)}`));
    });
    child.stdin.end(input);
  });
}

async function main() {
  const [tracePath, outPath] = process.argv.slice(2);
  if (!tracePath || !outPath) throw new Error("Usage: draw-with-gemini.mjs <trace.json> <out.html>");

  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  if (!trace.found) throw new Error("trace has no observations (found: false)");
  // The diagram needs timing and router metadata only; input/output text stays out of Gemini
  const slim = {
    traceId: trace.traceId,
    environment: trace.environment,
    startTime: trace.startTime,
    totalLatencyMs: trace.totalLatencyMs,
    observations: trace.observations.map((obs) => ({
      depth: obs.depth,
      name: obs.name,
      type: obs.type,
      level: obs.level,
      statusMessage: obs.statusMessage,
      startTime: obs.startTime,
      latencyMs: obs.latencyMs,
      model: obs.model,
      metadata: obs.metadata,
    })),
  };

  const html = extractHtml(await runGemini(JSON.stringify(slim)));
  if (!html) throw new Error("gemini did not return a complete HTML document");
  const reason = rejectReason(html);
  if (reason) throw new Error(`rejected: ${reason}`);

  writeFileSync(outPath, html);
  console.log(outPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
