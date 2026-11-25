import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig, AgentId, Hook, HookEvent, McpServer, ModelTier, Passthrough, SkillLink, Subagent, ToolCategory } from './model';

function readTextFileStrict(filePath: string, readLabel = 'file'): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Không thể đọc ${readLabel} tại ${filePath}: ${msg}`);
  }
}

function readJsonFileStrict(filePath: string): unknown {
  const raw = readTextFileStrict(filePath);
  try {
    return JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Lỗi cú pháp JSON tại ${filePath}: ${msg}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringMapField(
  rawMap: unknown,
  fieldLabel: string,
  entryLabel: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (rawMap === undefined) return result;
  if (!isPlainObject(rawMap)) {
    throw new Error(`Trường "${fieldLabel}" của ${entryLabel} phải là object`);
  }
  for (const [k, v] of Object.entries(rawMap)) {
    if (typeof v !== 'string') {
      throw new Error(`Giá trị của ${fieldLabel} "${k}" trong ${entryLabel} phải là string`);
    }
    result[k] = v;
  }
  return result;
}

function extractPassthroughFields(
  obj: Record<string, unknown>,
  entryLabel: string,
): Passthrough {
  const passthrough: Passthrough = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('x-')) continue;
    if (!isPlainObject(v)) {
      throw new Error(`Trường passthrough "${k}" ${entryLabel} phải là một object`);
    }
    passthrough[k as `x-${string}`] = v;
  }
  return passthrough;
}

function parseMcpServerItem(
  item: unknown,
  mcpPath: string,
  seenIds: Set<string>,
): McpServer {
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

  const passthrough = extractPassthroughFields(serverObj, `cho server "${id}"`);

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

    const env = readStringMapField(serverObj.env, 'biến môi trường', `server "${id}"`);
    return { id, transport: 'stdio', command, args, env, ...passthrough };
  }

  const url = serverObj.url;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error(`Server "${id}" (transport http) thiếu trường "url" trong ${mcpPath}`);
  }

  const headers = readStringMapField(serverObj.headers, 'header', `server "${id}"`);
  return { id, transport: 'http', url, headers, ...passthrough };
}

export function loadMcpConfig(repoRoot: string): McpServer[] {
  const mcpPath = path.join(repoRoot, '.agents', 'adapter', 'mcp.json');

  if (!fs.existsSync(mcpPath)) {
    throw new Error(`File không tồn tại: ${mcpPath}`);
  }

  const parsed = readJsonFileStrict(mcpPath);
  if (typeof parsed !== 'object' || parsed === null || !('servers' in parsed)) {
    throw new Error(`Nội dung ${mcpPath} phải chứa trường "servers" là một danh sách`);
  }

  const rawServers = (parsed as { servers: unknown }).servers;
  if (!Array.isArray(rawServers)) {
    throw new Error(`Trường "servers" trong ${mcpPath} phải là một danh sách (array)`);
  }

  const seenIds = new Set<string>();
  return rawServers.map(item => parseMcpServerItem(item, mcpPath, seenIds));
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

function collectExcludedAgentsBySkill(
  exclude: Record<string, unknown>,
  knownSkills: Set<string>,
  filePath: string,
): Map<string, AgentId[]> {
  const excludedBy = new Map<string, AgentId[]>();
  for (const [agent, names] of Object.entries(exclude)) {
    if (!VALID_AGENT_IDS.includes(agent as AgentId)) {
      throw new Error(`Agent "${agent}" trong ${filePath} không hợp lệ (chỉ nhận: ${VALID_AGENT_IDS.join(', ')})`);
    }
    if (!Array.isArray(names) || !names.every(n => typeof n === 'string')) {
      throw new Error(`Danh sách skill của agent "${agent}" trong ${filePath} phải là mảng string`);
    }
    for (const name of names as string[]) {
      if (!knownSkills.has(name)) {
        throw new Error(`Skill "${name}" trong ${filePath} không tồn tại trong .agents/skills/`);
      }
      excludedBy.set(name, [...(excludedBy.get(name) ?? []), agent as AgentId]);
    }
  }
  return excludedBy;
}

function applySkillExclusions(repoRoot: string, skills: SkillLink[]): SkillLink[] {
  const filePath = path.join(repoRoot, '.agents', 'adapter', 'skills.json');
  if (!fs.existsSync(filePath)) {
    return skills;
  }

  const parsed = readJsonFileStrict(filePath);
  if (!isPlainObject(parsed)) {
    throw new Error(`Nội dung ${filePath} phải là một object`);
  }

  const exclude = parsed.exclude;
  if (exclude === undefined) {
    return skills;
  }
  if (!isPlainObject(exclude)) {
    throw new Error(`Trường "exclude" trong ${filePath} phải là object dạng { "<agent>": ["<skill>"] }`);
  }

  const excludedBy = collectExcludedAgentsBySkill(exclude, new Set(skills.map(s => s.name)), filePath);
  return skills.map(skill => {
    const excludeFor = excludedBy.get(skill.name);
    return excludeFor ? { ...skill, excludeFor } : skill;
  });
}

const VALID_TOOL_CATEGORIES = new Set<string>(['read', 'shell', 'edit']);
const VALID_MODEL_TIERS = new Set<string>(['fast', 'strong', 'inherit']);
const SUBAGENT_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

function validateSubagentTools(toolsRaw: unknown, agentJsonPath: string): ToolCategory[] {
  if (!Array.isArray(toolsRaw) || toolsRaw.length === 0) {
    throw new Error(`Trường "tools" trong ${agentJsonPath} phải là danh sách không rỗng`);
  }
  for (const t of toolsRaw) {
    if (typeof t !== 'string' || !VALID_TOOL_CATEGORIES.has(t)) {
      throw new Error(`Giá trị tool không hợp lệ "${String(t)}" trong ${agentJsonPath}`);
    }
  }
  return toolsRaw as ToolCategory[];
}

function validateSubagentSkills(skillsRaw: unknown, repoRoot: string, agentJsonPath: string): string[] {
  const skills = skillsRaw === undefined ? [] : skillsRaw;
  if (!Array.isArray(skills) || !skills.every(s => typeof s === 'string')) {
    throw new Error(`Trường "skills" trong ${agentJsonPath} phải là mảng string`);
  }
  for (const skillName of skills) {
    const skillFile = path.join(repoRoot, '.agents', 'skills', skillName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      throw new Error(`Skill "${skillName}" khai báo trong ${agentJsonPath} không tồn tại tại ${skillFile}`);
    }
  }
  return skills;
}

function readSubagentConfigFiles(
  name: string,
  subagentsDir: string,
): { agentJsonPath: string; promptRaw: string; parsed: Record<string, unknown> } {
  const agentJsonPath = path.join(subagentsDir, name, 'agent.json');
  const promptMdPath = path.join(subagentsDir, name, 'prompt.md');

  if (!fs.existsSync(agentJsonPath)) {
    throw new Error(`Thiếu file cấu hình tại ${agentJsonPath}`);
  }
  if (!fs.existsSync(promptMdPath)) {
    throw new Error(`Thiếu file prompt tại ${promptMdPath}`);
  }

  const promptRaw = readTextFileStrict(promptMdPath, 'file prompt');
  if (promptRaw.trim() === '') {
    throw new Error(`Nội dung prompt tại ${promptMdPath} không được để trống`);
  }

  const parsed = readJsonFileStrict(agentJsonPath);
  if (!isPlainObject(parsed)) {
    throw new Error(`Nội dung ${agentJsonPath} phải là một object`);
  }
  return { agentJsonPath, promptRaw, parsed };
}

function parseSubagentDirectory(name: string, subagentsDir: string, repoRoot: string): Subagent {
  if (!SUBAGENT_NAME_REGEX.test(name)) {
    throw new Error(`Tên subagent "${name}" không hợp lệ (phải khớp ^[a-z0-9][a-z0-9-]*$)`);
  }
  const { agentJsonPath, promptRaw, parsed } = readSubagentConfigFiles(name, subagentsDir);

  if (typeof parsed.name !== 'string' || parsed.name !== name) {
    throw new Error(`Tên subagent "${String(parsed.name)}" trong ${agentJsonPath} không khớp với tên thư mục "${name}"`);
  }
  if (typeof parsed.description !== 'string' || parsed.description.trim() === '') {
    throw new Error(`Trường "description" trong ${agentJsonPath} phải là chuỗi không rỗng`);
  }

  const tools = validateSubagentTools(parsed.tools, agentJsonPath);

  if (typeof parsed.model !== 'string' || !VALID_MODEL_TIERS.has(parsed.model)) {
    throw new Error(`Giá trị model không hợp lệ "${String(parsed.model)}" trong ${agentJsonPath}`);
  }
  const model = parsed.model as ModelTier;

  const readOnly = parsed.readOnly === undefined ? false : parsed.readOnly;
  if (typeof readOnly !== 'boolean') {
    throw new Error(`Trường "readOnly" trong ${agentJsonPath} phải là boolean`);
  }
  if (readOnly && tools.includes('edit')) {
    throw new Error(`Subagent "${name}" có "readOnly: true" nhưng danh sách tools lại chứa "edit" tại ${agentJsonPath}`);
  }

  const skills = validateSubagentSkills(parsed.skills, repoRoot, agentJsonPath);
  const passthrough = extractPassthroughFields(parsed, `trong ${agentJsonPath}`);
  return {
    name,
    description: parsed.description,
    tools,
    model,
    readOnly,
    skills,
    prompt: promptRaw,
    ...passthrough,
  };
}

export function loadSubagents(repoRoot: string): Subagent[] {
  const subagentsDir = path.join(repoRoot, '.agents', 'adapter', 'subagents');
  if (!fs.existsSync(subagentsDir)) {
    return [];
  }

  const entries = fs.readdirSync(subagentsDir, { withFileTypes: true });
  const sortedDirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  return sortedDirs.map(dir => parseSubagentDirectory(dir.name, subagentsDir, repoRoot));
}

const VALID_HOOK_EVENTS = new Set<string>(['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']);
const VALID_HOOK_TARGETS = new Set<string>(['claude', 'antigravity']);

function parseHookTools(rawTools: unknown, id: string, event: string, hooksPath: string): ToolCategory[] {
  const toolsArray = rawTools === undefined ? [] : rawTools;
  if (!Array.isArray(toolsArray)) {
    throw new Error(`Trường "tools" của hook "${id}" trong ${hooksPath} phải là mảng`);
  }
  for (const t of toolsArray) {
    if (typeof t !== 'string' || !VALID_TOOL_CATEGORIES.has(t)) {
      throw new Error(`Giá trị tool không hợp lệ "${String(t)}" cho hook "${id}" trong ${hooksPath}`);
    }
  }
  if (toolsArray.length > 0 && (event === 'SessionStart' || event === 'Stop')) {
    throw new Error(`Hook "${id}" có event "${event}" không được khai báo tools tại ${hooksPath}`);
  }
  return toolsArray as ToolCategory[];
}

function parseHookTargets(rawTargets: unknown, id: string, hooksPath: string): AgentId[] | undefined {
  if (rawTargets === undefined) return undefined;
  if (!Array.isArray(rawTargets)) {
    throw new Error(`Trường "targets" của hook "${id}" trong ${hooksPath} phải là mảng`);
  }
  for (const tgt of rawTargets) {
    if (typeof tgt !== 'string' || !VALID_HOOK_TARGETS.has(tgt)) {
      throw new Error(`Target không hợp lệ "${String(tgt)}" cho hook "${id}" trong ${hooksPath}`);
    }
  }
  return rawTargets as AgentId[];
}

function parseHookItem(
  item: unknown,
  repoRoot: string,
  hooksPath: string,
  seenIds: Set<string>,
): Hook {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`Hook trong danh sách ${hooksPath} phải là một object`);
  }

  const obj = item as Record<string, unknown>;
  const id = obj.id;
  if (typeof id !== 'string' || !SUBAGENT_NAME_REGEX.test(id)) {
    throw new Error(`ID hook "${String(id)}" trong ${hooksPath} không hợp lệ (phải khớp ^[a-z0-9][a-z0-9-]*$)`);
  }
  if (seenIds.has(id)) {
    throw new Error(`Trùng lặp hook id "${id}" trong ${hooksPath}`);
  }
  seenIds.add(id);

  const event = obj.event;
  if (typeof event !== 'string' || !VALID_HOOK_EVENTS.has(event)) {
    throw new Error(`Event không hợp lệ "${String(event)}" cho hook "${id}" trong ${hooksPath}`);
  }

  const tools = parseHookTools(obj.tools, id, event, hooksPath);

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

  const targets = parseHookTargets(obj.targets, id, hooksPath);
  return { id, event: event as HookEvent, tools, script, timeout, targets };
}

export function loadHooks(repoRoot: string): Hook[] {
  const hooksPath = path.join(repoRoot, '.agents', 'adapter', 'hooks.json');
  if (!fs.existsSync(hooksPath)) {
    return [];
  }

  const parsed = readJsonFileStrict(hooksPath);
  if (typeof parsed !== 'object' || parsed === null || !('hooks' in parsed)) {
    throw new Error(`Nội dung ${hooksPath} phải chứa trường "hooks" là một danh sách`);
  }

  const rawHooks = (parsed as { hooks: unknown }).hooks;
  if (!Array.isArray(rawHooks)) {
    throw new Error(`Trường "hooks" trong ${hooksPath} phải là một danh sách (array)`);
  }

  const seenIds = new Set<string>();
  return rawHooks.map(item => parseHookItem(item, repoRoot, hooksPath, seenIds));
}

export function loadConfig(repoRoot: string): AgentConfig {
  return {
    mcp: loadMcpConfig(repoRoot),
    skills: loadSkillLinks(repoRoot),
    subagents: loadSubagents(repoRoot),
    hooks: loadHooks(repoRoot),
  };
}
