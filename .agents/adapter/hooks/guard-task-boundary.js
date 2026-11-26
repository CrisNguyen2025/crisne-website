const fs = module.require('fs');
const path = module.require('path');

const MAX_LOCK_AGE_MS = 4 * 60 * 60 * 1000;
const SAFE_TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readActiveLock(repoRoot) {
  const lockPath = path.join(repoRoot, '.handoff', 'runs', '.lock');
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed.task_id !== 'string' || !SAFE_TASK_ID_RE.test(parsed.task_id)) {
    return null;
  }

  let startedMs = typeof parsed.started_at === 'string' ? Date.parse(parsed.started_at) : Number.NaN;
  if (Number.isNaN(startedMs)) {
    try {
      startedMs = fs.statSync(lockPath).mtimeMs;
    } catch {
      return null;
    }
  }

  if (Date.now() - startedMs > MAX_LOCK_AGE_MS) {
    return null;
  }

  return { taskId: parsed.task_id };
}

function stripYamlScalar(raw) {
  return raw
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function parseSpecBoundaries(specContent) {
  const lines = specContent.split(/\r?\n/);
  let fmCount = 0;
  let activeListKey = null;
  let taskType = 'implement';
  const lists = {
    allowed_to_modify: [],
    strictly_forbidden: [],
  };

  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      fmCount += 1;
      if (fmCount >= 2) break;
      continue;
    }
    if (fmCount !== 1) continue;

    if (activeListKey) {
      const itemMatch = /^\s*-\s*(.+)$/.exec(line);
      if (itemMatch) {
        const cleaned = stripYamlScalar(itemMatch[1]);
        if (cleaned) lists[activeListKey].push(cleaned);
        continue;
      }
      activeListKey = null;
    }

    const typeMatch = /^type:\s*(.+)$/.exec(line);
    if (typeMatch) {
      const parsedType = stripYamlScalar(typeMatch[1]);
      if (parsedType) taskType = parsedType;
      continue;
    }

    if (/^\s*allowed_to_modify:\s*(?:#.*)?$/.test(line)) {
      activeListKey = 'allowed_to_modify';
    } else if (/^\s*strictly_forbidden:\s*(?:#.*)?$/.test(line)) {
      activeListKey = 'strictly_forbidden';
    }
  }

  return {
    taskType,
    allowedToModify: lists.allowed_to_modify,
    strictlyForbidden: lists.strictly_forbidden,
  };
}

function matchesGlob(relPath, rawPattern) {
  const normalized = rawPattern.replace(/^\.\//, '');
  const pat = normalized.endsWith('/') ? `${normalized}**` : normalized;
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(relPath);
}

function matchesAny(relPath, patterns) {
  return patterns.some(pat => matchesGlob(relPath, pat));
}

function checkRuntimePath(relPath, taskId) {
  if (
    relPath === '.handoff/runs/.lock' ||
    relPath === `.handoff/specs/${taskId}.md` ||
    relPath === `.handoff/runs/escalations/ESC-${taskId}.md`
  ) {
    return { handled: true };
  }

  if (relPath === `.handoff/runs/${taskId}/baseline.txt`) {
    return {
      handled: true,
      result: {
        decision: 'deny',
        reason: `Không được sửa "${relPath}": baseline.txt do Architect giữ (xem executor.md quy tắc 6).`,
      },
    };
  }

  if (relPath === `.handoff/runs/${taskId}/result.json`) {
    return {
      handled: true,
      result: {
        decision: 'deny',
        reason: `Không ghi trực tiếp vào "${relPath}" bằng công cụ sửa file: hãy ghi vào ".handoff/runs/${taskId}/result.json.tmp" rồi dùng "mv" đổi tên sang "result.json" (xem executor.md mục 6).`,
      },
    };
  }

  if (relPath.startsWith(`.handoff/runs/${taskId}/`)) {
    return { handled: true };
  }

  return { handled: false };
}

async function guardTaskBoundary(payload) {
  const { tool, repoRoot } = payload || {};
  if (!tool || tool.category !== 'edit' || !tool.path || !repoRoot) {
    return undefined;
  }

  const relPath = path
    .relative(repoRoot, path.resolve(repoRoot, tool.path))
    .split(path.sep)
    .join('/');

  if (relPath === '' || relPath === '..' || relPath.startsWith('../')) {
    return undefined;
  }

  const lock = readActiveLock(repoRoot);
  if (!lock) {
    return undefined;
  }

  const runtimeCheck = checkRuntimePath(relPath, lock.taskId);
  if (runtimeCheck.handled) {
    return runtimeCheck.result;
  }

  const specPath = path.join(repoRoot, '.handoff', 'specs', `${lock.taskId}.md`);
  if (!fs.existsSync(specPath)) {
    return undefined;
  }

  const { taskType, allowedToModify, strictlyForbidden } = parseSpecBoundaries(fs.readFileSync(specPath, 'utf-8'));

  if (taskType === 'review') {
    return {
      decision: 'deny',
      reason: `Task "${lock.taskId}" có type "review": chỉ được cập nhật spec và ".handoff/runs/${lock.taskId}/review.md", không được sửa "${relPath}".`,
    };
  }

  if (matchesAny(relPath, strictlyForbidden)) {
    return {
      decision: 'deny',
      reason: `File "${relPath}" nằm trong strictly_forbidden của "${lock.taskId}".`,
    };
  }

  if (!matchesAny(relPath, allowedToModify)) {
    return {
      decision: 'deny',
      reason: `File "${relPath}" nằm ngoài allowed_to_modify của "${lock.taskId}".`,
    };
  }

  return undefined;
}

guardTaskBoundary.readActiveLock = readActiveLock;
module.exports = guardTaskBoundary;
