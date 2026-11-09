import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { antigravityAdapter } from '../../../scripts/agent-adapter/adapters/antigravity';
import { claudeAdapter, renderClaudeSkills } from '../../../scripts/agent-adapter/adapters/claude';
import { loadSkillLinks } from '../../../scripts/agent-adapter/core/load';
import { writeConfig } from '../../../scripts/agent-adapter/core/write';

describe('Skills Adapter & Loader', () => {
  describe('renderClaudeSkills', () => {
    it('renders skills as symlinks pointing to ../../.agents/skills/<name>', () => {
      const skills = [{ name: 'test-skill' }, { name: 'another-skill' }];
      const outputs = renderClaudeSkills(skills);

      expect(outputs).toHaveLength(2);
      expect(outputs[0]).toEqual({
        kind: 'symlink',
        path: '.claude/skills/test-skill',
        target: '../../.agents/skills/test-skill',
      });
      expect(outputs[1]).toEqual({
        kind: 'symlink',
        path: '.claude/skills/another-skill',
        target: '../../.agents/skills/another-skill',
      });
    });
  });

  describe('antigravityAdapter skills', () => {
    it('declares native support for skills', () => {
      expect(antigravityAdapter.render.skills).toEqual({
        native: 'Antigravity reads .agents/skills directly',
      });
    });
  });

  describe('loadSkillLinks', () => {
    it('discovers skills containing SKILL.md and ignores folders without it', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-load-test-'));
      const skillsDir = path.join(tmpDir, '.agents', 'skills');

      fs.mkdirSync(path.join(skillsDir, 'valid-skill'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'valid-skill', 'SKILL.md'), '# Valid');

      fs.mkdirSync(path.join(skillsDir, 'not-a-skill'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'not-a-skill', 'README.md'), '# No skill');

      const links = loadSkillLinks(tmpDir);
      expect(links).toEqual([{ name: 'valid-skill' }]);
    });
  });

  describe('skill exclusions (.agents/adapter/skills.json)', () => {
    const makeRoot = (skillsJson?: string) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-exclude-test-'));
      for (const name of ['keep-me', 'drop-me']) {
        fs.mkdirSync(path.join(root, '.agents', 'skills', name), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'skills', name, 'SKILL.md'), `# ${name}`);
      }
      if (skillsJson !== undefined) {
        fs.mkdirSync(path.join(root, '.agents', 'adapter'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'adapter', 'skills.json'), skillsJson);
      }
      return root;
    };

    it('marks excluded skills per agent and leaves the others untouched', () => {
      const root = makeRoot(JSON.stringify({ exclude: { claude: ['drop-me'] } }));
      expect(loadSkillLinks(root)).toEqual([{ name: 'drop-me', excludeFor: ['claude'] }, { name: 'keep-me' }]);
    });

    it('Claude does not link excluded skills; Antigravity stays native for every skill', () => {
      const links = [{ name: 'drop-me', excludeFor: ['claude' as const] }, { name: 'keep-me' }];
      expect(renderClaudeSkills(links).map(o => o.path)).toEqual(['.claude/skills/keep-me']);
      expect(antigravityAdapter.render.skills).toEqual({ native: 'Antigravity reads .agents/skills directly' });
    });

    it('rejects an unknown agent, an unknown skill, a bad shape and broken JSON', () => {
      expect(() => loadSkillLinks(makeRoot(JSON.stringify({ exclude: { codex: ['keep-me'] } })))).toThrow(/Agent "codex" .* không hợp lệ/);
      expect(() => loadSkillLinks(makeRoot(JSON.stringify({ exclude: { claude: ['typo'] } })))).toThrow(/Skill "typo" .* không tồn tại/);
      expect(() => loadSkillLinks(makeRoot(JSON.stringify({ exclude: { claude: 'keep-me' } })))).toThrow(/phải là mảng string/);
      expect(() => loadSkillLinks(makeRoot('{ bad'))).toThrow(/Lỗi cú pháp JSON/);
    });

    it('removes an existing symlink of a skill that became excluded', () => {
      const root = makeRoot(JSON.stringify({ exclude: { claude: ['drop-me'] } }));
      const claudeSkills = path.join(root, '.claude', 'skills');
      fs.mkdirSync(claudeSkills, { recursive: true });
      fs.symlinkSync('../../.agents/skills/drop-me', path.join(claudeSkills, 'drop-me'));
      fs.symlinkSync('../../.agents/skills/keep-me', path.join(claudeSkills, 'keep-me'));

      const outputs = renderClaudeSkills(loadSkillLinks(root));
      const check = writeConfig(root, outputs, [claudeAdapter], { check: true });
      expect(check.removed).toEqual(['.claude/skills/drop-me']);
      expect(fs.existsSync(path.join(claudeSkills, 'drop-me'))).toBe(true);

      const res = writeConfig(root, outputs, [claudeAdapter]);
      expect(res.removed).toEqual(['.claude/skills/drop-me']);
      expect(fs.existsSync(path.join(claudeSkills, 'drop-me'))).toBe(false);
      expect(fs.lstatSync(path.join(claudeSkills, 'keep-me')).isSymbolicLink()).toBe(true);
    });
  });

  describe('writeConfig skills handling', () => {
    it('creates missing symlinks and cleans stale symlinks', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-write-test-'));
      const agentsSkillsDir = path.join(tmpDir, '.agents', 'skills');
      const claudeSkillsDir = path.join(tmpDir, '.claude', 'skills');

      fs.mkdirSync(path.join(agentsSkillsDir, 'active-skill'), { recursive: true });
      fs.writeFileSync(path.join(agentsSkillsDir, 'active-skill', 'SKILL.md'), '# Active');

      // Tạo một symlink cũ (stale) trỏ tới skill không còn tồn tại
      fs.mkdirSync(claudeSkillsDir, { recursive: true });
      fs.symlinkSync('../../.agents/skills/deleted-skill', path.join(claudeSkillsDir, 'deleted-skill'));

      const outputs = renderClaudeSkills([{ name: 'active-skill' }]);
      const res = writeConfig(tmpDir, outputs, [claudeAdapter]);

      expect(res.created).toContain('.claude/skills/active-skill');
      expect(res.removed).toContain('.claude/skills/deleted-skill');

      expect(fs.lstatSync(path.join(claudeSkillsDir, 'active-skill')).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(claudeSkillsDir, 'deleted-skill'))).toBe(false);
    });

    it('ignores real directories that are gitignored', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-gitignored-test-'));
      execSync('git init -q', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/skills/gitnexus\n');

      const gitnexusDir = path.join(tmpDir, '.claude', 'skills', 'gitnexus');
      fs.mkdirSync(gitnexusDir, { recursive: true });
      fs.writeFileSync(path.join(gitnexusDir, 'data.txt'), 'hello');

      const outputs = [
        {
          kind: 'symlink' as const,
          path: '.claude/skills/gitnexus',
          target: '../../.agents/skills/gitnexus',
        },
      ];

      const res = writeConfig(tmpDir, outputs, [claudeAdapter]);
      expect(res.unchanged).toContain('.claude/skills/gitnexus');
      expect(fs.lstatSync(gitnexusDir).isDirectory()).toBe(true);
    });

    it('throws error when target is a real directory that is NOT gitignored', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-not-ignored-test-'));
      execSync('git init -q', { cwd: tmpDir });

      const realDir = path.join(tmpDir, '.claude', 'skills', 'my-real-skill');
      fs.mkdirSync(realDir, { recursive: true });

      const outputs = [
        {
          kind: 'symlink' as const,
          path: '.claude/skills/my-real-skill',
          target: '../../.agents/skills/my-real-skill',
        },
      ];

      expect(() => writeConfig(tmpDir, outputs, [claudeAdapter])).toThrow(
        /là thư mục\/file thật không bị gitignore/,
      );
    });
  });
});
