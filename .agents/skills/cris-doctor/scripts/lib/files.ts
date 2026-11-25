import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import type { Area, SourceFile } from "./types";

/** Cris AI is out of scope while Abot is the focus (AGENTS.md "Phạm vi hiện tại") */
const CRIS_AI_PREFIXES = [
  "app/portfolio/",
  "app/api/chat/",
  "components/floating-bot/",
  "hooks/use-floating-chat.ts",
];

const SOURCE_ROOTS = [
  "app/",
  "lib/",
  "logic/",
  "components/",
  "hooks/",
  "prisma/",
  "scripts/",
  "middleware.ts",
  "auth.ts",
  "roadmap-rag-assistant/rag_service/",
  "news-ingest-worker/news_worker/",
];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".py", ".prisma"];

export function isCrisAiPath(file: string): boolean {
  return CRIS_AI_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix));
}

/** True when the file starts with a "use client" directive (comments and blank lines allowed before it) */
export function isClientFile(content: string): boolean {
  const withoutComments = content.replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use client["']/.test(withoutComments);
}

export function classifyArea(file: string, content?: string): Area {
  if (file.startsWith("roadmap-rag-assistant/")) return "rag";
  if (file.startsWith("news-ingest-worker/")) return "worker";
  // logic/ is the browser-side API client layer: only client components import it
  if (file.startsWith("components/") || file.startsWith("hooks/") || file.startsWith("logic/")) return "ui";
  if (file.startsWith("app/")) return file.startsWith("app/api/") ? "next" : "ui";
  if (file.startsWith("lib/")) return content && isClientFile(content) ? "ui" : "next";
  if (
    file.startsWith("prisma/") ||
    file.startsWith("scripts/") ||
    file === "middleware.ts" ||
    file === "auth.ts" ||
    file === "package.json" ||
    file === "vercel.json"
  ) {
    return "next";
  }
  return "other";
}

function isTestPath(file: string): boolean {
  return /(^|\/)tests?\//.test(file) || /\.test\.tsx?$/.test(file) || /(^|\/)test_[^/]+\.py$/.test(file);
}

function isSecretFile(file: string): boolean {
  return /(^|\/)\.env/.test(file);
}

export function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Tracked files plus untracked files git does not ignore */
export function listRepoFiles(repoRoot: string): string[] {
  return git(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .filter((file) => !isSecretFile(file));
}

export function selectSourcePaths(files: string[]): string[] {
  return files.filter(
    (file) =>
      SOURCE_ROOTS.some((root) => file === root || file.startsWith(root)) &&
      SOURCE_EXTENSIONS.includes(path.extname(file)) &&
      !isTestPath(file)
  );
}

export function readSourceFiles(repoRoot: string, paths: string[]): SourceFile[] {
  return paths
    .filter((file) => fs.existsSync(path.join(repoRoot, file)))
    .map((file) => ({ path: file, content: fs.readFileSync(path.join(repoRoot, file), "utf8") }));
}

/** Files that differ from `ref` (committed, staged or unstaged) plus untracked files */
export function changedFilesSince(repoRoot: string, ref: string): Set<string> {
  const diffed = git(repoRoot, ["diff", "--name-only", ref]).split("\n");
  const untracked = git(repoRoot, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  return new Set([...diffed, ...untracked].filter(Boolean));
}
