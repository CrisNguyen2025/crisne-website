export interface ThoughtProcessProps {
    thinking?: string;
    durationMs?: number;
    thinkingDurationMs?: number;
    isThinking?: boolean;
    isLive?: boolean;
    startedAt?: number;
    endedAt?: number;
    initiallyExpanded?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    className?: string;
}
export declare function formatThoughtBadge(ms: number, isThinking: boolean): string;
export declare function ThoughtProcess({ thinking, durationMs, thinkingDurationMs, isThinking, isLive, startedAt, endedAt, initiallyExpanded, expanded: controlledExpanded, onToggle, className, }: ThoughtProcessProps): import("react/jsx-runtime").JSX.Element | null;
export default ThoughtProcess;
