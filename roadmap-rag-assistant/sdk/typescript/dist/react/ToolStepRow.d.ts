export declare function formatElapsed(ms: number): string;
/** A source found by a retrieval step; rendered as a link when it has `href`. */
export interface StepSource {
    title: string;
    topic?: string;
    href?: string;
}
/** `warning`: finished but needs a look (guard issues, interrupted). `error`: failed. */
export type StepTone = "default" | "warning" | "error";
export interface ToolStepRowProps {
    label: string;
    /** Short result shown after the label, e.g. "2 tài liệu". */
    summary?: string;
    tone?: StepTone;
    startedAt?: number;
    endedAt?: number;
    running: boolean;
    /** Expanded body; when absent (and no items) the row is not clickable. */
    detail?: string;
    items?: StepSource[];
    expanded?: boolean;
    onToggle?: () => void;
}
export declare function ToolStepRow({ label, summary, tone, startedAt, endedAt, running, detail, items, expanded, onToggle, }: ToolStepRowProps): import("react/jsx-runtime").JSX.Element;
export interface StepItem {
    id: string;
    label: string;
    summary?: string;
    tone?: StepTone;
    startedAt?: number;
    endedAt?: number;
    running: boolean;
    detail?: string;
    items?: StepSource[];
}
export interface CollapsibleStepsSummaryProps {
    steps: StepItem[];
    expandedTools: Record<string, boolean>;
    onToggleTool: (id: string) => void;
    isLive?: boolean;
}
export declare function CollapsibleStepsSummary({ steps, expandedTools, onToggleTool, isLive, }: CollapsibleStepsSummaryProps): import("react/jsx-runtime").JSX.Element | null;
