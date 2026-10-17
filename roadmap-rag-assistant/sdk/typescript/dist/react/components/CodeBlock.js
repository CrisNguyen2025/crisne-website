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
exports.CodeBlock = CodeBlock;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const icons_1 = require("../icons");
const LANGUAGE_LABELS = {
    ts: "TypeScript",
    typescript: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    javascript: "JavaScript",
    jsx: "JSX",
    py: "Python",
    python: "Python",
    sh: "Bash",
    bash: "Bash",
    shell: "Shell",
    zsh: "Zsh",
    json: "JSON",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    markdown: "Markdown",
    go: "Go",
    golang: "Go",
    rs: "Rust",
    rust: "Rust",
    java: "Java",
    c: "C",
    cpp: "C++",
    "c++": "C++",
    cs: "C#",
    csharp: "C#",
    php: "PHP",
    rb: "Ruby",
    ruby: "Ruby",
    swift: "Swift",
    kotlin: "Kotlin",
    docker: "Dockerfile",
    dockerfile: "Dockerfile",
    xml: "XML",
    graphql: "GraphQL",
};
const KEYWORDS = new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while",
    "do", "switch", "case", "break", "continue", "new", "this", "class", "extends",
    "import", "export", "from", "default", "as", "try", "catch", "finally", "throw",
    "async", "await", "yield", "typeof", "instanceof", "in", "of", "type", "interface",
    "enum", "public", "private", "protected", "static", "readonly", "super", "void",
    "implements", "package", "def", "elif", "lambda", "with", "pass", "raise",
    "except", "global", "nonlocal", "assert", "select", "where", "insert", "into",
    "update", "delete", "join", "group", "by", "order", "having", "limit", "create",
    "table", "alter", "drop", "fn", "mut", "pub", "struct", "impl", "use", "mod",
    "match", "func", "defer", "go", "echo", "exit", "set"
]);
const BOOLEANS_AND_NILS = new Set([
    "true", "false", "null", "undefined", "nan", "infinity", "none", "nil"
]);
const TYPES = new Set([
    "string", "number", "boolean", "any", "unknown", "never", "object", "symbol",
    "bigint", "int", "float", "str", "list", "dict", "tuple", "bool", "array",
    "record", "map", "set", "promise", "i32", "i64", "u32", "u64", "f32", "f64"
]);
/**
 * Tokenize a single line of source code into syntax-highlighted React elements.
 */
function highlightCodeLine(line, lineIndex) {
    if (!line) {
        return (0, jsx_runtime_1.jsx)("span", { children: "\n" }, `empty-${lineIndex}`);
    }
    // Matches:
    // 1: Strings ("...", '...', `...`)
    // 2: Comments (//..., #..., --...)
    // 3: Numbers (integer, float, scientific, hex)
    // 4: Identifiers (words)
    // 5: Operators and punctuation
    const tokenRegex = /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\/[^\n]*|#[^\n]*|--[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)|([^\s\w]+)/g;
    const elements = [];
    let lastIndex = 0;
    let tokenMatch;
    while ((tokenMatch = tokenRegex.exec(line)) !== null) {
        const matchIndex = tokenMatch.index;
        // Preserve whitespace preceding the token
        if (matchIndex > lastIndex) {
            elements.push(line.slice(lastIndex, matchIndex));
        }
        const [raw, str, comment, num, word, op] = tokenMatch;
        const tokenKey = `${lineIndex}-${matchIndex}`;
        if (str !== undefined) {
            elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-emerald-600 dark:text-emerald-400", children: str }, tokenKey));
        }
        else if (comment !== undefined) {
            elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-muted-foreground/60 italic", children: comment }, tokenKey));
        }
        else if (num !== undefined) {
            elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-amber-600 dark:text-amber-400", children: num }, tokenKey));
        }
        else if (word !== undefined) {
            const lower = word.toLowerCase();
            // Lookahead in line for function call: next non-space is '('
            const remainingLine = line.slice(matchIndex + word.length);
            const isFunction = /^\s*\(/.test(remainingLine);
            if (KEYWORDS.has(lower)) {
                elements.push((0, jsx_runtime_1.jsx)("span", { className: "font-medium text-purple-600 dark:text-purple-400", children: word }, tokenKey));
            }
            else if (BOOLEANS_AND_NILS.has(lower)) {
                elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-rose-600 dark:text-rose-400", children: word }, tokenKey));
            }
            else if (TYPES.has(lower)) {
                elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-blue-600 dark:text-blue-400", children: word }, tokenKey));
            }
            else if (isFunction) {
                elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-sky-600 dark:text-sky-400", children: word }, tokenKey));
            }
            else {
                elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-foreground", children: word }, tokenKey));
            }
        }
        else if (op !== undefined) {
            elements.push((0, jsx_runtime_1.jsx)("span", { className: "text-foreground/70", children: op }, tokenKey));
        }
        lastIndex = matchIndex + raw.length;
    }
    if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
    }
    return (0, jsx_runtime_1.jsx)(react_1.default.Fragment, { children: elements }, lineIndex);
}
function CodeBlock({ lang = "", code, showLineNumbers = true, onRun, runningCode = null, }) {
    const [copied, setCopied] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (!copied)
            return;
        const timeout = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timeout);
    }, [copied]);
    const copy = () => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(code).then(() => setCopied(true), () => { });
        }
    };
    const lines = (0, react_1.useMemo)(() => code.split("\n"), [code]);
    const isMultiLine = lines.length > 1;
    const normalizedLang = lang.trim().toLowerCase();
    const displayBadge = LANGUAGE_LABELS[normalizedLang] ||
        (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : "Code");
    // Compact one-line snippet (suggestion prompt or quick command)
    if ((!lang || normalizedLang === "text") && !isMultiLine) {
        const snippet = code.trim();
        const isRunning = runningCode !== null && runningCode === snippet;
        const isBusy = runningCode !== null;
        return ((0, jsx_runtime_1.jsxs)("div", { className: "my-2 flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-3 pr-1.5 shadow-xs", children: [onRun ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onRun(snippet), disabled: isBusy, "aria-label": `Gửi: ${snippet}`, title: "G\u1EEDi", className: "flex min-h-[36px] min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[13px] text-foreground disabled:cursor-not-allowed disabled:opacity-60", children: (0, jsx_runtime_1.jsx)("span", { className: "min-w-0 flex-1 whitespace-pre-wrap break-words", children: code }) })) : ((0, jsx_runtime_1.jsx)("code", { className: "min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-[13px] text-foreground", children: code })), onRun && ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onRun(snippet), disabled: isBusy, "aria-label": isRunning ? "Đang gửi" : "Gửi", "aria-busy": isRunning, title: isRunning ? "Đang gửi" : "Gửi", className: "flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent", children: isRunning ? ((0, jsx_runtime_1.jsx)("span", { className: "h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" })) : ((0, jsx_runtime_1.jsx)(icons_1.PlayIcon, { className: "h-3.5 w-3.5" })) })), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: copy, "aria-label": copied ? "Đã sao chép" : "Sao chép", title: copied ? "Đã chép" : "Chép", className: "flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer", children: copied ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-emerald-500" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" })) })] }));
    }
    const shouldShowLineNumbers = showLineNumbers && isMultiLine;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-border/80 bg-muted/40 shadow-xs", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between border-b border-border/70 bg-muted/70 px-3.5 py-1.5 text-xs", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-mono text-[11px] font-medium text-muted-foreground", children: displayBadge }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: copy, "aria-label": copied ? "Đã sao chép" : "Sao chép code", className: "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground cursor-pointer", children: copied ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-emerald-500" }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium text-emerald-600 dark:text-emerald-400", children: "\u0110\u00E3 ch\u00E9p" })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "Ch\u00E9p" })] })) })] }), (0, jsx_runtime_1.jsx)("pre", { className: "max-w-full overflow-x-auto p-3.5 font-mono text-xs leading-relaxed touch-pan-x", children: (0, jsx_runtime_1.jsx)("code", { className: "block w-max min-w-full font-mono", children: lines.map((line, idx) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex", children: [shouldShowLineNumbers && ((0, jsx_runtime_1.jsx)("span", { className: "select-none pr-3 text-right tabular-nums text-muted-foreground/40 text-[11px] font-mono shrink-0 w-8", children: idx + 1 })), (0, jsx_runtime_1.jsx)("span", { className: "flex-1 whitespace-pre", children: highlightCodeLine(line, idx) })] }, idx))) }) })] }));
}
