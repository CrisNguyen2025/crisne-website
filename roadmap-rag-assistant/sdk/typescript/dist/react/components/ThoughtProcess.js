"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatThoughtBadge = formatThoughtBadge;
exports.ThoughtProcess = ThoughtProcess;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const icons_1 = require("../icons");
function formatThoughtBadge(ms, isThinking) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (isThinking) {
        return `Thinking (${seconds}s)...`;
    }
    return `Đã suy nghĩ ${seconds} giây`;
}
function ThoughtProcess({ thinking, durationMs, thinkingDurationMs, isThinking = false, isLive = false, startedAt, endedAt, initiallyExpanded = false, expanded: controlledExpanded, onToggle, className = '', }) {
    const [internalExpanded, setInternalExpanded] = (0, react_1.useState)(initiallyExpanded);
    const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
    const [now, setNow] = (0, react_1.useState)(() => Date.now());
    (0, react_1.useEffect)(() => {
        if (!isThinking && !isLive)
            return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [isThinking, isLive]);
    const effectiveDuration = durationMs ??
        thinkingDurationMs ??
        (startedAt !== undefined ? Math.max(0, (endedAt ?? now) - startedAt) : 1000);
    const seconds = Math.max(1, Math.round(effectiveDuration / 1000));
    const headerLabel = isThinking
        ? `Thinking (${seconds}s)...`
        : `Đã suy nghĩ ${seconds} giây`;
    const handleToggle = () => {
        if (onToggle) {
            onToggle();
        }
        if (controlledExpanded === undefined) {
            setInternalExpanded((prev) => !prev);
        }
    };
    if (!thinking && !isThinking) {
        return null;
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: `my-2 text-xs ${className}`, children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", "aria-expanded": isExpanded, onClick: handleToggle, className: "group/thought flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer font-medium select-none transition-colors", children: [isThinking ? ((0, jsx_runtime_1.jsx)("span", { className: "inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0", "aria-hidden": "true" })) : ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-[#3F7D58] shrink-0" })), (0, jsx_runtime_1.jsx)("span", { className: "tracking-tight", children: headerLabel }), (0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 text-muted-foreground transition-transform duration-200 group-hover/thought:text-foreground ${isExpanded ? '' : '-rotate-90'}` })] }), isExpanded && ((0, jsx_runtime_1.jsx)("div", { className: "mt-1.5 border-l-2 border-primary/30 border-muted-foreground/30 pl-3 py-1 text-muted-foreground/80 text-muted-foreground font-mono text-xs leading-relaxed italic whitespace-pre-wrap rounded-r-md bg-muted/20 p-2.5", children: thinking || (isThinking ? 'Đang suy nghĩ...' : '') }))] }));
}
exports.default = ThoughtProcess;
