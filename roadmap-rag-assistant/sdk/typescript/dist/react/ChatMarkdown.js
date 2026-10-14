"use client";
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlocks = parseBlocks;
exports.renderInline = renderInline;
exports.StreamingCaret = StreamingCaret;
exports.ChatMarkdown = ChatMarkdown;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const icons_1 = require("./icons");
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
function parseBlocks(content) {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }
        const fence = line.match(FENCE);
        if (fence) {
            const body = [];
            i++;
            // An unclosed fence (still streaming) runs to the end of the content.
            while (i < lines.length && !FENCE.test(lines[i]))
                body.push(lines[i++]);
            i++;
            blocks.push({ kind: "code", lang: fence[1], code: body.join("\n") });
            continue;
        }
        if (RULE.test(line)) {
            blocks.push({ kind: "rule" });
            i++;
            continue;
        }
        const heading = line.match(HEADING);
        if (heading) {
            blocks.push({
                kind: "heading",
                level: Math.min(heading[1].length, 4),
                text: heading[2],
            });
            i++;
            continue;
        }
        if (/^\s*>/.test(line)) {
            const quote = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) {
                quote.push(lines[i++].replace(/^\s*>\s?/, ""));
            }
            blocks.push({ kind: "quote", lines: quote });
            continue;
        }
        const first = line.match(LIST_ITEM);
        if (first) {
            const ordered = /\d/.test(first[2]);
            const list = {
                kind: "list",
                ordered,
                items: [],
            };
            while (i < lines.length) {
                const m = lines[i].match(LIST_ITEM);
                if (!m)
                    break;
                const nested = m[1].replace(/\t/g, "  ").length >= 2;
                const sameKind = /\d/.test(m[2]) === ordered;
                if (!nested && !sameKind)
                    break; // a different top-level list starts here
                const item = {
                    text: m[3],
                    num: parseInt(m[2], 10),
                    ordered: /\d/.test(m[2]),
                    children: [],
                };
                const parent = list.items[list.items.length - 1];
                if (nested && parent)
                    parent.children.push(item);
                else
                    list.items.push(item);
                i++;
            }
            blocks.push(list);
            continue;
        }
        const para = [];
        while (i < lines.length &&
            lines[i].trim() &&
            !FENCE.test(lines[i]) &&
            !HEADING.test(lines[i]) &&
            !LIST_ITEM.test(lines[i]) &&
            !RULE.test(lines[i]) &&
            !/^\s*>/.test(lines[i])) {
            para.push(lines[i++]);
        }
        blocks.push({ kind: "paragraph", lines: para });
    }
    return blocks;
}
// ── Inline ────────────────────────────────────────────────────────────────
// _italic_ only at word boundaries, so snake_case identifiers stay intact.
const INLINE = /(`[^`\n]+`)|(\*\*(.*?)\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(\*([^*\s][^*\n]*?)\*)|((?<![\w])_([^_\n]+)_(?![\w]))/g;
function safeHref(url) {
    if (/^https?:\/\//i.test(url))
        return { href: url, external: true };
    if (/^(\/|#|mailto:)/i.test(url))
        return { href: url, external: false };
    return null; // javascript:, data:, relative junk — rendered as plain text
}
function renderInline(text) {
    const out = [];
    let last = 0;
    let key = 0;
    // Fresh regex per call: renderInline recurses for bold/italic, and a shared
    // global regex would have its lastIndex reset under the outer loop.
    const re = new RegExp(INLINE.source, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last)
            out.push(text.slice(last, m.index));
        if (m[1]) {
            out.push((0, jsx_runtime_1.jsx)("code", { className: "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground", children: m[1].slice(1, -1) }, key++));
        }
        else if (m[2] !== undefined) {
            out.push((0, jsx_runtime_1.jsx)("strong", { className: "font-semibold text-foreground", children: renderInline(m[3]) }, key++));
        }
        else if (m[4]) {
            const link = safeHref(m[6]);
            out.push(link ? ((0, jsx_runtime_1.jsx)("a", { href: link.href, ...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {}), className: "font-medium text-foreground underline decoration-primary/50 underline-offset-2 hover:decoration-primary", children: m[5] }, key++)) : (m[5]));
        }
        else if (m[7] || m[9]) {
            out.push((0, jsx_runtime_1.jsx)("em", { className: "italic", children: renderInline(m[8] ?? m[10]) }, key++));
        }
        last = m.index + m[0].length;
    }
    if (last < text.length)
        out.push(text.slice(last));
    return out;
}
// ── Blocks ────────────────────────────────────────────────────────────────
function CodeBlock({ lang, code, onRun, }) {
    const [copied, setCopied] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (!copied)
            return;
        const id = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(id);
    }, [copied]);
    const copy = () => {
        navigator.clipboard?.writeText(code).then(() => setCopied(true), () => { });
    };
    const Icon = copied ? icons_1.CheckIcon : icons_1.CopyIcon;
    // One-line snippet (e.g. a prompt suggestion): compact row, icon-only copy.
    if ((!lang || lang === "text") && !code.includes("\n")) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-3 pr-1.5", children: [(0, jsx_runtime_1.jsx)("code", { className: "min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs text-foreground", children: code }), onRun && ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onRun(code.trim()), "aria-label": "G\u1EEDi l\u1EC7nh n\u00E0y", title: "G\u1EEDi", className: "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", children: (0, jsx_runtime_1.jsx)(icons_1.PlayIcon, { className: "h-3.5 w-3.5" }) })), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: copy, "aria-label": copied ? "Đã sao chép" : "Sao chép", title: copied ? "Đã chép" : "Chép", className: "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", children: (0, jsx_runtime_1.jsx)(Icon, { className: "h-3.5 w-3.5" }) })] }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between border-b border-border px-3 py-1.5", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-mono text-xs text-muted-foreground", children: lang || "code" }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: copy, "aria-label": copied ? "Đã sao chép" : "Sao chép code", className: "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", children: [copied ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" })), (0, jsx_runtime_1.jsx)("span", { children: copied ? "Đã chép" : "Chép" })] })] }), (0, jsx_runtime_1.jsx)("pre", { className: "overflow-x-auto p-3 font-mono text-xs leading-relaxed", children: (0, jsx_runtime_1.jsx)("code", { children: code }) })] }));
}
const HEADING_TAG = ["h3", "h3", "h4", "h5"];
const HEADING_CLASS = [
    "text-base font-semibold",
    "text-sm font-semibold",
    "text-sm font-semibold",
    "text-sm font-medium",
];
function ListView({ ordered, items, trailing, }) {
    const Tag = ordered ? "ol" : "ul";
    return ((0, jsx_runtime_1.jsx)(Tag, { className: "space-y-1", children: items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return ((0, jsx_runtime_1.jsxs)("li", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("span", { className: "shrink-0 select-none tabular-nums text-muted-foreground", children: ordered ? `${item.num}.` : "•" }), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0 flex-1", children: [renderInline(item.text), isLast && !item.children.length && trailing, item.children.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "mt-1", children: (0, jsx_runtime_1.jsx)(ListView, { ordered: item.children[0].ordered, items: item.children, trailing: isLast ? trailing : undefined }) }))] })] }, idx));
        }) }));
}
function BlockView({ block, trailing, onRun, }) {
    switch (block.kind) {
        case "heading": {
            const Tag = HEADING_TAG[block.level - 1];
            return ((0, jsx_runtime_1.jsxs)(Tag, { className: `pt-1 text-foreground ${HEADING_CLASS[block.level - 1]}`, children: [renderInline(block.text), trailing] }));
        }
        case "paragraph":
            return ((0, jsx_runtime_1.jsxs)("p", { children: [block.lines.map((line, idx) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [idx > 0 && (0, jsx_runtime_1.jsx)("br", {}), renderInline(line)] }, idx))), trailing] }));
        case "list":
            return ((0, jsx_runtime_1.jsx)(ListView, { ordered: block.ordered, items: block.items, trailing: trailing }));
        case "code":
            return (0, jsx_runtime_1.jsx)(CodeBlock, { lang: block.lang, code: block.code, onRun: onRun });
        case "quote":
            return ((0, jsx_runtime_1.jsxs)("blockquote", { className: "border-l-2 border-border pl-3 text-muted-foreground", children: [block.lines.map((line, idx) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [idx > 0 && (0, jsx_runtime_1.jsx)("br", {}), renderInline(line)] }, idx))), trailing] }));
        case "rule":
            return (0, jsx_runtime_1.jsx)("hr", { className: "border-border" });
    }
}
/** Thin caret shown at the end of a streaming answer. */
function StreamingCaret() {
    return ((0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", className: "ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" }));
}
function ChatMarkdown({ content, streaming = false, className = "", onRun, }) {
    const blocks = parseBlocks(content);
    const caret = streaming ? (0, jsx_runtime_1.jsx)(StreamingCaret, {}) : null;
    const last = blocks[blocks.length - 1];
    const caretInline = !!last && last.kind !== "code" && last.kind !== "rule";
    return ((0, jsx_runtime_1.jsxs)("div", { className: `min-w-0 space-y-3 break-words text-sm leading-relaxed text-foreground ${className}`, children: [blocks.map((block, idx) => ((0, jsx_runtime_1.jsx)(BlockView, { block: block, onRun: onRun, trailing: idx === blocks.length - 1 && caretInline ? caret : undefined }, idx))), !caretInline && caret] }));
}
