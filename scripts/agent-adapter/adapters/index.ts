import { AgentAdapter } from '../core/adapter';
import { antigravityAdapter } from './antigravity';
import { claudeAdapter } from './claude';

export const adapters: AgentAdapter[] = [claudeAdapter, antigravityAdapter];

export { antigravityAdapter, claudeAdapter };
