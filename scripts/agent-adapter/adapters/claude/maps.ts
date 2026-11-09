import { ModelTier, ToolCategory } from '../../core/model';

export const CLAUDE_TOOL_MAP: Record<ToolCategory, string[]> = {
  read: ['Read', 'Grep', 'Glob'],
  shell: ['Bash'],
  edit: ['Edit', 'Write'],
};

export const CLAUDE_MODEL_MAP: Record<ModelTier, string> = {
  fast: 'haiku',
  strong: 'opus',
  inherit: 'inherit',
};
