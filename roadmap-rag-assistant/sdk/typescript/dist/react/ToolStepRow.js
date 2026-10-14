"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatElapsed = formatElapsed;
exports.ToolStepRow = ToolStepRow;
exports.CollapsibleStepsSummary = CollapsibleStepsSummary;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const icons_1 = require("./icons");
function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 1)
        return "<1s";
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
/** Re-renders every second while running; frozen once `endedAt` is set. */
function ElapsedTimer({ startedAt, endedAt, }) {
    const [now, setNow] = (0, react_1.useState)(() => Date.now());
    (0, react_1.useEffect)(() => {
        if (endedAt !== undefined)
            return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [endedAt]);
    return ((0, jsx_runtime_1.jsx)("span", { className: "tabular-nums", children: formatElapsed((endedAt ?? now) - startedAt) }));
}
/** 2×2 dot grid that pulses in sequence. Neutral gray spinner. */
function StepSpinner() {
    return ((0, jsx_runtime_1.jsxs)("span", { className: "grid h-3 w-3 shrink-0 grid-cols-2 gap-0.5", "aria-hidden": "true", children: [(0, jsx_runtime_1.jsx)("span", { className: "animate-pulse rounded-full bg-[#6B6862]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse rounded-full bg-[#6B6862] [animation-delay:150ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse rounded-full bg-[#6B6862] [animation-delay:450ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse rounded-full bg-[#6B6862] [animation-delay:300ms]" })] }));
}
function ToolStepRow({ label, startedAt, endedAt, running, detail, expanded = false, onToggle, }) {
    const canExpand = !running && !!detail && !!onToggle;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "font-mono text-xs", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: canExpand ? onToggle : undefined, disabled: !canExpand, "aria-expanded": canExpand ? expanded : undefined, className: `flex w-full select-none items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${canExpand ? "cursor-pointer hover:bg-[#ECEAE5]" : "cursor-default"}`, children: [running ? ((0, jsx_runtime_1.jsx)(StepSpinner, {})) : ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3 w-3 text-[#3F7D58]" })), (0, jsx_runtime_1.jsx)("span", { className: `truncate ${running ? "text-[#1F1E1C] font-medium" : "text-[#6B6862]"}`, children: label }), (0, jsx_runtime_1.jsxs)("span", { className: "ml-auto flex shrink-0 items-center gap-1 text-[#6B6862]", children: [startedAt !== undefined && (running || endedAt !== undefined) && ((0, jsx_runtime_1.jsx)(ElapsedTimer, { startedAt: startedAt, endedAt: running ? undefined : endedAt })), canExpand && ((0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}` }))] })] }), canExpand && expanded && ((0, jsx_runtime_1.jsx)("div", { className: "ml-5 mt-1 whitespace-pre-wrap break-words rounded-md border border-[#E6E4DF] bg-[#F4F3F0] p-2.5 leading-relaxed text-[#1F1E1C]", children: detail }))] }));
}
function CollapsibleStepsSummary({ steps, expandedTools, onToggleTool, isLive = false, }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    if (steps.length === 0)
        return null;
    const anyRunning = steps.some((s) => s.running);
    // Last action
    const lastStep = steps[steps.length - 1];
    // Overall start and end
    const firstStartedAt = steps.find((s) => s.startedAt !== undefined)?.startedAt;
    const lastEndedAt = anyRunning
        ? undefined
        : steps
            .filter((s) => s.endedAt !== undefined)
            .reduce((max, s) => (max === undefined || (s.endedAt ?? 0) > max ? s.endedAt : max), undefined);
    // If there is only 1 step, show it directly as a clean single row (can expand its details if available)
    if (steps.length === 1) {
        const single = steps[0];
        return ((0, jsx_runtime_1.jsx)(ToolStepRow, { label: single.label, startedAt: single.startedAt, endedAt: single.endedAt, running: single.running, detail: single.detail, expanded: !!expandedTools[single.id], onToggle: () => onToggleTool(single.id) }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "font-mono text-xs", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setIsOpen((prev) => !prev), "aria-expanded": isOpen, className: "flex w-full select-none items-center gap-2 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-2.5 py-1.5 text-left transition-colors hover:bg-[#ECEAE5] cursor-pointer", children: [anyRunning ? ((0, jsx_runtime_1.jsx)(StepSpinner, {})) : ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3 w-3 text-[#3F7D58]" })), (0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-1.5 truncate text-[#6B6862]", children: [(0, jsx_runtime_1.jsx)("span", { className: anyRunning ? "font-medium text-[#1F1E1C]" : "text-[#6B6862]", children: lastStep.label }), (0, jsx_runtime_1.jsxs)("span", { className: "rounded bg-[#FFFFFF] px-1.5 py-0.2 text-[10px] text-[#6B6862] border border-[#E6E4DF]", children: ["+", steps.length - 1] })] }), (0, jsx_runtime_1.jsxs)("span", { className: "ml-auto flex shrink-0 items-center gap-1 text-[#6B6862]", children: [firstStartedAt !== undefined && ((0, jsx_runtime_1.jsx)(ElapsedTimer, { startedAt: firstStartedAt, endedAt: lastEndedAt })), (0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}` })] })] }), isOpen && ((0, jsx_runtime_1.jsx)("div", { className: "mt-1 space-y-0.5 rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] p-1", children: steps.map((s) => ((0, jsx_runtime_1.jsx)(ToolStepRow, { label: s.label, startedAt: s.startedAt, endedAt: s.endedAt, running: s.running, detail: s.detail, expanded: !!expandedTools[s.id], onToggle: () => onToggleTool(s.id) }, s.id))) }))] }));
}
