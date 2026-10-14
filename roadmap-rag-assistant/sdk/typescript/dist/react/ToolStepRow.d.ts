export declare function formatElapsed(ms: number): string;
export interface ToolStepRowProps {
    label: string;
    startedAt?: number;
    endedAt?: number;
    running: boolean;
    /** Expanded body; when absent the row is not clickable. */
    detail?: string;
    expanded?: boolean;
    onToggle?: () => void;
}
export declare function ToolStepRow({ label, startedAt, endedAt, running, detail, expanded, onToggle, }: ToolStepRowProps): import("react/jsx-runtime").JSX.Element;
export interface StepItem {
    id: string;
    label: string;
    startedAt?: number;
    endedAt?: number;
    running: boolean;
    detail?: string;
}
export interface CollapsibleStepsSummaryProps {
    steps: StepItem[];
    expandedTools: Record<string, boolean>;
    onToggleTool: (id: string) => void;
    isLive?: boolean;
}
export declare function CollapsibleStepsSummary({ steps, expandedTools, onToggleTool, isLive, }: CollapsibleStepsSummaryProps): import("react/jsx-runtime").JSX.Element | null;
