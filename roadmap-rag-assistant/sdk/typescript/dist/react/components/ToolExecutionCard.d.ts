import { type StepSource, type StepTone } from '../ToolStepRow';
export interface ToolExecutionCardProps {
    id?: string;
    name?: string;
    label?: string;
    status?: 'running' | 'success' | 'failed';
    summary?: string;
    args?: Record<string, unknown>;
    result?: string;
    error?: string;
    durationMs?: number;
    startedAt?: number;
    endedAt?: number;
    running?: boolean;
    tone?: StepTone;
    detail?: string;
    items?: StepSource[];
    initiallyExpanded?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    className?: string;
}
export declare function formatToolPayload(data: unknown): string;
export declare function ToolExecutionCard({ name, label, status: propStatus, summary, args, result, error, durationMs, startedAt, endedAt, running, tone, detail, items, initiallyExpanded, expanded: controlledExpanded, onToggle, className, }: ToolExecutionCardProps): import("react/jsx-runtime").JSX.Element;
export default ToolExecutionCard;
