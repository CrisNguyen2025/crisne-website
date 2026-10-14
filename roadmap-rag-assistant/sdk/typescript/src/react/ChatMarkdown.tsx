"use client";

import React, { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, PlayIcon } from "./icons";

/**
 * Dependency-free Markdown for chat answers (shared by both chatbots).
 *
 * Blocks: # to #### headings, ordered/unordered lists (2 levels), fenced code
 * with a copy button, blockquotes, horizontal rules, paragraphs.
 * Inline: **bold**, *italic*, `code`, [links](url).
 *
 * Everything is rendered as React text nodes, never as raw HTML, so model
 * output cannot inject markup. Unclosed tokens (common mid-stream) stay literal.
 */

// `num` keeps the number the model wrote (e.g. "0." or "100."), not a renumbering.
type ListItem = {
  text: string;
  num: number;
  ordered: boolean;
  children: ListItem[];
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "code"; lang: string; code: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

export function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      // An unclosed fence (still streaming) runs to the end of the content.
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
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
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    const first = line.match(LIST_ITEM);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const list: Block = {
        kind: "list",
        ordered,
        items: [],
      };
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m) break;
        const nested = m[1].replace(/\t/g, "  ").length >= 2;
        const sameKind = /\d/.test(m[2]) === ordered;
        if (!nested && !sameKind) break; // a different top-level list starts here
        const item = {
          text: m[3],
          num: parseInt(m[2], 10),
          ordered: /\d/.test(m[2]),
          children: [],
        };
        const parent = list.items[list.items.length - 1];
        if (nested && parent) parent.children.push(item);
        else list.items.push(item);
        i++;
      }
      blocks.push(list);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !/^\s*>/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push({ kind: "paragraph", lines: para });
  }

  return blocks;
}

// ── Inline ────────────────────────────────────────────────────────────────

// _italic_ only at word boundaries, so snake_case identifiers stay intact.
const INLINE =
  /(`[^`\n]+`)|(\*\*(.*?)\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(\*([^*\s][^*\n]*?)\*)|((?<![\w])_([^_\n]+)_(?![\w]))/g;

function safeHref(url: string): { href: string; external: boolean } | null {
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  if (/^(\/|#|mailto:)/i.test(url)) return { href: url, external: false };
  return null; // javascript:, data:, relative junk — rendered as plain text
}

/**
 * Wraps each word of plain text in a span keyed by its offset. Words already on screen keep
 * their key and stay put; only newly streamed words mount, so only they play the fade-in.
 */
function fadeWords(text: string, base: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\S+)(\s*)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(
      <span key={`w${base + m.index}`} className="animate-in fade-in duration-300">
        {m[1]}
      </span>
    );
    if (m[2]) out.push(m[2]);
  }
  return out;
}

/** `fade`: animate newly streamed words (used for the block still being written). */
export function renderInline(text: string, fade = false): React.ReactNode[] {
  const plain = (start: number, end: number) =>
    fade ? fadeWords(text.slice(start, end), start) : [text.slice(start, end)];
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Fresh regex per call: renderInline recurses for bold/italic, and a shared
  // global regex would have its lastIndex reset under the outer loop.
  const re = new RegExp(INLINE.source, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(...plain(last, m.index));
    if (m[1]) {
      out.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {m[1].slice(1, -1)}
        </code>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold text-foreground">
          {renderInline(m[3], fade)}
        </strong>
      );
    } else if (m[4]) {
      const link = safeHref(m[6]);
      out.push(
        link ? (
          <a
            key={key++}
            href={link.href}
            {...(link.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="font-medium text-foreground underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
          >
            {m[5]}
          </a>
        ) : (
          m[5]
        )
      );
    } else if (m[7] || m[9]) {
      out.push(
        <em key={key++} className="italic">
          {renderInline(m[8] ?? m[10], fade)}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...plain(last, text.length));
  return out;
}

// ── Blocks ────────────────────────────────────────────────────────────────

function CodeBlock({
  lang,
  code,
  onRun,
}: {
  lang: string;
  code: string;
  onRun?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => {}
    );
  };

  const Icon = copied ? CheckIcon : CopyIcon;

  // One-line snippet (e.g. a prompt suggestion): compact row, icon-only copy.
  if ((!lang || lang === "text") && !code.includes("\n")) {
    return (
      <div className="group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs text-foreground">
          {code}
        </code>
        {onRun && (
          <button
            type="button"
            onClick={() => onRun(code.trim())}
            aria-label="Gửi lệnh này"
            title="Gửi"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PlayIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Đã sao chép" : "Sao chép"}
          title={copied ? "Đã chép" : "Chép"}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Đã sao chép" : "Sao chép code"}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
          <span>{copied ? "Đã chép" : "Chép"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const HEADING_TAG = ["h3", "h3", "h4", "h5"] as const;
const HEADING_CLASS = [
  "text-base font-semibold",
  "text-sm font-semibold",
  "text-sm font-semibold",
  "text-sm font-medium",
];

function ListView({
  ordered,
  items,
  trailing,
  fade = false,
}: {
  ordered: boolean;
  items: ListItem[];
  trailing?: React.ReactNode;
  fade?: boolean;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="space-y-1">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <li key={idx} className="flex gap-2">
            <span className="shrink-0 select-none tabular-nums text-muted-foreground">
              {ordered ? `${item.num}.` : "•"}
            </span>
            <div className="min-w-0 flex-1">
              {renderInline(item.text, fade)}
              {isLast && !item.children.length && trailing}
              {item.children.length > 0 && (
                <div className="mt-1">
                  <ListView
                    ordered={item.children[0].ordered}
                    items={item.children}
                    trailing={isLast ? trailing : undefined}
                    fade={fade}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </Tag>
  );
}

function BlockView({
  block,
  trailing,
  onRun,
  fade = false,
}: {
  block: Block;
  trailing?: React.ReactNode;
  onRun?: (code: string) => void;
  fade?: boolean;
}) {
  switch (block.kind) {
    case "heading": {
      const Tag = HEADING_TAG[block.level - 1];
      return (
        <Tag
          className={`pt-1 text-foreground ${HEADING_CLASS[block.level - 1]}`}
        >
          {renderInline(block.text, fade)}
          {trailing}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          {block.lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              {renderInline(line, fade)}
            </React.Fragment>
          ))}
          {trailing}
        </p>
      );
    case "list":
      return (
        <ListView
          ordered={block.ordered}
          items={block.items}
          trailing={trailing}
          fade={fade}
        />
      );
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} onRun={onRun} />;
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
          {block.lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              {renderInline(line, fade)}
            </React.Fragment>
          ))}
          {trailing}
        </blockquote>
      );
    case "rule":
      return <hr className="border-border" />;
  }
}

/** Thin caret shown at the end of a streaming answer. */
export function StreamingCaret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom"
    />
  );
}

export interface ChatMarkdownProps {
  content: string;
  /** Show a caret after the last character (inline when the last block allows it). */
  streaming?: boolean;
  className?: string;
  /** Adds a run button to one-line snippets; called with the snippet text. */
  onRun?: (code: string) => void;
}

export function ChatMarkdown({
  content,
  streaming = false,
  className = "",
  onRun,
}: ChatMarkdownProps) {
  // While streaming, hide a half-typed closing fence ("`" or "``") so it never flashes in a code block.
  const visible = streaming ? content.replace(/\n[ \t]*`{1,2}$/, "") : content;
  const blocks = parseBlocks(visible);
  const caret = streaming ? <StreamingCaret /> : null;
  const last = blocks[blocks.length - 1];
  const caretInline = !!last && last.kind !== "code" && last.kind !== "rule";

  return (
    <div
      className={`min-w-0 space-y-3 break-words text-sm leading-relaxed text-foreground ${className}`}
    >
      {blocks.map((block, idx) => (
        <BlockView
          key={idx}
          block={block}
          onRun={onRun}
          fade={streaming && idx === blocks.length - 1}
          trailing={
            idx === blocks.length - 1 && caretInline ? caret : undefined
          }
        />
      ))}
      {!caretInline && caret}
    </div>
  );
}
