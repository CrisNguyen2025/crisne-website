import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const cjsRequire = createRequire(import.meta.url);
const preflight = cjsRequire('../../scripts/preflight.js') as {
  MAX_LOCK_AGE_MS: number;
  checkDiskSpace: (repoRoot: string) => { id: string; status: string; detail: string };
  checkGitNexus: (repoRoot: string, head: string | null) => { id: string; status: string; detail: string };
  checkNodeRuntime: (repoRoot: string, nodeVersion?: string) => { id: string; status: string; detail: string };
  formatTextReport: (report: { ok: boolean; failed: number; warned: number; checks: Array<{ id: string; status: string; detail: string }> }) => string;
  inspectHandoffLock: (repoRoot: string, nowMs?: number) => { id: string; status: string; detail: string };
  runPreflight: (repoRoot: string, options?: { full?: boolean; nowMs?: number; nodeVersion?: string }) => {
    ok: boolean;
    failed: number;
    warned: number;
    checks: Array<{ id: string; status: string; detail: string }>;
  };
};

const repoRoot = path.resolve(__dirname, '../..');

function withSandbox(fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('scripts/preflight.js', () => {
  it('checks Node version against .nvmrc', () => {
    withSandbox(dir => {
      fs.writeFileSync(path.join(dir, '.nvmrc'), '22\n');
      expect(preflight.checkNodeRuntime(dir, '22.18.0').status).toBe('ok');
      expect(preflight.checkNodeRuntime(dir, '20.19.5').status).toBe('fail');
    });
  });

  it('classifies absent, active, stale, and malformed handoff locks', () => {
    withSandbox(dir => {
      const runsDir = path.join(dir, '.handoff', 'runs');
      fs.mkdirSync(runsDir, { recursive: true });
      const lockPath = path.join(runsDir, '.lock');
      const now = Date.UTC(2026, 10, 26, 12, 0, 0);

      expect(preflight.inspectHandoffLock(dir, now).status).toBe('ok');

      fs.writeFileSync(lockPath, '{bad json');
      expect(preflight.inspectHandoffLock(dir, now).detail).toContain('hỏng JSON');

      fs.writeFileSync(lockPath, JSON.stringify({ task_id: 'TASK-a-001', started_at: new Date(now - 30 * 60 * 1000).toISOString() }));
      const active = preflight.inspectHandoffLock(dir, now);
      expect(active.status).toBe('warn');
      expect(active.detail).toContain('đang khoá bởi "TASK-a-001"');

      fs.writeFileSync(
        lockPath,
        JSON.stringify({ task_id: 'TASK-old-001', started_at: new Date(now - preflight.MAX_LOCK_AGE_MS - 60_000).toISOString() }),
      );
      const stale = preflight.inspectHandoffLock(dir, now);
      expect(stale.status).toBe('warn');
      expect(stale.detail).toContain('mồ côi "TASK-old-001"');
    });
  });

  it('detects fresh vs stale .gitnexus/meta.json relative to HEAD', () => {
    withSandbox(dir => {
      expect(preflight.checkGitNexus(dir, 'abc1234').status).toBe('warn');

      fs.mkdirSync(path.join(dir, '.gitnexus'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.gitnexus', 'meta.json'), JSON.stringify({ lastCommit: 'abc1234' }));
      expect(preflight.checkGitNexus(dir, 'abc1234').status).toBe('ok');
      expect(preflight.checkGitNexus(dir, 'def5678').status).toBe('warn');
    });
  });

  it('passes fast preflight on the real repository without missing Python venvs', () => {
    const report = preflight.runPreflight(repoRoot, { full: false });
    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.checks.map(c => c.id)).toEqual([
      'node',
      'python-rag',
      'python-worker',
      'disk-space',
      'handoff-lock',
      'git',
      'gitnexus',
    ]);
    expect(preflight.formatTextReport(report)).toContain('Preflight OK');
  });
});
