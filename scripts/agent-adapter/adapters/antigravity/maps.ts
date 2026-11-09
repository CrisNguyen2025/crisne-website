import { ToolCategory } from '../../core/model';

export const ANTIGRAVITY_TOOL_MAP: Record<ToolCategory, string[]> = {
  read: ['read_file'],
  shell: ['run_command'],
  edit: ['edit_file', 'write_file'],
};
