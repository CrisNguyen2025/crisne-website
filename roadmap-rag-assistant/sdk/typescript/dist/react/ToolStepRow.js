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
    return ((0, jsx_runtime_1.jsxs)("span", { className: "grid h-3 w-3 shrink-0 grid-cols-2 gap-0.5", "aria-hidden": "true", children: [(0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:0ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:200ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:600ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-[#6B6862] [animation-duration:800ms] [animation-delay:400ms]" })] }));
}
function StepStatusIcon({ running, tone }) {
    if (running)
        return (0, jsx_runtime_1.jsx)(StepSpinner, {});
    if (tone === "error")
        return (0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-3 w-3 shrink-0 text-[#B42318]" });
    if (tone === "warning")
        return (0, jsx_runtime_1.jsx)(icons_1.AlertTriangleIcon, { className: "h-3 w-3 shrink-0 text-[#B54708]" });
    return (0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3 w-3 shrink-0 text-[#3F7D58]" });
}
function ToolStepRow({ label, summary, tone = "default", startedAt, endedAt, running, detail, items, expanded = false, onToggle, }) {
    const canExpand = !running && (!!detail || (items && items.length > 0)) && !!onToggle;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "text-xs", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: canExpand ? onToggle : undefined, disabled: !canExpand, "aria-expanded": canExpand ? expanded : undefined, className: `group/row flex w-full select-none items-center gap-2 rounded px-2 py-1 text-left transition-colors ${canExpand
                    ? "cursor-pointer hover:bg-[#F4F3F0] text-[#4D4B46]"
                    : "cursor-default text-[#6B6862]"}`, children: [(0, jsx_runtime_1.jsx)(StepStatusIcon, { running: running, tone: tone }), (0, jsx_runtime_1.jsxs)("span", { className: `truncate ${running ? "font-medium text-[#1F1E1C]" : "text-[#4D4B46]"}`, children: [label, summary && ((0, jsx_runtime_1.jsxs)("span", { className: tone === "error"
                                    ? "text-[#B42318]"
                                    : tone === "warning"
                                        ? "text-[#B54708]"
                                        : "text-[#8C8983]", children: [" · ", summary] }))] }), (0, jsx_runtime_1.jsxs)("span", { className: "ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-[#8C8983]", children: [startedAt !== undefined && (running || endedAt !== undefined) && ((0, jsx_runtime_1.jsx)(ElapsedTimer, { startedAt: startedAt, endedAt: running ? undefined : endedAt })), canExpand && ((0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 transition-transform duration-200 text-[#8C8983] group-hover/row:text-[#1F1E1C] ${expanded ? "" : "-rotate-90"}` }))] })] }), canExpand && expanded && ((0, jsx_runtime_1.jsxs)("div", { className: "ml-5 mt-1 mr-1 rounded-md bg-[#F4F3F0]/70 border border-[#E6E4DF] px-2.5 py-1.5 text-[11px] leading-relaxed text-[#4D4B46] whitespace-pre-wrap break-words", children: [detail && (0, jsx_runtime_1.jsx)("div", { className: items?.length ? "mb-1" : "", children: detail }), items && items.length > 0 && ((0, jsx_runtime_1.jsx)("ul", { className: "space-y-0.5", children: items.map((it, idx) => ((0, jsx_runtime_1.jsxs)("li", { className: "flex min-w-0 items-baseline gap-1.5", children: [(0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", className: "text-[#8C8983]", children: "\u2022" }), it.href ? ((0, jsx_runtime_1.jsx)("a", { href: it.href, className: "truncate font-medium text-[#1F1E1C] underline decoration-[#C2410C]/40 underline-offset-2 hover:decoration-[#C2410C]", children: it.title })) : ((0, jsx_runtime_1.jsx)("span", { className: "truncate", children: it.title })), it.topic && (0, jsx_runtime_1.jsx)("span", { className: "shrink-0 text-[#8C8983]", children: it.topic })] }, `${it.href ?? it.title}-${idx}`))) }))] }))] }));
}
function CollapsibleStepsSummary({ steps, expandedTools, onToggleTool, isLive = false, }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    if (steps.length === 0)
        return null;
    const runningStep = [...steps].reverse().find((s) => s.running);
    const anyRunning = runningStep !== undefined;
    const anyError = steps.some((s) => s.tone === "error");
    const firstStartedAt = steps.find((s) => s.startedAt !== undefined)?.startedAt;
    const lastEndedAt = anyRunning
        ? undefined
        : steps
            .filter((s) => s.endedAt !== undefined)
            .reduce((max, s) => (max === undefined || (s.endedAt ?? 0) > max ? s.endedAt : max), undefined);
    const totalDuration = firstStartedAt !== undefined && lastEndedAt !== undefined
        ? formatElapsed(lastEndedAt - firstStartedAt)
        : undefined;
    // Like Claude: the live header names what is happening now, then sums up the turn.
    const headerLabel = runningStep
        ? runningStep.label
        : totalDuration
            ? `Đã suy nghĩ ${totalDuration}`
            : "Đã suy nghĩ";
    return ((0, jsx_runtime_1.jsxs)("div", { className: "text-xs", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setIsOpen((prev) => !prev), "aria-expanded": isOpen, className: "group/btn inline-flex items-center gap-1.5 py-0.5 text-left text-[#6B6862] hover:text-[#1F1E1C] cursor-pointer transition-colors select-none font-medium", children: [anyRunning ? ((0, jsx_runtime_1.jsx)(StepSpinner, {})) : anyError ? ((0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-3.5 w-3.5 text-[#B42318]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-[#3F7D58]" })), (0, jsx_runtime_1.jsx)("span", { className: "text-xs tracking-tight", children: headerLabel }), anyRunning && firstStartedAt !== undefined && ((0, jsx_runtime_1.jsx)("span", { className: "text-[11px] text-[#8C8983]", children: (0, jsx_runtime_1.jsx)(ElapsedTimer, { startedAt: firstStartedAt }) })), (0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 text-[#8C8983] transition-transform duration-200 group-hover/btn:text-[#1F1E1C] ${isOpen ? "" : "-rotate-90"}` })] }), isOpen && ((0, jsx_runtime_1.jsx)("div", { className: "relative mt-1.5 ml-1 pl-3 border-l border-[#E6E4DF] space-y-1 py-0.5 animate-in fade-in duration-150", children: steps.map((s) => ((0, jsx_runtime_1.jsx)(ToolStepRow, { label: s.label, summary: s.summary, tone: s.tone, startedAt: s.startedAt, endedAt: s.endedAt, running: s.running, detail: s.detail, items: s.items, expanded: expandedTools[s.id] ?? false, onToggle: () => onToggleTool(s.id) }, s.id))) }))] }));
}
