"use client";

import React, { useEffect, useState, useMemo } from "react";
import { ArrowDownIcon, CheckIcon, CopyIcon, PlayIcon } from "../icons";
import { isRunnableSnippet } from "../utils/snippets";
import { copyText } from "../utils/clipboard";

export interface CodeBlockProps {
  lang?: string;
  code: string;
  /** Whether the code fence is still streaming (open) */
  open?: boolean;
  showLineNumbers?: boolean;
  /** Sends a one-line snippet as a message; not offered for one with a blank to fill in or a delete */
  onRun?: (code: string) => void;
  /** Snippet currently being run; the matching snippet shows a spinner and the rest are disabled */
  runningCode?: string | null;
  /** Disables running un-executed snippets while another message turn is loading */
  isBusy?: boolean;
  /** Executed user message id for this snippet when it already ran after the host message */
  executedMessageId?: string | null;
  /** Scrolls to the executed user message instead of re-sending the prompt */
  onJumpToMessage?: (messageId: string) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
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

const TOKEN_REGEX =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\/[^\n]*|#[^\n]*|--[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g;

const HAS_HTML_SPECIAL = /[&<>"']/;
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(text: string): string {
  return HAS_HTML_SPECIAL.test(text) ? text.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPES[ch]) : text;
}

function isFunctionCall(source: string, afterWord: number): boolean {
  let i = afterWord;
  while (i < source.length) {
    const ch = source.charCodeAt(i);
    if (ch !== 32 && ch !== 9) {
      return ch === 40;
    }
    i++;
  }
  return false;
}

function highlightCodeHtml(code: string): string {
  if (!code) {
    return "\n";
  }

  TOKEN_REGEX.lastIndex = 0;
  const chunks: string[] = [];
  let plainStart = 0;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = TOKEN_REGEX.exec(code)) !== null) {
    const matchIndex = tokenMatch.index;
    const [raw, str, comment, num, word] = tokenMatch;
    let className: string | null = null;

    if (str !== undefined) {
      className = "text-emerald-600 dark:text-emerald-400";
    } else if (comment !== undefined) {
      className = "text-muted-foreground/60 italic";
    } else if (num !== undefined) {
      className = "text-amber-600 dark:text-amber-400";
    } else if (word !== undefined) {
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) {
        className = "font-medium text-purple-600 dark:text-purple-400";
      } else if (BOOLEANS_AND_NILS.has(lower)) {
        className = "text-rose-600 dark:text-rose-400";
      } else if (TYPES.has(lower)) {
        className = "text-blue-600 dark:text-blue-400";
      } else if (isFunctionCall(code, matchIndex + word.length)) {
        className = "text-sky-600 dark:text-sky-400";
      }
    }

    if (className !== null) {
      if (matchIndex > plainStart) {
        chunks.push(escapeHtml(code.slice(plainStart, matchIndex)));
      }
      chunks.push(`<span class="${className}">${escapeHtml(raw)}</span>`);
      plainStart = matchIndex + raw.length;
    }
  }

  if (plainStart === 0) {
    return escapeHtml(code);
  }
  if (plainStart < code.length) {
    chunks.push(escapeHtml(code.slice(plainStart)));
  }
  return chunks.join("");
}

export function CodeBlock({
  lang = "",
  code,
  open = false,
  showLineNumbers = true,
  onRun,
  runningCode = null,
  isBusy: isBusyProp = false,
  executedMessageId = null,
  onJumpToMessage,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const copy = () => {
    void copyText(code).then((ok) => {
      if (ok) setCopied(true);
    });
  };

  const cleanCode = code.replace(/\s+$/, "");
  const isMultiLine = cleanCode.includes("\n");
  const normalizedLang = lang.trim().toLowerCase();
  const isCompactSnippet = (!lang || normalizedLang === "text") && !isMultiLine;
  const shouldShowLineNumbers = showLineNumbers && isMultiLine;
  const lineNumbersHtml = useMemo(() => {
    if (!shouldShowLineNumbers || isCompactSnippet) return "";
    let count = 1;
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 10) count++;
    }
    let html = "";
    for (let i = 1; i <= count; i++) {
      html += `<span>${i}</span>`;
    }
    return html;
  }, [code, shouldShowLineNumbers, isCompactSnippet]);
  const highlightedHtml = useMemo(
    () => (isCompactSnippet ? "" : highlightCodeHtml(code)),
    [code, isCompactSnippet]
  );
  const displayBadge =
    LANGUAGE_LABELS[normalizedLang] ||
    (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : "Code");

  // Compact one-line snippet (suggestion prompt or quick command)
  if ((!lang || normalizedLang === "text") && !isMultiLine) {
    const snippet = code.trim();
    const isRunning = runningCode !== null && runningCode === snippet;
    const isBusy = isBusyProp || runningCode !== null;
    const isRunnable = Boolean(onRun) && isRunnableSnippet(snippet);
    const isExecuted =
      isRunnable && Boolean(executedMessageId && onJumpToMessage) && !isRunning;
    return (
      // Smooth height growth on stream mount: expands 0fr -> 1fr so the +58px jump is eliminated,
      // while streaming text flows in with a caret and buttons reveal once the fence closes.
      <div
        className={`grid transition-[grid-template-rows,margin,opacity] duration-200 ease-out motion-reduce:transition-none ${
          !open ? "grid-rows-[1fr] my-2 opacity-100" : "grid-rows-[1fr] my-2 opacity-100 animate-in fade-in duration-200"
        }`}
      >
        <div className="min-w-0 max-w-full overflow-hidden">
          <div
            className={`flex min-h-[50px] min-w-0 max-w-full items-center gap-2 rounded-lg border bg-background py-1.5 pl-3 pr-1.5 shadow-xs transition-colors ${
              isExecuted ? "border-[#3F7D58]/35" : "border-border"
            }`}
          >
            {/* Text streams directly inside; caret indicates live generation without layout jumps */}
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-sm md:text-[13px] text-foreground">
              {code}
              {open && (
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-text-bottom motion-reduce:animate-none"
                />
              )}
            </code>
            {/* Space for actions is preserved so text does not wrap/jump when streaming completes */}
            <div
              className={`flex shrink-0 items-center gap-1 transition-opacity duration-200 ${
                open ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
              aria-hidden={open}
            >
              {isExecuted ? (
                <button
                  type="button"
                  onClick={() => onJumpToMessage?.(executedMessageId!)}
                  disabled={open}
                  tabIndex={open ? -1 : 0}
                  aria-label="Đã gửi — Đi tới câu hỏi"
                  title="Đã gửi — Đi tới câu hỏi"
                  className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md bg-[#E6F1EA] p-1.5 text-[#3F7D58] transition-colors hover:bg-[#D5E8DC] cursor-pointer disabled:pointer-events-none"
                >
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </button>
              ) : (
                isRunnable && (
                  <button
                    type="button"
                    onClick={() => onRun?.(snippet)}
                    disabled={isBusy || open}
                    tabIndex={open ? -1 : 0}
                    aria-label={isRunning ? "Đang gửi" : "Gửi"}
                    aria-busy={isRunning}
                    title={isRunning ? "Đang gửi" : "Gửi"}
                    className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    {isRunning ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <PlayIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={copy}
                disabled={open}
                tabIndex={open ? -1 : 0}
                aria-label={copied ? "Đã sao chép" : "Sao chép"}
                title={copied ? "Đã chép" : "Chép"}
                className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer disabled:opacity-0"
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-border/80 bg-muted/40 shadow-xs">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/70 px-3.5 py-1.5 text-xs">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {displayBadge}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Đã sao chép" : "Sao chép code"}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground cursor-pointer"
        >
          {copied ? (
            <>
              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Đã chép
              </span>
            </>
          ) : (
            <>
              <CopyIcon className="h-3.5 w-3.5" />
              <span>Chép</span>
            </>
          )}
        </button>
      </div>

      <pre className="max-w-full overflow-x-auto p-3.5 font-mono text-xs leading-relaxed touch-pan-x">
        <code className="flex w-max min-w-full font-mono text-foreground">
          {shouldShowLineNumbers && (
            <span
              aria-hidden="true"
              className="flex flex-col select-none pr-3 text-right tabular-nums text-muted-foreground/40 text-xs leading-relaxed font-mono shrink-0 w-8"
              dangerouslySetInnerHTML={{ __html: lineNumbersHtml }}
            />
          )}
          <span
            className="min-w-0 flex-1 whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </code>
      </pre>
    </div>
  );
}
