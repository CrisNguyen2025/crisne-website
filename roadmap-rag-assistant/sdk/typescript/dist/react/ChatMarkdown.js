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
const CodeBlock_1 = require("./components/CodeBlock");
const MarkdownTable_1 = require("./components/MarkdownTable");
const CalloutAlert_1 = require("./components/CalloutAlert");
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
const CHECKLIST_ITEM = /^\[([ xX])\]\s*(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("-"))
        return false;
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(trimmed);
}
function splitTableRow(rowStr) {
    let trimmed = rowStr.trim();
    if (trimmed.startsWith("|"))
        trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|"))
        trimmed = trimmed.slice(0, -1);
    const escaped = trimmed.replace(/\\\|/g, "__ESCAPED_PIPE__");
    return escaped
        .split("|")
        .map((cell) => cell.replace(/__ESCAPED_PIPE__/g, "|").trim());
}
function parseTableAlignments(sepStr) {
    const cells = splitTableRow(sepStr);
    return cells.map((cell) => {
        const c = cell.trim();
        const leftColon = c.startsWith(":");
        const rightColon = c.endsWith(":");
        if (leftColon && rightColon)
            return "center";
        if (rightColon)
            return "right";
        return "left";
    });
}
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
        // 1. Fenced Code Block
        const fence = line.match(FENCE);
        if (fence) {
            const body = [];
            i++;
            while (i < lines.length && !FENCE.test(lines[i])) {
                body.push(lines[i++]);
            }
            i++;
            blocks.push({ kind: "code", lang: fence[1], code: body.join("\n") });
            continue;
        }
        // 2. Block Math ($$...$$)
        const mathMatch = line.match(/^\s*\$\$(.*)$/);
        if (mathMatch) {
            const rest = mathMatch[1].trim();
            if (rest.endsWith("$$") && rest.length >= 2) {
                // Single-line block math
                const formula = rest.slice(0, -2).trim();
                blocks.push({ kind: "math", math: formula, display: true });
                i++;
                continue;
            }
            // Multiline block math
            const body = [];
            if (rest)
                body.push(rest);
            i++;
            while (i < lines.length) {
                const currentLine = lines[i];
                if (currentLine.includes("$$")) {
                    const beforeEnd = currentLine.replace(/\$\$.*$/, "").trim();
                    if (beforeEnd)
                        body.push(beforeEnd);
                    i++;
                    break;
                }
                body.push(currentLine);
                i++;
            }
            blocks.push({ kind: "math", math: body.join("\n"), display: true });
            continue;
        }
        // 3. Markdown Table (| Header 1 | Header 2 |)
        if (line.includes("|") &&
            i + 1 < lines.length &&
            isTableSeparator(lines[i + 1])) {
            const headerLine = lines[i++];
            const sepLine = lines[i++];
            const headers = splitTableRow(headerLine);
            const alignments = parseTableAlignments(sepLine);
            const rows = [];
            while (i < lines.length) {
                const rowLine = lines[i];
                if (!rowLine.trim() ||
                    !rowLine.includes("|") ||
                    FENCE.test(rowLine) ||
                    HEADING.test(rowLine) ||
                    RULE.test(rowLine) ||
                    /^\s*>/.test(rowLine)) {
                    break;
                }
                rows.push(splitTableRow(rowLine));
                i++;
            }
            blocks.push({ kind: "table", headers, alignments, rows });
            continue;
        }
        // 4. Horizontal Rule
        if (RULE.test(line)) {
            blocks.push({ kind: "rule" });
            i++;
            continue;
        }
        // 5. Headings (# H1 to #### H4)
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
        // 6. Blockquote or GitHub Alert (> [!NOTE])
        if (/^\s*>/.test(line)) {
            const quoteLines = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) {
                quoteLines.push(lines[i++].replace(/^\s*>\s?/, ""));
            }
            if (quoteLines.length > 0) {
                const firstLine = quoteLines[0].trim();
                const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
                if (alertMatch) {
                    const alertType = alertMatch[1].toLowerCase();
                    const customTitle = alertMatch[2].trim() || undefined;
                    const bodyLines = quoteLines.slice(1);
                    blocks.push({
                        kind: "alert",
                        alertType,
                        title: customTitle,
                        lines: bodyLines,
                    });
                    continue;
                }
            }
            blocks.push({ kind: "quote", lines: quoteLines });
            continue;
        }
        // 7. Lists & Checklists (ordered / unordered with arbitrary nesting)
        const firstListMatch = line.match(LIST_ITEM);
        if (firstListMatch) {
            const ordered = /\d/.test(firstListMatch[2]);
            const listBlock = {
                kind: "list",
                ordered,
                items: [],
            };
            const stack = [];
            while (i < lines.length) {
                const m = lines[i].match(LIST_ITEM);
                if (!m)
                    break;
                const indent = m[1].replace(/\t/g, "  ").length;
                const isItemOrdered = /\d/.test(m[2]);
                if (indent === 0 && stack.length > 0 && isItemOrdered !== ordered) {
                    break;
                }
                const checkMatch = m[3].match(CHECKLIST_ITEM);
                const checked = checkMatch
                    ? checkMatch[1].toLowerCase() === "x"
                    : undefined;
                const itemText = checkMatch ? checkMatch[2] : m[3];
                const newItem = {
                    text: itemText,
                    num: parseInt(m[2], 10) || 1,
                    ordered: isItemOrdered,
                    checked,
                    children: [],
                };
                while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }
                if (stack.length === 0) {
                    listBlock.items.push(newItem);
                    stack.push({ indent, item: newItem });
                }
                else {
                    const parent = stack[stack.length - 1].item;
                    parent.children.push(newItem);
                    stack.push({ indent, item: newItem });
                }
                i++;
            }
            blocks.push(listBlock);
            continue;
        }
        // 8. Normal Paragraph
        const para = [];
        while (i < lines.length &&
            lines[i].trim() &&
            !FENCE.test(lines[i]) &&
            !lineStartsWithMath(lines[i]) &&
            !HEADING.test(lines[i]) &&
            !LIST_ITEM.test(lines[i]) &&
            !RULE.test(lines[i]) &&
            !/^\s*>/.test(lines[i]) &&
            !isTableLine(lines, i)) {
            para.push(lines[i++]);
        }
        blocks.push({ kind: "paragraph", lines: para });
    }
    return blocks;
}
function lineStartsWithMath(line) {
    return /^\s*\$\$/.test(line);
}
function isTableLine(lines, idx) {
    if (!lines[idx].includes("|"))
        return false;
    if (idx + 1 < lines.length && isTableSeparator(lines[idx + 1]))
        return true;
    return false;
}
// ── Inline Renderer ────────────────────────────────────────────────────────
const INLINE = /(`[^`\n]+`)|(\*\*(.*?)\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|((?<!\$)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$))|(\*([^*\s][^*\n]*?)\*)|((?<![\w])_([^_\n]+)_(?![\w]))/g;
function safeHref(url) {
    if (/^https?:\/\//i.test(url))
        return { href: url, external: true };
    if (/^(\/|#|mailto:)/i.test(url))
        return { href: url, external: false };
    return null;
}
function fadeWords(text, base) {
    const out = [];
    const re = /(\S+)(\s*)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        out.push((0, jsx_runtime_1.jsx)("span", { className: "animate-stream-fade", children: m[1] }, `w${base + m.index}`));
        if (m[2])
            out.push(m[2]);
    }
    return out;
}
function MathView({ math, display = false, }) {
    const renderedHtml = (0, react_1.useMemo)(() => {
        if (typeof window !== "undefined" &&
            window
                .katex?.renderToString) {
            try {
                return window.katex.renderToString(math, {
                    displayMode: display,
                    throwOnError: false,
                });
            }
            catch {
                return null;
            }
        }
        return null;
    }, [math, display]);
    if (renderedHtml) {
        if (display) {
            return ((0, jsx_runtime_1.jsx)("div", { className: "my-3 overflow-x-auto rounded-lg border border-border/80 bg-muted/30 p-3.5 text-center text-sm shadow-xs touch-pan-x", dangerouslySetInnerHTML: { __html: renderedHtml } }));
        }
        return ((0, jsx_runtime_1.jsx)("span", { className: "mx-0.5 inline-block text-[0.95em]", dangerouslySetInnerHTML: { __html: renderedHtml } }));
    }
    // Graceful fallback when KaTeX is not loaded on page
    if (display) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "my-3 overflow-x-auto rounded-lg border border-border/80 bg-muted/40 p-3.5 text-xs shadow-xs touch-pan-x", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-border/50 text-[11px] font-medium text-muted-foreground", children: [(0, jsx_runtime_1.jsx)("span", { className: "rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary", children: "Math" }), (0, jsx_runtime_1.jsx)("span", { className: "font-mono text-[10px] text-muted-foreground/70", children: "LaTeX" })] }), (0, jsx_runtime_1.jsx)("div", { className: "py-1 text-center font-mono font-medium text-sm text-foreground", children: math })] }));
    }
    return ((0, jsx_runtime_1.jsxs)("span", { className: "mx-0.5 inline-flex items-center rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground", children: [(0, jsx_runtime_1.jsx)("span", { className: "mr-1 select-none font-sans text-[10px] font-semibold text-muted-foreground", children: "fx" }), (0, jsx_runtime_1.jsx)("span", { className: "font-mono", children: math })] }));
}
function renderInline(text, fade = false) {
    const plain = (start, end) => fade ? fadeWords(text.slice(start, end), start) : [text.slice(start, end)];
    const out = [];
    let last = 0;
    let key = 0;
    const re = new RegExp(INLINE.source, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last)
            out.push(...plain(last, m.index));
        if (m[1]) {
            // Inline code `...`
            out.push((0, jsx_runtime_1.jsx)("code", { className: "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground", children: m[1].slice(1, -1) }, key++));
        }
        else if (m[2] !== undefined) {
            // Bold **...**
            out.push((0, jsx_runtime_1.jsx)("strong", { className: "font-semibold text-foreground", children: renderInline(m[3], fade) }, key++));
        }
        else if (m[4]) {
            // Link [text](url)
            const link = safeHref(m[6]);
            out.push(link ? ((0, jsx_runtime_1.jsx)("a", { href: link.href, ...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {}), className: "font-medium text-foreground underline decoration-primary/50 underline-offset-2 hover:decoration-primary", children: m[5] }, key++)) : (m[5]));
        }
        else if (m[7] !== undefined) {
            // Inline math $...$
            out.push((0, jsx_runtime_1.jsx)(MathView, { math: m[8], display: false }, key++));
        }
        else if (m[9] || m[11]) {
            // Italic *...* or _..._
            out.push((0, jsx_runtime_1.jsx)("em", { className: "italic", children: renderInline(m[10] ?? m[12], fade) }, key++));
        }
        last = m.index + m[0].length;
    }
    if (last < text.length)
        out.push(...plain(last, text.length));
    return out;
}
// ── Typographic Headings ──────────────────────────────────────────────────
const HEADING_CLASSES = {
    1: "text-lg font-bold pb-1.5 border-b border-border/50 text-foreground tracking-tight",
    2: "text-base font-semibold pb-1 border-b border-border/30 text-foreground",
    3: "text-sm font-semibold text-foreground",
    4: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
};
function HeadingView({ level, text, trailing, fade, }) {
    const className = `pt-1.5 ${HEADING_CLASSES[level] || HEADING_CLASSES[4]}`;
    const children = ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [renderInline(text, fade), trailing] }));
    switch (level) {
        case 1:
            return (0, jsx_runtime_1.jsx)("h1", { className: className, children: children });
        case 2:
            return (0, jsx_runtime_1.jsx)("h2", { className: className, children: children });
        case 3:
            return (0, jsx_runtime_1.jsx)("h3", { className: className, children: children });
        case 4:
        default:
            return (0, jsx_runtime_1.jsx)("h4", { className: className, children: children });
    }
}
// ── Lists and Checklists ──────────────────────────────────────────────────
function ListView({ ordered, items, trailing, fade = false, }) {
    const Tag = ordered ? "ol" : "ul";
    return ((0, jsx_runtime_1.jsx)(Tag, { className: "space-y-1.5 my-2", children: items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            const isChecklist = item.checked !== undefined;
            return ((0, jsx_runtime_1.jsxs)("li", { className: "flex gap-2 items-start", children: [isChecklist ? ((0, jsx_runtime_1.jsx)("span", { role: "checkbox", "aria-checked": item.checked, className: `mt-0.5 inline-flex h-4 w-4 shrink-0 select-none items-center justify-center rounded border transition-colors ${item.checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-background/60"}`, children: item.checked && ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", className: "h-2.5 w-2.5", "aria-hidden": "true", children: (0, jsx_runtime_1.jsx)("polyline", { points: "20 6 9 17 4 12" }) })) })) : ((0, jsx_runtime_1.jsx)("span", { className: "shrink-0 select-none tabular-nums text-muted-foreground font-mono text-xs mt-0.5", children: ordered ? `${item.num}.` : "•" })), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0 flex-1", children: [(0, jsx_runtime_1.jsx)("span", { className: item.checked ? "line-through text-muted-foreground/80" : "", children: renderInline(item.text, fade) }), isLast && !item.children.length && trailing, item.children.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "mt-1", children: (0, jsx_runtime_1.jsx)(ListView, { ordered: item.children[0].ordered, items: item.children, trailing: isLast ? trailing : undefined, fade: fade }) }))] })] }, idx));
        }) }));
}
// ── Block Dispatcher ──────────────────────────────────────────────────────
function BlockView({ block, trailing, onRun, runningCode, fade = false, }) {
    switch (block.kind) {
        case "heading":
            return ((0, jsx_runtime_1.jsx)(HeadingView, { level: block.level, text: block.text, trailing: trailing, fade: fade }));
        case "paragraph":
            return ((0, jsx_runtime_1.jsxs)("p", { className: "my-1.5 leading-relaxed", children: [block.lines.map((line, idx) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [idx > 0 && (0, jsx_runtime_1.jsx)("br", {}), renderInline(line, fade)] }, idx))), trailing] }));
        case "list":
            return ((0, jsx_runtime_1.jsx)(ListView, { ordered: block.ordered, items: block.items, trailing: trailing, fade: fade }));
        case "code":
            return ((0, jsx_runtime_1.jsx)(CodeBlock_1.CodeBlock, { lang: block.lang, code: block.code, onRun: onRun, runningCode: runningCode, showLineNumbers: true }));
        case "alert":
            return ((0, jsx_runtime_1.jsx)(CalloutAlert_1.CalloutAlert, { type: block.alertType, title: block.title, lines: block.lines, renderInline: renderInline, trailing: trailing, fade: fade }));
        case "table":
            return ((0, jsx_runtime_1.jsx)(MarkdownTable_1.MarkdownTable, { headers: block.headers, alignments: block.alignments, rows: block.rows, renderInline: renderInline, fade: fade }));
        case "math":
            return (0, jsx_runtime_1.jsx)(MathView, { math: block.math, display: block.display });
        case "quote":
            return ((0, jsx_runtime_1.jsxs)("blockquote", { className: "my-2 border-l-2 border-border pl-3 text-muted-foreground italic", children: [block.lines.map((line, idx) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [idx > 0 && (0, jsx_runtime_1.jsx)("br", {}), renderInline(line, fade)] }, idx))), trailing] }));
        case "rule":
            return (0, jsx_runtime_1.jsx)("hr", { className: "my-3 border-border/60" });
    }
}
// ── Block Memoization Comparison ──────────────────────────────────────────
function areListItemsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].text !== b[i].text ||
            a[i].num !== b[i].num ||
            a[i].ordered !== b[i].ordered ||
            a[i].checked !== b[i].checked) {
            return false;
        }
        if (a[i].children.length !== b[i].children.length)
            return false;
        if (a[i].children.length > 0 &&
            !areListItemsEqual(a[i].children, b[i].children)) {
            return false;
        }
    }
    return true;
}
function areBlocksEqual(prev, next) {
    if (prev.fade !== next.fade)
        return false;
    if (prev.trailing !== next.trailing)
        return false;
    if (prev.onRun !== next.onRun)
        return false;
    if (prev.runningCode !== next.runningCode)
        return false;
    const b1 = prev.block;
    const b2 = next.block;
    if (b1.kind !== b2.kind)
        return false;
    switch (b1.kind) {
        case "paragraph": {
            const p2 = b2;
            if (b1.lines.length !== p2.lines.length)
                return false;
            for (let i = 0; i < b1.lines.length; i++) {
                if (b1.lines[i] !== p2.lines[i])
                    return false;
            }
            return true;
        }
        case "heading": {
            const h2 = b2;
            return b1.level === h2.level && b1.text === h2.text;
        }
        case "code": {
            const c2 = b2;
            return b1.lang === c2.lang && b1.code === c2.code;
        }
        case "quote": {
            const q2 = b2;
            if (b1.lines.length !== q2.lines.length)
                return false;
            for (let i = 0; i < b1.lines.length; i++) {
                if (b1.lines[i] !== q2.lines[i])
                    return false;
            }
            return true;
        }
        case "alert": {
            const a2 = b2;
            if (b1.alertType !== a2.alertType || b1.title !== a2.title)
                return false;
            if (b1.lines.length !== a2.lines.length)
                return false;
            for (let i = 0; i < b1.lines.length; i++) {
                if (b1.lines[i] !== a2.lines[i])
                    return false;
            }
            return true;
        }
        case "table": {
            const t2 = b2;
            if (b1.headers.length !== t2.headers.length)
                return false;
            if (b1.alignments.length !== t2.alignments.length)
                return false;
            if (b1.rows.length !== t2.rows.length)
                return false;
            for (let i = 0; i < b1.headers.length; i++) {
                if (b1.headers[i] !== t2.headers[i])
                    return false;
                if (b1.alignments[i] !== t2.alignments[i])
                    return false;
            }
            for (let r = 0; r < b1.rows.length; r++) {
                if (b1.rows[r].length !== t2.rows[r].length)
                    return false;
                for (let c = 0; c < b1.rows[r].length; c++) {
                    if (b1.rows[r][c] !== t2.rows[r][c])
                        return false;
                }
            }
            return true;
        }
        case "math": {
            const m2 = b2;
            return b1.math === m2.math && b1.display === m2.display;
        }
        case "rule":
            return true;
        case "list": {
            const l2 = b2;
            if (b1.ordered !== l2.ordered || b1.items.length !== l2.items.length) {
                return false;
            }
            return areListItemsEqual(b1.items, l2.items);
        }
    }
}
const MemoizedBlockView = react_1.default.memo(BlockView, areBlocksEqual);
/** Caret shown at the end of a streaming answer. */
function StreamingCaret() {
    return ((0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", className: "ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" }));
}
function ChatMarkdown({ content, streaming = false, className = "", onRun, runningCode = null, }) {
    const visible = streaming ? content.replace(/\n[ \t]*`{1,2}$/, "") : content;
    const blocks = parseBlocks(visible);
    const caret = streaming ? (0, jsx_runtime_1.jsx)(StreamingCaret, {}) : null;
    const last = blocks[blocks.length - 1];
    const caretInline = !!last &&
        last.kind !== "code" &&
        last.kind !== "rule" &&
        last.kind !== "table" &&
        last.kind !== "math";
    return ((0, jsx_runtime_1.jsxs)("div", { className: `min-w-0 max-w-full space-y-3 break-words text-sm leading-relaxed text-foreground ${className}`, children: [blocks.map((block, idx) => ((0, jsx_runtime_1.jsx)(MemoizedBlockView, { block: block, onRun: onRun, runningCode: runningCode, fade: streaming && idx === blocks.length - 1, trailing: idx === blocks.length - 1 && caretInline ? caret : undefined }, idx))), !caretInline && caret] }));
}
