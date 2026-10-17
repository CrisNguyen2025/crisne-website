"use client";

import React, { useEffect, useState, useMemo } from "react";
import { CheckIcon, CopyIcon, PlayIcon } from "../icons";

export interface CodeBlockProps {
  lang?: string;
  code: string;
  showLineNumbers?: boolean;
  onRun?: (code: string) => void;
  /** Snippet currently being run; the matching snippet shows a spinner and the rest are disabled */
  runningCode?: string | null;
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

/**
 * Tokenize a single line of source code into syntax-highlighted React elements.
 */
function highlightCodeLine(line: string, lineIndex: number): React.ReactNode {
  if (!line) {
    return <span key={`empty-${lineIndex}`}>{"\n"}</span>;
  }

  // Matches:
  // 1: Strings ("...", '...', `...`)
  // 2: Comments (//..., #..., --...)
  // 3: Numbers (integer, float, scientific, hex)
  // 4: Identifiers (words)
  // 5: Operators and punctuation
  const tokenRegex =
    /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\/[^\n]*|#[^\n]*|--[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)|([^\s\w]+)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenRegex.exec(line)) !== null) {
    const matchIndex = tokenMatch.index;

    // Preserve whitespace preceding the token
    if (matchIndex > lastIndex) {
      elements.push(line.slice(lastIndex, matchIndex));
    }

    const [raw, str, comment, num, word, op] = tokenMatch;
    const tokenKey = `${lineIndex}-${matchIndex}`;

    if (str !== undefined) {
      elements.push(
        <span key={tokenKey} className="text-emerald-600 dark:text-emerald-400">
          {str}
        </span>
      );
    } else if (comment !== undefined) {
      elements.push(
        <span key={tokenKey} className="text-muted-foreground/60 italic">
          {comment}
        </span>
      );
    } else if (num !== undefined) {
      elements.push(
        <span key={tokenKey} className="text-amber-600 dark:text-amber-400">
          {num}
        </span>
      );
    } else if (word !== undefined) {
      const lower = word.toLowerCase();
      // Lookahead in line for function call: next non-space is '('
      const remainingLine = line.slice(matchIndex + word.length);
      const isFunction = /^\s*\(/.test(remainingLine);

      if (KEYWORDS.has(lower)) {
        elements.push(
          <span key={tokenKey} className="font-medium text-purple-600 dark:text-purple-400">
            {word}
          </span>
        );
      } else if (BOOLEANS_AND_NILS.has(lower)) {
        elements.push(
          <span key={tokenKey} className="text-rose-600 dark:text-rose-400">
            {word}
          </span>
        );
      } else if (TYPES.has(lower)) {
        elements.push(
          <span key={tokenKey} className="text-blue-600 dark:text-blue-400">
            {word}
          </span>
        );
      } else if (isFunction) {
        elements.push(
          <span key={tokenKey} className="text-sky-600 dark:text-sky-400">
            {word}
          </span>
        );
      } else {
        elements.push(
          <span key={tokenKey} className="text-foreground">
            {word}
          </span>
        );
      }
    } else if (op !== undefined) {
      elements.push(
        <span key={tokenKey} className="text-foreground/70">
          {op}
        </span>
      );
    }

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < line.length) {
    elements.push(line.slice(lastIndex));
  }

  return <React.Fragment key={lineIndex}>{elements}</React.Fragment>;
}

export function CodeBlock({
  lang = "",
  code,
  showLineNumbers = true,
  onRun,
  runningCode = null,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(
        () => setCopied(true),
        () => {}
      );
    }
  };

  const lines = useMemo(() => code.split("\n"), [code]);
  const isMultiLine = lines.length > 1;
  const normalizedLang = lang.trim().toLowerCase();
  const displayBadge =
    LANGUAGE_LABELS[normalizedLang] ||
    (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : "Code");

  // Compact one-line snippet (suggestion prompt or quick command)
  if ((!lang || normalizedLang === "text") && !isMultiLine) {
    const snippet = code.trim();
    const isRunning = runningCode !== null && runningCode === snippet;
    const isBusy = runningCode !== null;
    return (
      <div className="my-2 flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-3 pr-1.5 shadow-xs">
        {/* A suggestion is one tap: the text sends it */}
        {onRun ? (
          <button
            type="button"
            onClick={() => onRun(snippet)}
            disabled={isBusy}
            aria-label={`Gửi: ${snippet}`}
            title="Gửi"
            className="flex min-h-[36px] min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[13px] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{code}</span>
          </button>
        ) : (
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-[13px] text-foreground">
            {code}
          </code>
        )}
        {onRun && (
          <button
            type="button"
            onClick={() => onRun(snippet)}
            disabled={isBusy}
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
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Đã sao chép" : "Sao chép"}
          title={copied ? "Đã chép" : "Chép"}
          className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  const shouldShowLineNumbers = showLineNumbers && isMultiLine;

  return (
    <div className="my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-border/80 bg-muted/40 shadow-xs">
      {/* Header bar with badge and 1-click copy */}
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

      {/* Code body with optional line numbers and syntax styling */}
      <pre className="max-w-full overflow-x-auto p-3.5 font-mono text-xs leading-relaxed touch-pan-x">
        <code className="block w-max min-w-full font-mono">
          {lines.map((line, idx) => (
            <div key={idx} className="flex">
              {shouldShowLineNumbers && (
                <span className="select-none pr-3 text-right tabular-nums text-muted-foreground/40 text-[11px] font-mono shrink-0 w-8">
                  {idx + 1}
                </span>
              )}
              <span className="flex-1 whitespace-pre">
                {highlightCodeLine(line, idx)}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
