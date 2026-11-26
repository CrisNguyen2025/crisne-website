import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { renderAntigravityHooks } from '../../../scripts/agent-adapter/adapters/antigravity';
import { renderClaudeHooks } from '../../../scripts/agent-adapter/adapters/claude';
import { appendHookDebug, MAX_RAW_LENGTH } from '../../../scripts/agent-adapter/core/hook-debug';
import { loadHooks } from '../../../scripts/agent-adapter/core/load';
import { Hook } from '../../../scripts/agent-adapter/core/model';
import { writeConfig } from '../../../scripts/agent-adapter/core/write';

const repoRoot = path.resolve(__dirname, '../../..');
const cjsRequire = createRequire(import.meta.url);
const guardTaskBoundaryRaw = cjsRequire('../../../.agents/adapter/hooks/guard-task-boundary.js');
const guardGitSafetyRaw = cjsRequire('../../../.agents/adapter/hooks/guard-git-safety.js');

describe('AgentAdapter - Hooks System', () => {
  describe('(a) Validation of Hook ID', () => {
    it('accepts valid hook IDs', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-id-valid-'));
      const adapterDir = path.join(tmpDir, '.agents', 'adapter');
      fs.mkdirSync(path.join(adapterDir, 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(adapterDir, 'hooks', 'test.js'), 'module.exports = () => {};');

      const hooksConfig = {
        hooks: [
          {
            id: 'guard-generated-1',
            event: 'PreToolUse',
            tools: ['edit'],
            script: 'hooks/test.js',
          },
        ],
      };
      fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

      const loaded = loadHooks(tmpDir);
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('guard-generated-1');
    });

    it('rejects invalid hook IDs', () => {
      const invalidIds = ['GuardGenerated', '123_test', 'guard/sub', '-invalid', 'test!'];
      for (const id of invalidIds) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-id-invalid-'));
        const adapterDir = path.join(tmpDir, '.agents', 'adapter');
        fs.mkdirSync(path.join(adapterDir, 'hooks'), { recursive: true });
        fs.writeFileSync(path.join(adapterDir, 'hooks', 'test.js'), 'module.exports = () => {};');

        const hooksConfig = {
          hooks: [
            {
              id,
              event: 'PreToolUse',
              script: 'hooks/test.js',
            },
          ],
        };
        fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

        expect(() => loadHooks(tmpDir)).toThrow(new RegExp(`ID hook "${id}"`));
      }
    });
  });

  describe('(b) Validation of Hook Event', () => {
    it('rejects invalid hook events', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-event-invalid-'));
      const adapterDir = path.join(tmpDir, '.agents', 'adapter');
      fs.mkdirSync(path.join(adapterDir, 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(adapterDir, 'hooks', 'test.js'), 'module.exports = () => {};');

      const hooksConfig = {
        hooks: [
          {
            id: 'test-hook',
            event: 'InvalidEvent',
            script: 'hooks/test.js',
          },
        ],
      };
      fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

      expect(() => loadHooks(tmpDir)).toThrow(/Event không hợp lệ "InvalidEvent"/);
    });
  });

  describe('(c) Validation of Tools configuration', () => {
    it('disallows tools for SessionStart and Stop events', () => {
      for (const event of ['SessionStart', 'Stop']) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-tools-session-'));
        const adapterDir = path.join(tmpDir, '.agents', 'adapter');
        fs.mkdirSync(path.join(adapterDir, 'hooks'), { recursive: true });
        fs.writeFileSync(path.join(adapterDir, 'hooks', 'test.js'), 'module.exports = () => {};');

        const hooksConfig = {
          hooks: [
            {
              id: 'test-hook',
              event,
              tools: ['edit'],
              script: 'hooks/test.js',
            },
          ],
        };
        fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

        expect(() => loadHooks(tmpDir)).toThrow(/không được khai báo tools/);
      }
    });

    it('rejects unsupported tool categories', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-tool-cat-'));
      const adapterDir = path.join(tmpDir, '.agents', 'adapter');
      fs.mkdirSync(path.join(adapterDir, 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(adapterDir, 'hooks', 'test.js'), 'module.exports = () => {};');

      const hooksConfig = {
        hooks: [
          {
            id: 'test-hook',
            event: 'PreToolUse',
            tools: ['unsupported-category'],
            script: 'hooks/test.js',
          },
        ],
      };
      fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

      expect(() => loadHooks(tmpDir)).toThrow(/Giá trị tool không hợp lệ "unsupported-category"/);
    });
  });

  describe('(d) Validation of script existence', () => {
    it('throws error when script file does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-script-missing-'));
      const adapterDir = path.join(tmpDir, '.agents', 'adapter');
      fs.mkdirSync(adapterDir, { recursive: true });

      const hooksConfig = {
        hooks: [
          {
            id: 'test-hook',
            event: 'PreToolUse',
            script: 'hooks/missing.js',
          },
        ],
      };
      fs.writeFileSync(path.join(adapterDir, 'hooks.json'), JSON.stringify(hooksConfig));

      expect(() => loadHooks(tmpDir)).toThrow('File script "hooks/missing.js" cho hook "test-hook" không tồn tại');
    });
  });

  describe('(e) Claude Renderer', () => {
    it('generates merge-key output for .claude/settings.json with pipe-separated matcher and full command', () => {
      const hooks: Hook[] = [
        {
          id: 'guard-generated',
          event: 'PreToolUse',
          tools: ['edit'],
          script: 'hooks/guard-generated.js',
          timeout: 10,
        },
        {
          id: 'on-start',
          event: 'SessionStart',
          script: 'hooks/start.js',
        },
        {
          id: 'antigravity-only',
          event: 'PreToolUse',
          tools: ['shell'],
          script: 'hooks/shell.js',
          targets: ['antigravity'],
        },
      ];

      const outputs = renderClaudeHooks(hooks);
      expect(outputs.length).toBe(1);
      expect(outputs[0].kind).toBe('merge-key');
      expect(outputs[0].path).toBe('.claude/settings.json');
      if (outputs[0].kind === 'merge-key') {
        expect(outputs[0].key).toBe('hooks');
        const value = outputs[0].value as Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
        expect(value.PreToolUse).toBeDefined();
        expect(value.PreToolUse.length).toBe(1);
        expect(value.PreToolUse[0].matcher).toBe('Edit|Write');
        expect(value.PreToolUse[0].hooks[0].command).toBe(
          'node "${CLAUDE_PROJECT_DIR}/scripts/agent-adapter/hook-runner.js" guard-generated --agent=claude',
        );
        expect(value.PreToolUse[0].hooks[0].timeout).toBe(10);

        expect(value.SessionStart).toBeDefined();
        expect(value.SessionStart[0].matcher).toBeUndefined();
        expect(value.SessionStart[0].hooks[0].command).toBe(
          'node "${CLAUDE_PROJECT_DIR}/scripts/agent-adapter/hook-runner.js" on-start --agent=claude',
        );
      }
    });

    it('returns empty array when no hooks target Claude', () => {
      const hooks: Hook[] = [
        {
          id: 'anti-hook',
          event: 'PreToolUse',
          script: 'hooks/anti.js',
          targets: ['antigravity'],
        },
      ];
      expect(renderClaudeHooks(hooks)).toEqual([]);
    });
  });

  describe('(f) Antigravity Renderer', () => {
    it('generates own output for .agents/hooks.json keyed by hook ID', () => {
      const hooks: Hook[] = [
        {
          id: 'guard-generated',
          event: 'PreToolUse',
          tools: ['edit'],
          script: 'hooks/guard-generated.js',
          timeout: 10,
        },
        {
          id: 'init-env',
          event: 'SessionStart',
          script: 'hooks/init.js',
          timeout: 5,
        },
      ];

      const outputs = renderAntigravityHooks(hooks);
      expect(outputs.length).toBe(1);
      expect(outputs[0].kind).toBe('own');
      expect(outputs[0].path).toBe('.agents/hooks.json');
      if (outputs[0].kind === 'own') {
        const parsed = JSON.parse(outputs[0].content);
        expect(parsed['guard-generated']).toBeDefined();
        expect(parsed['guard-generated'].PreToolUse[0].matcher).toBe('edit_file|write_file');
        expect(parsed['guard-generated'].PreToolUse[0].hooks[0].command).toBe(
          'node ../scripts/agent-adapter/hook-runner.js guard-generated --agent=antigravity',
        );
        expect(parsed['guard-generated'].PreToolUse[0].hooks[0].timeout).toBe(10);

        expect(parsed['init-env']).toBeDefined();
        expect(parsed['init-env'].SessionStart).toEqual([
          {
            command: 'node ../scripts/agent-adapter/hook-runner.js init-env --agent=antigravity',
            timeout: 5,
          },
        ]);
      }
    });

    it('outputs empty JSON object when no hooks target Antigravity', () => {
      const hooks: Hook[] = [
        {
          id: 'claude-only',
          event: 'PreToolUse',
          script: 'hooks/claude.js',
          targets: ['claude'],
        },
      ];
      const outputs = renderAntigravityHooks(hooks);
      expect(outputs.length).toBe(1);
      if (outputs[0].kind === 'own') {
        expect(JSON.parse(outputs[0].content)).toEqual({});
      }
    });
  });

  describe('(g) hook-runner and guard-generated execution', () => {
    const runnerScript = path.join(repoRoot, 'scripts/agent-adapter/hook-runner.js');

    it('denies Claude edit operations on static generated files (.mcp.json, .agents/mcp_config.json, .agents/hooks.json)', () => {
      const generatedTargets = ['.mcp.json', '.agents/mcp_config.json', '.agents/hooks.json'];
      for (const target of generatedTargets) {
        const input = JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: { file_path: target },
        });

        const res = spawnSync('node', [runnerScript, 'guard-generated', '--agent=claude'], {
          input,
          encoding: 'utf-8',
        });

        expect(res.status).toBe(0);
        const parsed = JSON.parse(res.stdout);
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(target);
      }
    });

    it('denies Claude edit operations on generated subagent files in .claude/agents/*.md', () => {
      const input = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '.claude/agents/verifier.md' },
      });

      const res = spawnSync('node', [runnerScript, 'guard-generated', '--agent=claude'], {
        input,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('.claude/agents/verifier.md');
    });

    it('allows Claude edit operations on regular non-generated files', () => {
      const input = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: 'src/app/page.tsx' },
      });

      const res = spawnSync('node', [runnerScript, 'guard-generated', '--agent=claude'], {
        input,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toBe('');
    });

    it('denies Antigravity edit operations on generated files', () => {
      const input = JSON.stringify({
        toolCall: {
          name: 'edit_file',
          arguments: { Path: '.agents/hooks.json' },
        },
      });

      const res = spawnSync('node', [runnerScript, 'guard-generated', '--agent=antigravity'], {
        input,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.decision).toBe('deny');
      expect(parsed.reason).toContain('.agents/hooks.json');
    });

    it('allows Antigravity edit operations on regular files', () => {
      const input = JSON.stringify({
        toolCall: {
          name: 'write_file',
          args: { Path: 'src/app/layout.tsx' },
        },
      });

      const res = spawnSync('node', [runnerScript, 'guard-generated', '--agent=antigravity'], {
        input,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toBe('');
    });

    const runGuard = (agent: 'claude' | 'antigravity', target: string, toolName: string) => {
      const input =
        agent === 'claude'
          ? { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { file_path: target } }
          : { toolCall: { name: toolName, args: { Path: target } } };
      return spawnSync('node', [runnerScript, 'guard-generated', `--agent=${agent}`], {
        input: JSON.stringify(input),
        encoding: 'utf-8',
        cwd: os.tmpdir(),
      });
    };

    const isDenied = (agent: 'claude' | 'antigravity', stdout: string) => {
      const parsed = JSON.parse(stdout);
      return agent === 'claude' ? parsed.hookSpecificOutput.permissionDecision === 'deny' : parsed.decision === 'deny';
    };

    it('denies generated files however the path is written: relative, "./", "..", different case, absolute with ".."', () => {
      const attempts = [
        '.mcp.json',
        './.mcp.json',
        '.agents/../.mcp.json',
        '.claude/agents/../../.mcp.json',
        '.claude/agents/./verifier.md',
        '.MCP.JSON',
        `${repoRoot}/.agents/../.mcp.json`,
        `${repoRoot}/./.agents/hooks.json`,
      ];

      for (const target of attempts) {
        const claude = runGuard('claude', target, 'Write');
        expect(claude.status, `claude ${target}`).toBe(0);
        expect(isDenied('claude', claude.stdout), `claude ${target}`).toBe(true);

        const antigravity = runGuard('antigravity', target, 'write_file');
        expect(antigravity.status, `antigravity ${target}`).toBe(0);
        expect(isDenied('antigravity', antigravity.stdout), `antigravity ${target}`).toBe(true);
      }
    });

    it('allows paths outside the repo and look-alikes that are not generated', () => {
      const allowed = [
        '../.mcp.json',
        '/tmp/some-other-project/.mcp.json',
        '.agents/adapter/mcp.json',
        'docs/.mcp.json',
        '.claude/settings.json',
        '.claude/agents/hand-written-does-not-exist.md',
      ];

      for (const target of allowed) {
        const claude = runGuard('claude', target, 'Edit');
        expect(claude.status, `claude ${target}`).toBe(0);
        expect(claude.stdout, `claude ${target}`).toBe('');

        const antigravity = runGuard('antigravity', target, 'edit_file');
        expect(antigravity.status, `antigravity ${target}`).toBe(0);
        expect(antigravity.stdout, `antigravity ${target}`).toBe('');
      }
    });

    it('names the exact source to edit in the deny reason', () => {
      const expectations: Array<[string, string]> = [
        ['.mcp.json', '.agents/adapter/mcp.json'],
        ['.agents/mcp_config.json', '.agents/adapter/mcp.json'],
        ['.agents/hooks.json', '.agents/adapter/hooks.json'],
        ['.claude/agents/verifier.md', '.agents/adapter/subagents/verifier/'],
      ];

      for (const [target, source] of expectations) {
        const res = runGuard('claude', target, 'Edit');
        const reason: string = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason;
        expect(reason, target).toContain(`File "${target}"`);
        expect(reason, target).toContain(source);
        expect(reason, target).toContain('yarn agents:sync');
      }
    });

    it('is fail-open on malformed json, missing hook id, or missing script', () => {
      const badJsonRes = spawnSync('node', [runnerScript, 'guard-generated', '--agent=claude'], {
        input: 'invalid-json-content',
        encoding: 'utf-8',
      });
      expect(badJsonRes.status).toBe(0);
      expect(badJsonRes.stdout).toBe('');

      const missingIdRes = spawnSync('node', [runnerScript], {
        input: '{}',
        encoding: 'utf-8',
      });
      expect(missingIdRes.status).toBe(0);
      expect(missingIdRes.stdout).toBe('');

      const missingScriptRes = spawnSync('node', [runnerScript, 'non-existent', '--agent=claude'], {
        input: '{}',
        encoding: 'utf-8',
      });
      expect(missingScriptRes.status).toBe(0);
      expect(missingScriptRes.stdout).toBe('');
    });
  });

  describe('(g2) hook debug log (opt-in)', () => {
    const makeRoot = (enabled: boolean) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-debug-'));
      const dir = path.join(root, '.handoff', 'runs', 'hook-debug');
      fs.mkdirSync(dir, { recursive: true });
      if (enabled) {
        fs.writeFileSync(path.join(dir, 'ENABLED'), '');
      }
      return { root, dir };
    };

    it('writes nothing unless the ENABLED flag file exists', () => {
      const { root, dir } = makeRoot(false);
      const wrote = appendHookDebug(root, { agent: 'claude', raw: '{}' });
      expect(wrote).toBe(false);
      expect(fs.existsSync(path.join(dir, 'stdin-claude.jsonl'))).toBe(false);
    });

    it('appends one JSON line per call and truncates very long raw input', () => {
      const { root, dir } = makeRoot(true);
      expect(appendHookDebug(root, { agent: 'antigravity', hookId: 'guard-generated', raw: '{"a":1}', decision: 'allow' })).toBe(true);
      expect(appendHookDebug(root, { agent: 'antigravity', raw: 'x'.repeat(MAX_RAW_LENGTH + 500), decision: 'deny' })).toBe(true);

      const lines = fs.readFileSync(path.join(dir, 'stdin-antigravity.jsonl'), 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({ agent: 'antigravity', hookId: 'guard-generated', raw: '{"a":1}', decision: 'allow' });
      expect(JSON.parse(lines[1]).raw).toHaveLength(MAX_RAW_LENGTH);
    });

    it('rejects an agent name that could escape the log directory and never throws', () => {
      const { root, dir } = makeRoot(true);
      expect(appendHookDebug(root, { agent: '../evil', raw: '{}' })).toBe(false);
      expect(appendHookDebug(root, { agent: 123 as unknown as string, raw: '{}' })).toBe(false);
      expect(appendHookDebug('/nonexistent-root-for-test', { agent: 'claude', raw: '{}' })).toBe(false);
      expect(fs.readdirSync(dir)).toEqual(['ENABLED']);
    });
  });

  describe('(h) writeConfig merge-key semantics and idempotency', () => {
    it('creates file when missing and preserves other keys when present', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-write-merge-'));
      const settingsPath = path.join(tmpDir, '.claude', 'settings.json');

      const outputs = [
        {
          kind: 'merge-key' as const,
          path: '.claude/settings.json',
          key: 'hooks',
          value: { PreToolUse: [{ matcher: 'Edit' }] },
        },
      ];

      const res1 = writeConfig(tmpDir, outputs, []);
      expect(res1.created).toContain('.claude/settings.json');
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))).toEqual({
        hooks: { PreToolUse: [{ matcher: 'Edit' }] },
      });

      const existingData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      existingData.userTheme = 'dark';
      fs.writeFileSync(settingsPath, JSON.stringify(existingData, null, 2) + '\n');

      const res2 = writeConfig(tmpDir, outputs, []);
      expect(res2.unchanged).toContain('.claude/settings.json');
      const preservedData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(preservedData.userTheme).toBe('dark');
      expect(preservedData.hooks).toEqual({ PreToolUse: [{ matcher: 'Edit' }] });
    });
  });

  describe('(i) guard-task-boundary execution', () => {
    type HookDecision = { decision: string; reason: string } | undefined;
    type HookFn = (payload: {
      event?: string;
      tool?: { category?: string; name?: string; path?: string; command?: string };
      repoRoot?: string;
    }) => Promise<HookDecision>;

    const guardTaskBoundary = guardTaskBoundaryRaw as unknown as HookFn;

    const withTaskSandbox = async (
      opts: {
        lock?: Record<string, unknown> | string | null;
        specId?: string;
        specBody?: string;
      },
      fn: (root: string) => Promise<void>,
    ) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-boundary-'));
      try {
        fs.mkdirSync(path.join(root, '.handoff', 'runs'), { recursive: true });
        fs.mkdirSync(path.join(root, '.handoff', 'specs'), { recursive: true });
        if (opts.lock !== undefined && opts.lock !== null) {
          const content = typeof opts.lock === 'string' ? opts.lock : JSON.stringify(opts.lock);
          fs.writeFileSync(path.join(root, '.handoff', 'runs', '.lock'), content, 'utf-8');
        }
        if (opts.specId && opts.specBody) {
          fs.writeFileSync(path.join(root, '.handoff', 'specs', `${opts.specId}.md`), opts.specBody, 'utf-8');
        }
        await fn(root);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    };

    const sampleImplementSpec = [
      '---',
      'task_id: "TASK-demo-001"',
      'type: "implement"',
      'boundaries:',
      '  allowed_to_modify:',
      '    - "components/roadmap/**"',
      '    - "lib/single.ts"',
      '  strictly_forbidden:',
      '    - "components/roadmap/Forbidden.tsx"',
      '    - "package.json"',
      '---',
      '# Demo',
    ].join('\n');

    it('allows any edit when no lock exists or when lock is older than 4 hours', async () => {
      await withTaskSandbox({ specId: 'TASK-demo-001', specBody: sampleImplementSpec }, async root => {
        const res = await guardTaskBoundary({
          tool: { category: 'edit', name: 'Edit', path: 'package.json' },
          repoRoot: root,
        });
        expect(res).toBeUndefined();
      });

      const staleStartedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      await withTaskSandbox(
        {
          lock: { task_id: 'TASK-demo-001', started_at: staleStartedAt },
          specId: 'TASK-demo-001',
          specBody: sampleImplementSpec,
        },
        async root => {
          const res = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Edit', path: 'package.json' },
            repoRoot: root,
          });
          expect(res).toBeUndefined();
        },
      );
    });

    it('enforces allowed_to_modify, strictly_forbidden, and handoff runtime paths when lock is active', async () => {
      await withTaskSandbox(
        {
          lock: { task_id: 'TASK-demo-001', started_at: new Date().toISOString() },
          specId: 'TASK-demo-001',
          specBody: sampleImplementSpec,
        },
        async root => {
          const allowedTargets = [
            'components/roadmap/TopicCard.tsx',
            'lib/single.ts',
            '.handoff/specs/TASK-demo-001.md',
            '.handoff/runs/.lock',
            '.handoff/runs/escalations/ESC-TASK-demo-001.md',
            '.handoff/runs/TASK-demo-001/result.json.tmp',
            '.handoff/runs/TASK-demo-001/progress.md',
            '../outside-brain-artifact/plan.md',
          ];

          for (const target of allowedTargets) {
            const res = await guardTaskBoundary({
              tool: { category: 'edit', name: 'write_file', path: target },
              repoRoot: root,
            });
            expect(res, target).toBeUndefined();
          }

          const outOfScope = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Edit', path: 'app/page.tsx' },
            repoRoot: root,
          });
          expect(outOfScope?.decision).toBe('deny');
          expect(outOfScope?.reason).toContain('allowed_to_modify');

          const forbidden = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Edit', path: 'components/roadmap/Forbidden.tsx' },
            repoRoot: root,
          });
          expect(forbidden?.decision).toBe('deny');
          expect(forbidden?.reason).toContain('strictly_forbidden');

          const baselineEdit = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Write', path: '.handoff/runs/TASK-demo-001/baseline.txt' },
            repoRoot: root,
          });
          expect(baselineEdit?.decision).toBe('deny');
          expect(baselineEdit?.reason).toContain('baseline.txt');

          const directResultJson = await guardTaskBoundary({
            tool: { category: 'edit', name: 'write_file', path: '.handoff/runs/TASK-demo-001/result.json' },
            repoRoot: root,
          });
          expect(directResultJson?.decision).toBe('deny');
          expect(directResultJson?.reason).toContain('result.json.tmp');
        },
      );
    });

    it('denies repo source edits for review tasks while allowing spec and review.md', async () => {
      const reviewSpec = sampleImplementSpec.replace('type: "implement"', 'type: "review"');
      await withTaskSandbox(
        {
          lock: { task_id: 'TASK-demo-001', started_at: new Date().toISOString() },
          specId: 'TASK-demo-001',
          specBody: reviewSpec,
        },
        async root => {
          const denied = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Edit', path: 'components/roadmap/TopicCard.tsx' },
            repoRoot: root,
          });
          expect(denied?.decision).toBe('deny');
          expect(denied?.reason).toContain('review');

          const allowedReview = await guardTaskBoundary({
            tool: { category: 'edit', name: 'Write', path: '.handoff/runs/TASK-demo-001/review.md' },
            repoRoot: root,
          });
          expect(allowedReview).toBeUndefined();
        },
      );
    });
  });

  describe('(j) guard-git-safety execution', () => {
    type HookDecision = { decision: string; reason: string } | undefined;
    type HookFn = (payload: {
      event?: string;
      tool?: { category?: string; name?: string; command?: string };
      repoRoot?: string;
    }) => Promise<HookDecision>;

    const guardGitSafety = guardGitSafetyRaw as unknown as HookFn;
    const runnerScript = path.join(repoRoot, 'scripts/agent-adapter/hook-runner.js');

    it('always denies destructive git commands across Claude and Antigravity runners', () => {
      const destructive = [
        'git reset --hard HEAD',
        'cd roadmap-rag-assistant && git clean -fd',
        'git restore .',
        'git restore -- .',
        'git checkout -- .',
        'git branch -D feat/old',
        'git push --force origin main',
        'bash -c "git reset --hard"',
      ];

      for (const cmd of destructive) {
        const claudeRes = spawnSync('node', [runnerScript, 'guard-git-safety', '--agent=claude'], {
          input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } }),
          encoding: 'utf-8',
        });
        expect(claudeRes.status, `claude: ${cmd}`).toBe(0);
        expect(JSON.parse(claudeRes.stdout).hookSpecificOutput.permissionDecision, `claude: ${cmd}`).toBe('deny');

        const agyRes = spawnSync('node', [runnerScript, 'guard-git-safety', '--agent=antigravity'], {
          input: JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: cmd } } }),
          encoding: 'utf-8',
        });
        expect(agyRes.status, `antigravity: ${cmd}`).toBe(0);
        expect(JSON.parse(agyRes.stdout).decision, `antigravity: ${cmd}`).toBe('deny');
      }
    });

    it('allows safe git commands, single-file restore, dry-run clean, and quoted grep strings', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-git-nolock-'));
      try {
        const safeCommands = [
          'git status --short',
          'git clean -nd',
          'git restore -- src/app/page.tsx',
          'git checkout -b feat/new-hook',
          'git branch -d feat/merged',
          'grep "git reset --hard" AGENTS.md',
          'git commit -m "chore: allowed outside executor lock"',
          'git push origin --delete feat/merged',
        ];

        for (const cmd of safeCommands) {
          const res = await guardGitSafety({
            tool: { category: 'shell', name: 'Bash', command: cmd },
            repoRoot: root,
          });
          expect(res, cmd).toBeUndefined();
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('denies git commit and git push only while an active Executor lock is present', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-git-locked-'));
      try {
        const runsDir = path.join(root, '.handoff', 'runs');
        fs.mkdirSync(runsDir, { recursive: true });
        fs.writeFileSync(
          path.join(runsDir, '.lock'),
          JSON.stringify({ task_id: 'TASK-exec-001', started_at: new Date().toISOString() }),
          'utf-8',
        );

        for (const cmd of ['git commit -m "bad"', 'git push origin feat/x']) {
          const res = await guardGitSafety({
            tool: { category: 'shell', name: 'Bash', command: cmd },
            repoRoot: root,
          });
          expect(res?.decision, cmd).toBe('deny');
          expect(res?.reason, cmd).toContain('TASK-exec-001');
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
