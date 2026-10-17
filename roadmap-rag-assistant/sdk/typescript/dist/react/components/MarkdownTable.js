"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownTable = MarkdownTable;
const jsx_runtime_1 = require("react/jsx-runtime");
function MarkdownTable({ headers, alignments, rows, renderInline, fade = false, }) {
    const getAlignmentClass = (align) => {
        switch (align) {
            case "center":
                return "text-center";
            case "right":
                return "text-right";
            case "left":
            default:
                return "text-left";
        }
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "my-3 w-full overflow-x-auto rounded-lg border border-border/80 bg-background/50 shadow-xs touch-pan-x", children: (0, jsx_runtime_1.jsxs)("table", { className: "w-full min-w-full border-collapse text-left text-xs", children: [headers.length > 0 && ((0, jsx_runtime_1.jsx)("thead", { className: "border-b border-border bg-muted/60 text-muted-foreground font-semibold", children: (0, jsx_runtime_1.jsx)("tr", { children: headers.map((header, idx) => {
                            const alignClass = getAlignmentClass(alignments[idx]);
                            return ((0, jsx_runtime_1.jsx)("th", { scope: "col", className: `px-3.5 py-2 font-medium tracking-wide first:pl-4 last:pr-4 ${alignClass}`, children: renderInline(header, fade) }, idx));
                        }) }) })), (0, jsx_runtime_1.jsx)("tbody", { className: "divide-y divide-border/40", children: rows.map((row, rowIdx) => ((0, jsx_runtime_1.jsxs)("tr", { className: "border-b border-border/30 last:border-b-0 transition-colors hover:bg-muted/30 even:bg-muted/15", children: [row.map((cell, colIdx) => {
                                const alignClass = getAlignmentClass(alignments[colIdx]);
                                return ((0, jsx_runtime_1.jsx)("td", { className: `px-3.5 py-2 text-foreground align-top first:pl-4 last:pr-4 ${alignClass}`, children: renderInline(cell, fade) }, colIdx));
                            }), row.length < headers.length &&
                                Array.from({ length: headers.length - row.length }).map((_, padIdx) => ((0, jsx_runtime_1.jsx)("td", { className: "px-3.5 py-2 text-foreground align-top first:pl-4 last:pr-4" }, `pad-${padIdx}`)))] }, rowIdx))) })] }) }));
}
