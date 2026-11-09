import { AgentAdapter, GeneratedOutput } from '../../core/adapter';
import { Hook, McpServer } from '../../core/model';
import { ANTIGRAVITY_TOOL_MAP } from './maps';

export function renderAntigravityHooks(hooks: Hook[]): GeneratedOutput[] {
  const targetHooks = hooks.filter(h => !h.targets || h.targets.includes('antigravity'));
  if (targetHooks.length === 0) {
    return [
      {
        kind: 'own',
        path: '.agents/hooks.json',
        content: '{}\n',
      },
    ];
  }

  const rendered: Record<string, Record<string, unknown[]>> = {};

  for (const h of targetHooks) {
    const command = `node ../scripts/agent-adapter/hook-runner.js ${h.id} --agent=antigravity`;
    const action: { command: string; timeout?: number } = { command };
    if (h.timeout !== undefined) {
      action.timeout = h.timeout;
    }

    if (!rendered[h.id]) {
      rendered[h.id] = {};
    }
    if (!rendered[h.id][h.event]) {
      rendered[h.id][h.event] = [];
    }

    if (h.event === 'SessionStart' || h.event === 'Stop') {
      rendered[h.id][h.event].push(action);
    } else {
      const toolNames: string[] = [];
      if (h.tools && h.tools.length > 0) {
        for (const cat of h.tools) {
          for (const t of ANTIGRAVITY_TOOL_MAP[cat] || []) {
            if (!toolNames.includes(t)) {
              toolNames.push(t);
            }
          }
        }
      }

      const entry: { matcher?: string; hooks: Array<{ command: string; timeout?: number }> } = {
        hooks: [action],
      };
      if (toolNames.length > 0) {
        entry.matcher = toolNames.join('|');
      }

      rendered[h.id][h.event].push(entry);
    }
  }

  const content = JSON.stringify(rendered, null, 2) + '\n';
  return [
    {
      kind: 'own',
      path: '.agents/hooks.json',
      content,
    },
  ];
}

export function renderAntigravityMcp(servers: McpServer[]): GeneratedOutput[] {
  const mcpServers: Record<string, unknown> = {};

  for (const s of servers) {
    const extra = (s['x-antigravity'] as Record<string, unknown> | undefined) || {};
    if (s.transport === 'stdio') {
      mcpServers[s.id] = {
        command: s.command,
        args: s.args,
        env: s.env,
        ...extra,
      };
    } else {
      mcpServers[s.id] = {
        url: s.url,
        headers: s.headers,
        ...extra,
      };
    }
  }

  const content = JSON.stringify({ mcpServers }, null, 2) + '\n';
  return [
    {
      kind: 'own',
      path: '.agents/mcp_config.json',
      content,
    },
  ];
}

export const antigravityAdapter: AgentAdapter = {
  id: 'antigravity',
  render: {
    mcp: renderAntigravityMcp,
    skills: { native: 'Antigravity reads .agents/skills directly' },
    subagents: {
      unsupported:
        'Antigravity chỉ nạp subagent từ plugin hoặc define_subagent lúc runtime, xem PLAN-agent-adapter.md mục 14',
    },
    hooks: renderAntigravityHooks,
  },
  managedDirs: [],
};
