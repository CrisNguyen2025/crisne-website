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

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) {
      return false;
    }
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

export function writeConfig(
  repoRoot: string,
  outputs: GeneratedOutput[],
  adapters: AgentAdapter[],
  options: WriteOptions = {},
): WriteResult {
  const isCheck = Boolean(options.check);
  const created: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const removed: string[] = [];
  const expectedPaths = new Set(outputs.map(o => o.path));

  for (const out of outputs) {
    const fullPath = path.join(repoRoot, out.path);

    if (out.kind === 'merge-key') {
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

      const isSame = deepEqual(existingObj[out.key], out.value);
      if (isSame) {
        unchanged.push(out.path);
      } else {
        if (fileExisted) {
          changed.push(out.path);
        } else {
          created.push(out.path);
        }

        if (!isCheck) {
          const merged = { ...existingObj, [out.key]: out.value };
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
        }
      }
    } else if (out.kind === 'own') {
      if (!fs.existsSync(fullPath)) {
        created.push(out.path);
        if (!isCheck) {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, out.content, 'utf-8');
        }
      } else {
        const existing = fs.readFileSync(fullPath, 'utf-8');
        if (existing === out.content) {
          unchanged.push(out.path);
        } else {
          changed.push(out.path);
          if (!isCheck) {
            fs.writeFileSync(fullPath, out.content, 'utf-8');
          }
        }
      }
    } else if (out.kind === 'symlink') {
      let stat: fs.Stats | null = null;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        stat = null;
      }

      if (!stat) {
        created.push(out.path);
        if (!isCheck) {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.symlinkSync(out.target, fullPath);
        }
      } else if (stat.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(fullPath);
        if (currentTarget === out.target) {
          unchanged.push(out.path);
        } else {
          changed.push(out.path);
          if (!isCheck) {
            fs.unlinkSync(fullPath);
            fs.symlinkSync(out.target, fullPath);
          }
        }
      } else {
        // Thư mục hoặc file thật
        if (isGitIgnored(repoRoot, out.path)) {
          unchanged.push(out.path);
        } else {
          throw new Error(`Đường dẫn đích "${out.path}" là thư mục/file thật không bị gitignore`);
        }
      }
    }
  }

  // Dọn file cũ và symlink trong managedDirs
  const allManagedDirs = Array.from(new Set(adapters.flatMap(a => a.managedDirs)));
  for (const managedDir of allManagedDirs) {
    const dirPath = path.join(repoRoot, managedDir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryFullPath = path.join(dirPath, entry.name);
      let entryStat: fs.Stats | null = null;
      try {
        entryStat = fs.lstatSync(entryFullPath);
      } catch {
        continue;
      }

      const rel = path.relative(repoRoot, entryFullPath);

      if (entryStat.isSymbolicLink()) {
        const target = fs.readlinkSync(entryFullPath);
        if (target.startsWith('../../.agents/skills/')) {
          // Symlink do adapter tạo trước đây mà không còn trong output (skill bị xoá hoặc bị loại trừ) thì dọn.
          if (!expectedPaths.has(rel)) {
            removed.push(rel);
            if (!isCheck) {
              fs.unlinkSync(entryFullPath);
            }
          }
        }
      } else if (entryStat.isFile() && entry.name.endsWith('.md')) {
        if (!expectedPaths.has(rel)) {
          try {
            const fileContent = fs.readFileSync(entryFullPath, 'utf-8');
            const headLines = fileContent.split('\n', GENERATED_MARKER_SCAN_LINES);
            if (headLines.some(line => line.startsWith(GENERATED_MARKER))) {
              removed.push(rel);
              if (!isCheck) {
                fs.unlinkSync(entryFullPath);
              }
            }
          } catch {
            // bỏ qua nếu không đọc được
          }
        }
      }
    }
  }

  return { created, changed, unchanged, removed };
}
