import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgentAdapter, GENERATED_MARKER, GeneratedOutput } from './adapter';

// Header nằm ngay sau frontmatter, nên chỉ cần quét phần đầu file; tránh xoá nhầm file viết tay có nhắc tới chuỗi marker ở thân bài.
const GENERATED_MARKER_SCAN_LINES = 40;

export interface WriteOptions {
  check?: boolean;
}

export interface WriteResult {
  created: string[];
  changed: string[];
  unchanged: string[];
  removed: string[];
}

export function isGitIgnored(repoRoot: string, relativePath: string): boolean {
  try {
    const res = spawnSync('git', ['check-ignore', '-q', relativePath], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return arraysEqual(a, b);
  }
  return objectsEqual(a as Record<string, unknown>, b as Record<string, unknown>);
}

interface WriteTrackers {
  created: string[];
  changed: string[];
  unchanged: string[];
  removed: string[];
}

function writeMergeKeyOutput(
  out: Extract<GeneratedOutput, { kind: 'merge-key' }>,
  fullPath: string,
  isCheck: boolean,
  trackers: WriteTrackers,
): void {
  let existingObj: Record<string, unknown> = {};
  const fileExisted = fs.existsSync(fullPath);
  if (fileExisted) {
    const rawContent = fs.readFileSync(fullPath, 'utf-8');
    try {
      existingObj = JSON.parse(rawContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Không thể parse JSON từ file "${out.path}": ${msg}`);
    }
    if (typeof existingObj !== 'object' || existingObj === null || Array.isArray(existingObj)) {
      throw new Error(`Nội dung file "${out.path}" không phải là JSON object`);
    }
  }

  if (deepEqual(existingObj[out.key], out.value)) {
    trackers.unchanged.push(out.path);
    return;
  }

  if (fileExisted) trackers.changed.push(out.path);
  else trackers.created.push(out.path);

  if (!isCheck) {
    const merged = { ...existingObj, [out.key]: out.value };
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  }
}

function writeOwnOutput(
  out: Extract<GeneratedOutput, { kind: 'own' }>,
  fullPath: string,
  isCheck: boolean,
  trackers: WriteTrackers,
): void {
  if (!fs.existsSync(fullPath)) {
    trackers.created.push(out.path);
    if (!isCheck) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, out.content, 'utf-8');
    }
    return;
  }

  const existing = fs.readFileSync(fullPath, 'utf-8');
  if (existing === out.content) {
    trackers.unchanged.push(out.path);
    return;
  }

  trackers.changed.push(out.path);
  if (!isCheck) {
    fs.writeFileSync(fullPath, out.content, 'utf-8');
  }
}

function writeSymlinkOutput(
  repoRoot: string,
  out: Extract<GeneratedOutput, { kind: 'symlink' }>,
  fullPath: string,
  isCheck: boolean,
  trackers: WriteTrackers,
): void {
  let stat: fs.Stats | null = null;
  try {
    stat = fs.lstatSync(fullPath);
  } catch {
    stat = null;
  }

  if (!stat) {
    trackers.created.push(out.path);
    if (!isCheck) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.symlinkSync(out.target, fullPath);
    }
    return;
  }

  if (!stat.isSymbolicLink()) {
    // Thư mục hoặc file thật
    if (isGitIgnored(repoRoot, out.path)) {
      trackers.unchanged.push(out.path);
      return;
    }
    throw new Error(`Đường dẫn đích "${out.path}" là thư mục/file thật không bị gitignore`);
  }

  if (fs.readlinkSync(fullPath) === out.target) {
    trackers.unchanged.push(out.path);
    return;
  }

  trackers.changed.push(out.path);
  if (!isCheck) {
    fs.unlinkSync(fullPath);
    fs.symlinkSync(out.target, fullPath);
  }
}

function applySingleOutput(
  repoRoot: string,
  out: GeneratedOutput,
  isCheck: boolean,
  trackers: WriteTrackers,
): void {
  const fullPath = path.join(repoRoot, out.path);
  if (out.kind === 'merge-key') {
    writeMergeKeyOutput(out, fullPath, isCheck, trackers);
  } else if (out.kind === 'own') {
    writeOwnOutput(out, fullPath, isCheck, trackers);
  } else {
    writeSymlinkOutput(repoRoot, out, fullPath, isCheck, trackers);
  }
}

function cleanupStaleGeneratedMarkdown(
  entryFullPath: string,
  rel: string,
  isCheck: boolean,
  removed: string[],
): void {
  try {
    const fileContent = fs.readFileSync(entryFullPath, 'utf-8');
    const headLines = fileContent.split('\n', GENERATED_MARKER_SCAN_LINES);
    if (headLines.some(line => line.startsWith(GENERATED_MARKER))) {
      removed.push(rel);
      if (!isCheck) fs.unlinkSync(entryFullPath);
    }
  } catch {
    // bỏ qua nếu không đọc được
  }
}

function cleanupManagedDirectoryEntry(
  repoRoot: string,
  dirPath: string,
  entry: fs.Dirent,
  expectedPaths: Set<string>,
  isCheck: boolean,
  removed: string[],
): void {
  const entryFullPath = path.join(dirPath, entry.name);
  let entryStat: fs.Stats;
  try {
    entryStat = fs.lstatSync(entryFullPath);
  } catch {
    return;
  }

  const rel = path.relative(repoRoot, entryFullPath);
  if (expectedPaths.has(rel)) return;

  if (entryStat.isSymbolicLink()) {
    const target = fs.readlinkSync(entryFullPath);
    // Symlink do adapter tạo trước đây mà không còn trong output (skill bị xoá hoặc bị loại trừ) thì dọn.
    if (target.startsWith('../../.agents/skills/')) {
      removed.push(rel);
      if (!isCheck) fs.unlinkSync(entryFullPath);
    }
    return;
  }

  if (entryStat.isFile() && entry.name.endsWith('.md')) {
    cleanupStaleGeneratedMarkdown(entryFullPath, rel, isCheck, removed);
  }
}

export function writeConfig(
  repoRoot: string,
  outputs: GeneratedOutput[],
  adapters: AgentAdapter[],
  options: WriteOptions = {},
): WriteResult {
  const isCheck = Boolean(options.check);
  const trackers: WriteTrackers = { created: [], changed: [], unchanged: [], removed: [] };
  const expectedPaths = new Set(outputs.map(o => o.path));

  for (const out of outputs) {
    applySingleOutput(repoRoot, out, isCheck, trackers);
  }

  // Dọn file cũ và symlink trong managedDirs
  const allManagedDirs = Array.from(new Set(adapters.flatMap(a => a.managedDirs)));
  for (const managedDir of allManagedDirs) {
    const dirPath = path.join(repoRoot, managedDir);
    if (!fs.existsSync(dirPath)) continue;

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      cleanupManagedDirectoryEntry(repoRoot, dirPath, entry, expectedPaths, isCheck, trackers.removed);
    }
  }

  return trackers;
}
