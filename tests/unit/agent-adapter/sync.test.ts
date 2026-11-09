import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { adapters, antigravityAdapter, claudeAdapter } from '../../../scripts/agent-adapter/adapters';
import { AgentAdapter } from '../../../scripts/agent-adapter/core/adapter';
import { AgentConfig } from '../../../scripts/agent-adapter/core/model';
import { sync } from '../../../scripts/agent-adapter/core/sync';
import { writeConfig } from '../../../scripts/agent-adapter/core/write';

describe('Sync & Write Engine', () => {
  it('throws error when two adapters output to the same path', () => {
    const config: AgentConfig = {
      mcp: [{ id: 'test', transport: 'stdio', command: 'cmd', args: [], env: {} }],
      skills: [],
      subagents: [],
      hooks: [],
    };

    const conflictingAdapter1: AgentAdapter = {
      id: 'claude',
      render: {
        mcp: () => [{ kind: 'own', path: 'shared.json', content: '1' }],
        skills: () => [],
        subagents: () => [],
        hooks: () => [],
      },
      managedDirs: [],
    };

    const conflictingAdapter2: AgentAdapter = {
      id: 'antigravity',
      render: {
        mcp: () => [{ kind: 'own', path: 'shared.json', content: '2' }],
        skills: () => [],
        subagents: () => [],
        hooks: () => [],
      },
      managedDirs: [],
    };

    expect(() => sync(config, [conflictingAdapter1, conflictingAdapter2])).toThrow(
      'Xung đột đường dẫn "shared.json" giữa adapter "claude" và "antigravity"',
    );
  });

  it('records native and unsupported handlers in notes', () => {
    const config: AgentConfig = {
      mcp: [],
      skills: [{ name: 'sample' }],
      subagents: [],
      hooks: [],
    };

    const { notes } = sync(config, adapters);
    expect(notes).toContain('antigravity: skills native (Antigravity reads .agents/skills directly)');
    expect(notes).toContain(
      'antigravity: subagents unsupported (Antigravity chỉ nạp subagent từ plugin hoặc define_subagent lúc runtime, xem PLAN-agent-adapter.md mục 14)',
    );
  });

  it('is idempotent: running twice in a temp directory changes nothing on second run', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-idempotent-test-'));
    const agentsSkillsDir = path.join(tmpDir, '.agents', 'skills');
    fs.mkdirSync(path.join(agentsSkillsDir, 'test-skill'), { recursive: true });
    fs.writeFileSync(path.join(agentsSkillsDir, 'test-skill', 'SKILL.md'), '# Skill');

    const config: AgentConfig = {
      mcp: [{ id: 'playwright', transport: 'stdio', command: 'npx', args: ['@playwright/mcp'], env: {} }],
      skills: [{ name: 'test-skill' }],
      subagents: [],
      hooks: [],
    };

    const { outputs } = sync(config, [claudeAdapter, antigravityAdapter]);

    // Lần 1: ghi mới
    const run1 = writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter]);
    expect(run1.created.length).toBeGreaterThan(0);
    expect(run1.changed.length).toBe(0);

    // Lần 2: không đổi gì
    const run2 = writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter]);
    expect(run2.created.length).toBe(0);
    expect(run2.changed.length).toBe(0);
    expect(run2.removed.length).toBe(0);
    expect(run2.unchanged.length).toBe(run1.created.length);
  });

  it('--check detects drift when file is missing or modified', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-check-test-'));
    const config: AgentConfig = {
      mcp: [{ id: 'playwright', transport: 'stdio', command: 'npx', args: [], env: {} }],
      skills: [],
      subagents: [],
      hooks: [],
    };

    const { outputs } = sync(config, [claudeAdapter, antigravityAdapter]);

    // Trước khi sync, check báo missing
    const check1 = writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter], { check: true });
    expect(check1.created).toContain('.mcp.json');
    expect(check1.created).toContain('.agents/mcp_config.json');

    // Sync thật
    writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter]);

    // Check lại khi up to date
    const check2 = writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter], { check: true });
    expect(check2.created.length).toBe(0);
    expect(check2.changed.length).toBe(0);
    expect(check2.removed.length).toBe(0);

    // Sửa tay .mcp.json
    fs.writeFileSync(path.join(tmpDir, '.mcp.json'), '{"modified": true}\n', 'utf-8');

    // Check lại: phát hiện changed
    const check3 = writeConfig(tmpDir, outputs, [claudeAdapter, antigravityAdapter], { check: true });
    expect(check3.changed).toContain('.mcp.json');
  });

  it('supports merge-key in writeConfig: preserves existing keys and updates targeted key', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-key-test-'));
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ existingSetting: 'keep-me', hooks: { old: true } }, null, 2) + '\n',
      'utf-8',
    );

    const outputs = [
      {
        kind: 'merge-key' as const,
        path: '.claude/settings.json',
        key: 'hooks',
        value: { PreToolUse: [] },
      },
    ];

    const result = writeConfig(tmpDir, outputs, []);
    expect(result.changed).toContain('.claude/settings.json');

    const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(updated.existingSetting).toBe('keep-me');
    expect(updated.hooks).toEqual({ PreToolUse: [] });

    const checkResult = writeConfig(tmpDir, outputs, [], { check: true });
    expect(checkResult.unchanged).toContain('.claude/settings.json');
    expect(checkResult.changed.length).toBe(0);
  });
});
