"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatToolPayload = formatToolPayload;
exports.ToolExecutionCard = ToolExecutionCard;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const icons_1 = require("../icons");
const ToolStepRow_1 = require("../ToolStepRow");
const formatters_1 = require("../utils/formatters");
function formatToolPayload(data) {
    if (data === undefined || data === null)
        return '';
    if (typeof data === 'string') {
        try {
            return JSON.stringify(JSON.parse(data), null, 2);
        }
        catch {
            return data;
        }
    }
    return JSON.stringify(data, null, 2);
}
function StepSpinner() {
    return ((0, jsx_runtime_1.jsxs)("span", { className: "grid h-3.5 w-3.5 shrink-0 grid-cols-2 gap-0.5", "aria-hidden": "true", children: [(0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:0ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:200ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:600ms]" }), (0, jsx_runtime_1.jsx)("span", { className: "animate-pulse motion-reduce:animate-none rounded-full bg-amber-500 [animation-duration:800ms] [animation-delay:400ms]" })] }));
}
function ToolExecutionCard({ name, label, status: propStatus, summary, args, result, error, durationMs, startedAt, endedAt, running, tone, detail, items, initiallyExpanded = false, expanded: controlledExpanded, onToggle, className = '', }) {
    const [internalExpanded, setInternalExpanded] = (0, react_1.useState)(initiallyExpanded);
    const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
    const [copied, setCopied] = (0, react_1.useState)(false);
    const [now, setNow] = (0, react_1.useState)(() => Date.now());
    // Determine effective execution status
    const effectiveStatus = (() => {
        if (propStatus)
            return propStatus;
        if (running === true)
            return 'running';
        if (tone === 'error' || Boolean(error))
            return 'failed';
        if (endedAt !== undefined)
            return 'success';
        return 'running';
    })();
    const isRunning = effectiveStatus === 'running';
    (0, react_1.useEffect)(() => {
        if (!isRunning)
            return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [isRunning]);
    const handleToggle = () => {
        if (onToggle) {
            onToggle();
        }
        if (controlledExpanded === undefined) {
            setInternalExpanded((prev) => !prev);
        }
    };
    const handleCopy = (text) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    const displayTitle = label || (name ? (0, formatters_1.formatToolDisplayName)(name) : 'Thực thi công cụ');
    const effectiveResult = result ?? detail ?? error ?? '';
    const hasArgs = args && Object.keys(args).length > 0;
    const hasResult = Boolean(effectiveResult);
    const hasSources = items && items.length > 0;
    const canInspect = hasArgs || hasResult || hasSources;
    const effectiveDuration = durationMs ??
        (startedAt !== undefined
            ? Math.max(0, (endedAt ?? (isRunning ? now : endedAt ?? now)) - startedAt)
            : undefined);
    return ((0, jsx_runtime_1.jsxs)("div", { className: `rounded-lg border text-xs transition-all ${isRunning
            ? 'border-amber-400/50 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs'
            : effectiveStatus === 'failed'
                ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10'
                : 'border-[#EBE9E4] bg-white dark:bg-stone-900/60'} ${className}`, children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: canInspect ? handleToggle : undefined, "aria-expanded": canInspect ? isExpanded : undefined, disabled: !canInspect, className: `flex w-full select-none items-center justify-between gap-2.5 px-3 py-2 text-left transition-colors ${canInspect ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex min-w-0 items-center gap-2", children: [effectiveStatus === 'running' ? ((0, jsx_runtime_1.jsx)(StepSpinner, {})) : effectiveStatus === 'failed' ? ((0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-3.5 w-3.5 shrink-0 text-[#B42318]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 shrink-0 text-[#3F7D58]" })), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 truncate", children: [(0, jsx_runtime_1.jsx)("span", { className: `truncate font-medium ${isRunning ? 'text-amber-950 dark:text-amber-200' : 'text-[#1F1E1C] dark:text-stone-100'}`, children: displayTitle }), name && name !== displayTitle && ((0, jsx_runtime_1.jsx)("span", { className: "shrink-0 rounded bg-muted/60 px-1 py-0.2 font-mono text-[10px] text-muted-foreground", children: name }))] }), summary && ((0, jsx_runtime_1.jsx)("p", { className: `truncate text-[11px] ${effectiveStatus === 'failed'
                                            ? 'text-[#B42318]'
                                            : 'text-muted-foreground'}`, children: summary }))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex shrink-0 items-center gap-2", children: [effectiveStatus === 'running' && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300", children: "\u0110ang th\u1EF1c thi..." })), effectiveStatus === 'success' && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300", children: "Ho\u00E0n th\u00E0nh" })), effectiveStatus === 'failed' && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300", children: "Th\u1EA5t b\u1EA1i" })), effectiveDuration !== undefined && ((0, jsx_runtime_1.jsx)("span", { className: "font-mono text-[11px] text-muted-foreground tabular-nums", children: (0, ToolStepRow_1.formatElapsed)(effectiveDuration) })), canInspect && ((0, jsx_runtime_1.jsx)(icons_1.ChevronDownIcon, { className: `h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}` }))] })] }), isExpanded && canInspect && ((0, jsx_runtime_1.jsxs)("div", { className: "border-t border-border/40 px-3 py-2.5 space-y-2.5 bg-black/[0.01] dark:bg-white/[0.01]", children: [hasArgs && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "text-[11px] font-semibold text-muted-foreground tracking-tight", children: "Tham s\u1ED1 (Parameters)" }), (0, jsx_runtime_1.jsx)("pre", { className: "mt-1 max-h-48 overflow-x-auto rounded border border-border/40 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words", children: formatToolPayload(args) })] })), hasResult && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between text-[11px] font-semibold text-muted-foreground tracking-tight", children: [(0, jsx_runtime_1.jsx)("span", { children: "K\u1EBFt qu\u1EA3 (Output)" }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => handleCopy(effectiveResult), className: "inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer", children: [(0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3 w-3" }), (0, jsx_runtime_1.jsx)("span", { children: copied ? 'Đã chép' : 'Sao chép' })] })] }), (0, jsx_runtime_1.jsx)("pre", { className: `mt-1 max-h-60 overflow-x-auto rounded border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words ${effectiveStatus === 'failed'
                                    ? 'border-rose-200 bg-rose-50/40 text-rose-900 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-200'
                                    : 'border-border/40 bg-muted/40 text-foreground'}`, children: formatToolPayload(effectiveResult) })] })), hasSources && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-[11px] font-semibold text-muted-foreground tracking-tight mb-1", children: ["T\u00E0i li\u1EC7u tham kh\u1EA3o (", items.length, ")"] }), (0, jsx_runtime_1.jsx)("ul", { className: "space-y-1", children: items.map((it, idx) => ((0, jsx_runtime_1.jsxs)("li", { className: "flex min-w-0 items-baseline gap-1.5 text-[11px]", children: [(0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", className: "text-muted-foreground", children: "\u2022" }), it.href ? ((0, jsx_runtime_1.jsx)("a", { href: it.href, target: "_blank", rel: "noreferrer", className: "truncate font-medium text-primary underline underline-offset-2 hover:opacity-80", children: it.title })) : ((0, jsx_runtime_1.jsx)("span", { className: "truncate text-foreground", children: it.title })), it.topic && ((0, jsx_runtime_1.jsxs)("span", { className: "shrink-0 text-muted-foreground text-[10px]", children: ["(", it.topic, ")"] }))] }, `${it.href ?? it.title}-${idx}`))) })] }))] }))] }));
}
exports.default = ToolExecutionCard;
