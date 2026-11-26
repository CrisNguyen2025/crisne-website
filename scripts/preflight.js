const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_LOCK_AGE_MS = 4 * 60 * 60 * 1000;
const MIN_DISK_FAIL_BYTES = 512 * 1024 * 1024;
const MIN_DISK_WARN_BYTES = 2 * 1024 * 1024 * 1024;

function readTrimmed(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    return null;
  }
}

function parseMajorMinor(raw) {
  const token = String(raw || '').trim().split(/\s+/).pop() || '';
  const [majStr, minStr] = token.replace(/^v/i, '').split('.');
  if (!majStr || !minStr || !/^\d+$/.test(majStr) || !/^\d+$/.test(minStr)) return null;
  const major = Number(majStr);
  const minor = Number(minStr);
  return { major, minor, text: `${major}.${minor}` };
}

function formatGiB(bytes) {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function checkNodeRuntime(repoRoot, nodeVersion = process.versions.node) {
  const expectedRaw = readTrimmed(path.join(repoRoot, '.nvmrc')) || '22';
  const expectedMajor = Number((expectedRaw.match(/\d+/) || ['22'])[0]);
  const actualMajor = Number((String(nodeVersion).match(/\d+/) || ['0'])[0]);
  if (actualMajor < expectedMajor) {
    return { id: 'node', status: 'fail', detail: `v${nodeVersion} (< .nvmrc ${expectedMajor})` };
  }
  const exactNote = actualMajor === expectedMajor ? '' : ` (khuyến nghị ${expectedMajor})`;
  return { id: 'node', status: 'ok', detail: `v${nodeVersion}${exactNote}` };
}

function checkPythonService(repoRoot, serviceDir, id) {
  const svcRoot = path.join(repoRoot, serviceDir);
  const pyBin = path.join(svcRoot, '.venv', 'bin', 'python');
  if (!fs.existsSync(pyBin)) {
    return { id, status: 'fail', detail: `thiếu ${serviceDir}/.venv/bin/python` };
  }

  const expected = readTrimmed(path.join(svcRoot, '.python-version')) || '3.13';
  try {
    const output = execFileSync(pyBin, ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
    const parsed = parseMajorMinor(output);
    if (!parsed) {
      return { id, status: 'warn', detail: output || 'không đọc được version Python' };
    }
    if (parsed.text !== expected) {
      return { id, status: 'warn', detail: `${output} (kỳ vọng ${expected})` };
    }
    return { id, status: 'ok', detail: output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id, status: 'fail', detail: `lỗi chạy ${serviceDir}/.venv: ${msg}` };
  }
}

function checkDiskSpace(repoRoot) {
  if (typeof fs.statfsSync !== 'function') {
    return { id: 'disk-space', status: 'warn', detail: 'statfsSync không khả dụng' };
  }
  try {
    const stats = fs.statfsSync(repoRoot);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < MIN_DISK_FAIL_BYTES) {
      return { id: 'disk-space', status: 'fail', detail: `còn ${formatGiB(freeBytes)} (< 0.50 GiB)` };
    }
    if (freeBytes < MIN_DISK_WARN_BYTES) {
      return { id: 'disk-space', status: 'warn', detail: `còn ${formatGiB(freeBytes)} (< 2.00 GiB)` };
    }
    return { id: 'disk-space', status: 'ok', detail: `còn trống ${formatGiB(freeBytes)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id: 'disk-space', status: 'warn', detail: msg };
  }
}

function inspectHandoffLock(repoRoot, nowMs = Date.now()) {
  const lockPath = path.join(repoRoot, '.handoff', 'runs', '.lock');
  if (!fs.existsSync(lockPath)) {
    return { id: 'handoff-lock', status: 'ok', detail: 'không có lock' };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch {
    return { id: 'handoff-lock', status: 'warn', detail: 'lock hỏng JSON — hỏi Dev trước khi xoá' };
  }

  const taskId = parsed && typeof parsed.task_id === 'string' ? parsed.task_id : 'unknown';
  let startedMs = parsed && typeof parsed.started_at === 'string' ? Date.parse(parsed.started_at) : Number.NaN;
  if (Number.isNaN(startedMs)) {
    try {
      startedMs = fs.statSync(lockPath).mtimeMs;
    } catch {
      startedMs = Number.NaN;
    }
  }

  if (Number.isNaN(startedMs)) {
    return { id: 'handoff-lock', status: 'warn', detail: `lock "${taskId}" thiếu mốc thời gian` };
  }

  const ageHours = ((nowMs - startedMs) / (60 * 60 * 1000)).toFixed(1);
  if (nowMs - startedMs > MAX_LOCK_AGE_MS) {
    return {
      id: 'handoff-lock',
      status: 'warn',
      detail: `lock mồ côi "${taskId}" (${ageHours}h > 4h) — hỏi Dev trước khi xoá`,
    };
  }
  return { id: 'handoff-lock', status: 'warn', detail: `đang khoá bởi "${taskId}" (${ageHours}h)` };
}

function runGit(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim();
}

function checkGitState(repoRoot) {
  try {
    const branch = runGit(repoRoot, ['branch', '--show-current']) || '(detached)';
    const porcelain = runGit(repoRoot, ['status', '--porcelain']);
    const dirtyCount = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
    return {
      id: 'git',
      status: 'ok',
      detail: `nhánh ${branch}, ${dirtyCount} file chưa commit`,
      head: runGit(repoRoot, ['rev-parse', 'HEAD']),
    };
  } catch {
    return { id: 'git', status: 'warn', detail: 'không đọc được trạng thái git', head: null };
  }
}

function checkGitNexus(repoRoot, head) {
  const metaPath = path.join(repoRoot, '.gitnexus', 'meta.json');
  const raw = readTrimmed(metaPath);
  if (!raw) {
    return { id: 'gitnexus', status: 'warn', detail: 'chưa có .gitnexus/meta.json (chạy gitnexus analyze --skip-agents-md)' };
  }
  try {
    const meta = JSON.parse(raw);
    const lastCommit = typeof meta.lastCommit === 'string' ? meta.lastCommit : '';
    if (!head || lastCommit === head) {
      return { id: 'gitnexus', status: 'ok', detail: `khớp ${lastCommit.slice(0, 7) || 'HEAD'}` };
    }
    return {
      id: 'gitnexus',
      status: 'warn',
      detail: `lệch HEAD (${lastCommit.slice(0, 7)} vs ${head.slice(0, 7)}) — chạy gitnexus analyze --skip-agents-md`,
    };
  } catch {
    return { id: 'gitnexus', status: 'warn', detail: '.gitnexus/meta.json không hợp lệ' };
  }
}

function runYarnCheck(repoRoot, scriptArgs, id) {
  try {
    execFileSync('yarn', scriptArgs, { cwd: repoRoot, encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });
    return { id, status: 'ok', detail: 'pass' };
  } catch (err) {
    const stderr = err && err.stderr ? String(err.stderr).trim().split('\n')[0] : '';
    return { id, status: 'fail', detail: stderr || `yarn ${scriptArgs.join(' ')} fail` };
  }
}

function runPreflight(repoRoot, options = {}) {
  const full = Boolean(options.full);
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const gitState = checkGitState(repoRoot);

  const checks = [
    checkNodeRuntime(repoRoot, options.nodeVersion),
    checkPythonService(repoRoot, 'roadmap-rag-assistant', 'python-rag'),
    checkPythonService(repoRoot, 'news-ingest-worker', 'python-worker'),
    checkDiskSpace(repoRoot),
    inspectHandoffLock(repoRoot, nowMs),
    { id: gitState.id, status: gitState.status, detail: gitState.detail },
    checkGitNexus(repoRoot, gitState.head),
  ];

  if (full) {
    checks.push(
      runYarnCheck(repoRoot, ['agents:sync', '--check'], 'agents-sync'),
      runYarnCheck(repoRoot, ['check:knowledge-index'], 'knowledge-index'),
      runYarnCheck(repoRoot, ['test:schema-sql', '--check'], 'schema-sql'),
      runYarnCheck(repoRoot, ['intel', 'status'], 'intel-status'),
    );
  }

  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  return { ok: failed === 0, failed, warned, checks };
}

function formatTextReport(report) {
  const icons = { ok: '✅', warn: '⚠️', fail: '❌' };
  const lines = report.checks.map((c) => `${icons[c.status] || '•'} ${c.id.padEnd(16)} ${c.detail}`);
  lines.push(report.ok ? `Preflight OK (${report.warned} cảnh báo).` : `Preflight FAIL (${report.failed} lỗi, ${report.warned} cảnh báo).`);
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const full = argv.includes('--full');
  const asJson = argv.includes('--json');
  const repoRoot = path.resolve(__dirname, '..');
  const report = runPreflight(repoRoot, { full });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTextReport(report)}\n`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_LOCK_AGE_MS,
  checkGitNexus,
  checkNodeRuntime,
  formatTextReport,
  inspectHandoffLock,
  runPreflight,
};
