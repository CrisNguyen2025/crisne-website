import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig, AgentId, Hook, HookEvent, McpServer, ModelTier, Passthrough, SkillLink, Subagent, ToolCategory } from './model';

export function loadMcpConfig(repoRoot: string): McpServer[] {
  const mcpPath = path.join(repoRoot, '.agents', 'adapter', 'mcp.json');

  if (!fs.existsSync(mcpPath)) {
    throw new Error(`File không tồn tại: ${mcpPath}`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(mcpPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Không thể đọc file tại ${mcpPath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Lỗi cú pháp JSON tại ${mcpPath}: ${msg}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !('servers' in parsed)) {
    throw new Error(`Nội dung ${mcpPath} phải chứa trường "servers" là một danh sách`);
  }

  const rawServers = (parsed as { servers: unknown }).servers;
  if (!Array.isArray(rawServers)) {
    throw new Error(`Trường "servers" trong ${mcpPath} phải là một danh sách (array)`);
  }

  const seenIds = new Set<string>();
  const servers: McpServer[] = [];

  for (const item of rawServers) {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Server trong danh sách ${mcpPath} phải là một object`);
    }

    const serverObj = item as Record<string, unknown>;
    const id = serverObj.id;
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error(`Server thiếu trường "id" hợp lệ trong ${mcpPath}`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Trùng lặp server id "${id}" trong ${mcpPath}`);
    }
    seenIds.add(id);

    const transport = serverObj.transport;
    if (transport !== 'stdio' && transport !== 'http') {
      throw new Error(`Transport không hợp lệ "${String(transport)}" cho server "${id}" trong ${mcpPath}`);
    }

    const passthrough: Passthrough = {};
    for (const [k, v] of Object.entries(serverObj)) {
      if (k.startsWith('x-')) {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
          throw new Error(`Trường passthrough "${k}" cho server "${id}" phải là một object`);
        }
        passthrough[k as `x-${string}`] = v as Record<string, unknown>;
      }
    }

    if (transport === 'stdio') {
      const command = serverObj.command;
      if (typeof command !== 'string' || command.trim() === '') {
        throw new Error(`Server "${id}" (transport stdio) thiếu trường "command" trong ${mcpPath}`);
      }

      const rawArgs = serverObj.args;
      const args: string[] = [];
      if (rawArgs !== undefined) {
        if (!Array.isArray(rawArgs) || !rawArgs.every(a => typeof a === 'string')) {
          throw new Error(`Trường "args" của server "${id}" phải là mảng string`);
        }
        args.push(...rawArgs);
      }

      const rawEnv = serverObj.env;
      const env: Record<string, string> = {};
      if (rawEnv !== undefined) {
        if (typeof rawEnv !== 'object' || rawEnv === null || Array.isArray(rawEnv)) {
          throw new Error(`Trường "env" của server "${id}" phải là object`);
        }
        for (const [ek, ev] of Object.entries(rawEnv as Record<string, unknown>)) {
          if (typeof ev !== 'string') {
            throw new Error(`Giá trị của biến môi trường "${ek}" trong server "${id}" phải là string`);
          }
          env[ek] = ev;
        }
      }

      servers.push({
        id,
        transport: 'stdio',
        command,
        args,
        env,
        ...passthrough,
      });
    } else {
      const url = serverObj.url;
      if (typeof url !== 'string' || url.trim() === '') {
        throw new Error(`Server "${id}" (transport http) thiếu trường "url" trong ${mcpPath}`);
      }

      const rawHeaders = serverObj.headers;
      const headers: Record<string, string> = {};
      if (rawHeaders !== undefined) {
        if (typeof rawHeaders !== 'object' || rawHeaders === null || Array.isArray(rawHeaders)) {
          throw new Error(`Trường "headers" của server "${id}" phải là object`);
        }
        for (const [hk, hv] of Object.entries(rawHeaders as Record<string, unknown>)) {
          if (typeof hv !== 'string') {
            throw new Error(`Giá trị của header "${hk}" trong server "${id}" phải là string`);
          }
          headers[hk] = hv;
        }
      }

      servers.push({
        id,
        transport: 'http',
        url,
        headers,
        ...passthrough,
      });
    }
  }

  return servers;
}

export function loadSkillLinks(repoRoot: string): SkillLink[] {
  const skillsDir = path.join(repoRoot, '.agents', 'skills');
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillLink[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        skills.push({ name: entry.name });
      }
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return applySkillExclusions(repoRoot, skills);
}

const VALID_AGENT_IDS: AgentId[] = ['claude', 'antigravity'];

function applySkillExclusions(repoRoot: string, skills: SkillLink[]): SkillLink[] {
  const filePath = path.join(repoRoot, '.agents', 'adapter', 'skills.json');
  if (!fs.existsSync(filePath)) {
    return skills;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Lỗi cú pháp JSON tại ${filePath}: ${msg}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Nội dung ${filePath} phải là một object`);
  }

  const exclude = (parsed as { exclude?: unknown }).exclude;
  if (exclude === undefined) {
    return skills;
  }
  if (typeof exclude !== 'object' || exclude === null || Array.isArray(exclude)) {
    throw new Error(`Trường "exclude" trong ${filePath} phải là object dạng { "<agent>": ["<skill>"] }`);
  }

  const known = new Set(skills.map(s => s.name));
  const excludedBy = new Map<string, AgentId[]>();
  for (const [agent, names] of Object.entries(exclude)) {
    if (!VALID_AGENT_IDS.includes(agent as AgentId)) {
      throw new Error(`Agent "${agent}" trong ${filePath} không hợp lệ (chỉ nhận: ${VALID_AGENT_IDS.join(', ')})`);
    }
    if (!Array.isArray(names) || !names.every(n => typeof n === 'string')) {
      throw new Error(`Danh sách skill của agent "${agent}" trong ${filePath} phải là mảng string`);
    }
    for (const name of names as string[]) {
      if (!known.has(name)) {
        throw new Error(`Skill "${name}" trong ${filePath} không tồn tại trong .agents/skills/`);
      }
      excludedBy.set(name, [...(excludedBy.get(name) ?? []), agent as AgentId]);
    }
  }

  return skills.map(skill => {
    const excludeFor = excludedBy.get(skill.name);
    return excludeFor ? { ...skill, excludeFor } : skill;
  });
}

export function loadSubagents(repoRoot: string): Subagent[] {
  const subagentsDir = path.join(repoRoot, '.agents', 'adapter', 'subagents');
  if (!fs.existsSync(subagentsDir)) {
    return [];
  }

  const entries = fs.readdirSync(subagentsDir, { withFileTypes: true });
  const subagents: Subagent[] = [];
  const validToolCategories = new Set<string>(['read', 'shell', 'edit']);
  const validModelTiers = new Set<string>(['fast', 'strong', 'inherit']);

  const sortedDirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of sortedDirs) {
    const name = dir.name;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`Tên subagent "${name}" không hợp lệ (phải khớp ^[a-z0-9][a-z0-9-]*$)`);
    }
    const agentJsonPath = path.join(subagentsDir, name, 'agent.json');
    const promptMdPath = path.join(subagentsDir, name, 'prompt.md');

    if (!fs.existsSync(agentJsonPath)) {
      throw new Error(`Thiếu file cấu hình tại ${agentJsonPath}`);
    }

    if (!fs.existsSync(promptMdPath)) {
      throw new Error(`Thiếu file prompt tại ${promptMdPath}`);
    }

    let promptRaw: string;
    try {
      promptRaw = fs.readFileSync(promptMdPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Không thể đọc file prompt tại ${promptMdPath}: ${msg}`);
    }

    if (promptRaw.trim() === '') {
      throw new Error(`Nội dung prompt tại ${promptMdPath} không được để trống`);
    }

    let rawJson: string;
    try {
      rawJson = fs.readFileSync(agentJsonPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Không thể đọc file tại ${agentJsonPath}: ${msg}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Lỗi cú pháp JSON tại ${agentJsonPath}: ${msg}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Nội dung ${agentJsonPath} phải là một object`);
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name !== name) {
      throw new Error(`Tên subagent "${String(obj.name)}" trong ${agentJsonPath} không khớp với tên thư mục "${name}"`);
    }

    if (typeof obj.description !== 'string' || obj.description.trim() === '') {
      throw new Error(`Trường "description" trong ${agentJsonPath} phải là chuỗi không rỗng`);
    }

    if (!Array.isArray(obj.tools) || obj.tools.length === 0) {
      throw new Error(`Trường "tools" trong ${agentJsonPath} phải là danh sách không rỗng`);
    }

    for (const t of obj.tools) {
      if (typeof t !== 'string' || !validToolCategories.has(t)) {
        throw new Error(`Giá trị tool không hợp lệ "${String(t)}" trong ${agentJsonPath}`);
      }
    }
    const tools = obj.tools as ToolCategory[];

    if (typeof obj.model !== 'string' || !validModelTiers.has(obj.model)) {
      throw new Error(`Giá trị model không hợp lệ "${String(obj.model)}" trong ${agentJsonPath}`);
    }
    const model = obj.model as ModelTier;

    const readOnly = obj.readOnly === undefined ? false : obj.readOnly;
    if (typeof readOnly !== 'boolean') {
      throw new Error(`Trường "readOnly" trong ${agentJsonPath} phải là boolean`);
    }

    if (readOnly === true && tools.includes('edit')) {
      throw new Error(`Subagent "${name}" có "readOnly: true" nhưng danh sách tools lại chứa "edit" tại ${agentJsonPath}`);
    }

    const rawSkills = obj.skills === undefined ? [] : obj.skills;
    if (!Array.isArray(rawSkills) || !rawSkills.every(s => typeof s === 'string')) {
      throw new Error(`Trường "skills" trong ${agentJsonPath} phải là mảng string`);
    }

    for (const skillName of rawSkills) {
      const skillFile = path.join(repoRoot, '.agents', 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        throw new Error(`Skill "${skillName}" khai báo trong ${agentJsonPath} không tồn tại tại ${skillFile}`);
      }
    }

    const passthrough: Passthrough = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('x-')) {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
          throw new Error(`Trường passthrough "${k}" trong ${agentJsonPath} phải là một object`);
        }
        passthrough[k as `x-${string}`] = v as Record<string, unknown>;
      }
    }

    subagents.push({
      name,
      description: obj.description,
      tools,
      model,
      readOnly,
      skills: rawSkills,
      prompt: promptRaw,
      ...passthrough,
    });
  }

  return subagents;
}

export function loadHooks(repoRoot: string): Hook[] {
  const hooksPath = path.join(repoRoot, '.agents', 'adapter', 'hooks.json');
  if (!fs.existsSync(hooksPath)) {
    return [];
  }

  let rawJson: string;
  try {
    rawJson = fs.readFileSync(hooksPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Không thể đọc file tại ${hooksPath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Lỗi cú pháp JSON tại ${hooksPath}: ${msg}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !('hooks' in parsed)) {
    throw new Error(`Nội dung ${hooksPath} phải chứa trường "hooks" là một danh sách`);
  }

  const rawHooks = (parsed as { hooks: unknown }).hooks;
  if (!Array.isArray(rawHooks)) {
    throw new Error(`Trường "hooks" trong ${hooksPath} phải là một danh sách (array)`);
  }

  const seenIds = new Set<string>();
  const idRegex = /^[a-z0-9][a-z0-9-]*$/;
  const validEvents = new Set<string>(['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']);
  const validToolCategories = new Set<string>(['read', 'shell', 'edit']);
  const validTargets = new Set<string>(['claude', 'antigravity']);

  const hooks: Hook[] = [];

  for (const item of rawHooks) {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Hook trong danh sách ${hooksPath} phải là một object`);
    }

    const obj = item as Record<string, unknown>;
    const id = obj.id;
    if (typeof id !== 'string' || !idRegex.test(id)) {
      throw new Error(`ID hook "${String(id)}" trong ${hooksPath} không hợp lệ (phải khớp ^[a-z0-9][a-z0-9-]*$)`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Trùng lặp hook id "${id}" trong ${hooksPath}`);
    }
    seenIds.add(id);

    const event = obj.event;
    if (typeof event !== 'string' || !validEvents.has(event)) {
      throw new Error(`Event không hợp lệ "${String(event)}" cho hook "${id}" trong ${hooksPath}`);
    }

    const rawTools = obj.tools === undefined ? [] : obj.tools;
    if (!Array.isArray(rawTools)) {
      throw new Error(`Trường "tools" của hook "${id}" trong ${hooksPath} phải là mảng`);
    }
    for (const t of rawTools) {
      if (typeof t !== 'string' || !validToolCategories.has(t)) {
        throw new Error(`Giá trị tool không hợp lệ "${String(t)}" cho hook "${id}" trong ${hooksPath}`);
      }
    }
    const tools = rawTools as ToolCategory[];

    if (tools.length > 0 && (event === 'SessionStart' || event === 'Stop')) {
      throw new Error(`Hook "${id}" có event "${event}" không được khai báo tools tại ${hooksPath}`);
    }

    const script = obj.script;
    if (typeof script !== 'string' || script.trim() === '') {
      throw new Error(`Trường "script" của hook "${id}" trong ${hooksPath} phải là chuỗi không rỗng`);
    }

    const scriptFullPath = path.join(repoRoot, '.agents', 'adapter', script);
    if (!fs.existsSync(scriptFullPath)) {
      throw new Error(`File script "${script}" cho hook "${id}" không tồn tại tại ${scriptFullPath}`);
    }

    let timeout = 30;
    if (obj.timeout !== undefined) {
      if (typeof obj.timeout !== 'number' || !Number.isInteger(obj.timeout) || obj.timeout <= 0) {
        throw new Error(`Trường "timeout" của hook "${id}" trong ${hooksPath} phải là số nguyên dương`);
      }
      timeout = obj.timeout;
    }

    let targets: AgentId[] | undefined = undefined;
    if (obj.targets !== undefined) {
      if (!Array.isArray(obj.targets)) {
        throw new Error(`Trường "targets" của hook "${id}" trong ${hooksPath} phải là mảng`);
      }
      for (const tgt of obj.targets) {
        if (typeof tgt !== 'string' || !validTargets.has(tgt)) {
          throw new Error(`Target không hợp lệ "${String(tgt)}" cho hook "${id}" trong ${hooksPath}`);
        }
      }
      targets = obj.targets as AgentId[];
    }

    hooks.push({
      id,
      event: event as HookEvent,
      tools,
      script,
      timeout,
      targets,
    });
  }

  return hooks;
}

export function loadConfig(repoRoot: string): AgentConfig {
  return {
    mcp: loadMcpConfig(repoRoot),
    skills: loadSkillLinks(repoRoot),
    subagents: loadSubagents(repoRoot),
    hooks: loadHooks(repoRoot),
  };
}
