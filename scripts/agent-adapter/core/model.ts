import type { AgentId } from './adapter';
export type { AgentId };

export type Passthrough = {
  [key: `x-${string}`]: Record<string, unknown> | undefined;
};

export type ToolCategory = 'read' | 'shell' | 'edit';
export type ModelTier = 'fast' | 'strong' | 'inherit';

export type McpServer = Passthrough &
  (
    | {
        id: string;
        transport: 'stdio';
        command: string;
        args: string[];
        env: Record<string, string>;
      }
    | {
        id: string;
        transport: 'http';
        url: string;
        headers: Record<string, string>;
      }
  );

export interface SkillLink {
  name: string;
  excludeFor?: AgentId[];
}

export type Subagent = Passthrough & {
  name: string;
  description: string;
  tools: ToolCategory[];
  model: ModelTier;
  readOnly: boolean;
  skills: string[];
  prompt: string;
};

export type HookEvent = 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';

export interface Hook {
  id: string;
  event: HookEvent;
  tools?: ToolCategory[];
  script: string;
  timeout?: number;
  targets?: AgentId[];
}

export interface KindModel {
  mcp: McpServer[];
  skills: SkillLink[];
  subagents: Subagent[];
  hooks: Hook[];
}

export type KindId = keyof KindModel;

export type AgentConfig = KindModel;
