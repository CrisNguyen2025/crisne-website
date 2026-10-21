"use client";

import React, { useContext, useMemo, useRef } from "react";
import { CodeBlock } from "./components/CodeBlock";
import { MarkdownTable } from "./components/MarkdownTable";
import { CalloutAlert, CalloutType } from "./components/CalloutAlert";
import { CitationChip } from "./components/CitationChip";
import type { ChatCitation, ChatSource } from "../types";
import {
  CLAIM_RE,
  CLAIM_START,
  STRAY_MARK_RE,
  claimIndex,
  markClaims,
} from "./utils/citations";
import { safeHref } from "./utils/links";

/**
 * Rich Markdown Engine for chat answers.
 * Zero external parser dependencies — pure React Virtual DOM.
 *
 * Supported Blocks:
 * - Headings (H1 to H4) with hierarchy & subtle dividers
 * - Markdown Tables (responsive, horizontal touch scroll, alternating rows)
 * - GitHub Callouts/Alerts ([!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION])
 * - Enhanced Code Blocks (syntax tokens, language badges, line numbers, 1-click copy)
 * - KaTeX Math Formulas ($...$ inline and $$...$$ display)
 * - Lists (ordered/unordered with arbitrary nesting)
 * - Checklists (- [ ] and - [x] with styled checkboxes)
 * - Blockquotes, horizontal rules, paragraphs
 *
 * Inline:
 * - **bold**, *italic*, `inline code`, [links](url), ==highlight==, $math$
 */

export type ListItem = {
  text: string;
  num: number;
  ordered: boolean;
  checked?: boolean;
  children: ListItem[];
};

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "code"; lang: string; code: string }
  | { kind: "quote"; lines: string[] }
  | {
      kind: "alert";
      alertType: CalloutType;
      title?: string;
      lines: string[];
    }
  | {
      kind: "table";
      headers: string[];
      alignments: ("left" | "center" | "right")[];
      rows: string[][];
    }
  | { kind: "math"; math: string; display: boolean }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
const CHECKLIST_ITEM = /^\[([ xX])\]\s*(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(trimmed);
}

function splitTableRow(rowStr: string): string[] {
  let trimmed = rowStr.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  const escaped = trimmed.replace(/\\\|/g, "__ESCAPED_PIPE__");
  return escaped
    .split("|")
    .map((cell) => cell.replace(/__ESCAPED_PIPE__/g, "|").trim());
}

function parseTableAlignments(sepStr: string): ("left" | "center" | "right")[] {
  const cells = splitTableRow(sepStr);
  return cells.map((cell) => {
    const c = cell.trim();
    const leftColon = c.startsWith(":");
    const rightColon = c.endsWith(":");
    if (leftColon && rightColon) return "center";
    if (rightColon) return "right";
    return "left";
  });
}

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

    // 1. Fenced Code Block
    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
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
      const body: string[] = [];
      if (rest) body.push(rest);
      i++;
      while (i < lines.length) {
        const currentLine = lines[i];
        if (currentLine.includes("$$")) {
          const beforeEnd = currentLine.replace(/\$\$.*$/, "").trim();
          if (beforeEnd) body.push(beforeEnd);
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
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headerLine = lines[i++];
      const sepLine = lines[i++];
      const headers = splitTableRow(headerLine);
      const alignments = parseTableAlignments(sepLine);
      const rows: string[][] = [];

      while (i < lines.length) {
        const rowLine = lines[i];
        if (
          !rowLine.trim() ||
          !rowLine.includes("|") ||
          FENCE.test(rowLine) ||
          HEADING.test(rowLine) ||
          RULE.test(rowLine) ||
          /^\s*>/.test(rowLine)
        ) {
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
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i++].replace(/^\s*>\s?/, ""));
      }

      if (quoteLines.length > 0) {
        const firstLine = quoteLines[0].trim();
        const alertMatch = firstLine.match(
          /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i
        );
        if (alertMatch) {
          const alertType = alertMatch[1].toLowerCase() as CalloutType;
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
      const listBlock: Block = {
        kind: "list",
        ordered,
        items: [],
      };

      const stack: { indent: number; item: ListItem }[] = [];

      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m) break;

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

        const newItem: ListItem = {
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
        } else {
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
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !lineStartsWithMath(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !isTableLine(lines, i)
    ) {
      para.push(lines[i++]);
    }
    blocks.push({ kind: "paragraph", lines: para });
  }

  return blocks;
}

function lineStartsWithMath(line: string): boolean {
  return /^\s*\$\$/.test(line);
}

function isTableLine(lines: string[], idx: number): boolean {
  if (!lines[idx].includes("|")) return false;
  if (idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) return true;
  return false;
}

// ── Inline Renderer ────────────────────────────────────────────────────────

const INLINE =
  /(`[^`\n]+`)|(\*\*(.*?)\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|((?<!\$)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$))|(\*([^*\s][^*\n]*?)\*)|((?<![\w])_([^_\n]+)_(?![\w]))|(==([^=\n]+)==)/g;

/** The claims of one answer: the source ids of claim i at index i (see markClaims). */
const CitationContext = React.createContext<string[][]>([]);

/** A line of text; each marked claim on it is tagged with its sources, for SourceChips to highlight. */
function InlineLine({ text }: { text: string }) {
  const claims = useContext(CitationContext);
  if (!text.includes(CLAIM_START)) return <>{renderInline(text)}</>;

  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CLAIM_RE)) {
    out.push(
      <React.Fragment key={`text-${last}`}>
        {renderInline(text.slice(last, m.index))}
      </React.Fragment>,
      <span
        key={`claim-${m.index}`}
        data-claim=""
        data-sources={(claims[claimIndex(m[2])] ?? []).join(" ")}
        // The chat panel is always light, whatever the page theme
        className="rounded-sm box-decoration-clone transition-colors duration-150 motion-reduce:transition-none data-[highlighted]:bg-[#DCE7FB]"
      >
        {renderInline(m[1])}
      </span>
    );
    last = m.index + m[0].length;
  }
  out.push(<React.Fragment key={`text-${last}`}>{renderInline(text.slice(last))}</React.Fragment>);
  return <>{out}</>;
}

/**
 * Highlights the claims of one answer that cite source `id`, or none. Done on the DOM instead of
 * through React state, so hovering a chip re-renders only that chip and not the whole answer.
 * Ids are compared as strings, never put into a selector.
 */
function highlightClaims(root: HTMLElement, id: string | null) {
  root.querySelectorAll("[data-claim][data-highlighted]").forEach((el) => el.removeAttribute("data-highlighted"));
  if (id === null) {
    delete root.dataset.activeSource;
    return;
  }
  root.dataset.activeSource = id;
  root.querySelectorAll<HTMLElement>("[data-claim]").forEach((el) => {
    if (el.dataset.sources?.split(" ").includes(id)) el.setAttribute("data-highlighted", "true");
  });
}

/**
 * One chip per source the answer used, shown once at the end of the answer. Hovering a chip
 * highlights the claims that cite its source.
 */
function SourceChips({ sources }: { sources: ChatSource[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const onOpenChange = (id: string, open: boolean) => {
    const root = ref.current?.closest<HTMLElement>("[data-citation-root]");
    if (!root) return;
    // A chip closing late clears the highlight only if no other chip has taken it over meanwhile
    if (open) highlightClaims(root, id);
    else if (root.dataset.activeSource === id) highlightClaims(root, null);
  };
  return (
    <span ref={ref}>
      {sources.map((source) => (
        <CitationChip
          key={source.id}
          citations={[{ id: source.id, title: source.title, href: source.href }]}
          onOpenChange={(open) => onOpenChange(source.id, open)}
        />
      ))}
    </span>
  );
}

function MathView({
  math,
  display = false,
}: {
  math: string;
  display?: boolean;
}) {
  const renderedHtml = useMemo(() => {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { katex?: { renderToString?: (tex: string, opts: unknown) => string } })
        .katex?.renderToString
    ) {
      try {
        return (
          window as unknown as {
            katex: { renderToString: (tex: string, opts: unknown) => string };
          }
        ).katex.renderToString(math, {
          displayMode: display,
          throwOnError: false,
        });
      } catch {
        return null;
      }
    }
    return null;
  }, [math, display]);

  if (renderedHtml) {
    if (display) {
      return (
        <div
          className="my-3 overflow-x-auto rounded-lg border border-border/80 bg-muted/30 p-3.5 text-center text-sm shadow-xs touch-pan-x"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      );
    }
    return (
      <span
        className="mx-0.5 inline-block text-[0.95em]"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  // Graceful fallback when KaTeX is not loaded on page
  if (display) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-border/80 bg-muted/40 p-3.5 text-xs shadow-xs touch-pan-x">
        <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-border/50 text-[11px] font-medium text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            Math
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            LaTeX
          </span>
        </div>
        <div className="py-1 text-center font-mono font-medium text-sm text-foreground">
          {math}
        </div>
      </div>
    );
  }

  return (
    <span className="mx-0.5 inline-flex items-center rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      <span className="mr-1 select-none font-sans text-[10px] font-semibold text-muted-foreground">
        fx
      </span>
      <span className="font-mono">{math}</span>
    </span>
  );
}

export function renderInline(text: string): React.ReactNode[] {
  // Claim marks only mean something on a line InlineLine renders; anywhere else they are dropped
  const plain = (start: number, end: number) => [text.slice(start, end).replace(STRAY_MARK_RE, "")];
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  const re = new RegExp(INLINE.source, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(...plain(last, m.index));

    if (m[1]) {
      // Inline code `...`
      out.push(
        <code
          key={key++}
          className="rounded border border-border/60 bg-muted px-1 py-px font-mono text-[0.85em] text-rose-600 dark:text-rose-400"
        >
          {m[1].slice(1, -1)}
        </code>
      );
    } else if (m[2] !== undefined) {
      // Bold **...**
      out.push(
        <strong key={key++} className="font-semibold text-foreground">
          {renderInline(m[3])}
        </strong>
      );
    } else if (m[4]) {
      // Link [text](url)
      const link = safeHref(m[6]);
      out.push(
        link ? (
          <a
            key={key++}
            href={link.href}
            {...(link.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="text-blue-600 underline decoration-blue-600/40 underline-offset-2 transition-colors hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/40 dark:hover:decoration-blue-400"
          >
            {m[5]}
          </a>
        ) : (
          m[5]
        )
      );
    } else if (m[7] !== undefined) {
      // Inline math $...$
      out.push(<MathView key={key++} math={m[8]} display={false} />);
    } else if (m[9] || m[11]) {
      // Italic *...* or _..._
      out.push(
        <em key={key++} className="italic">
          {renderInline(m[10] ?? m[12])}
        </em>
      );
    } else if (m[13]) {
      // Highlight ==...==
      out.push(
        <mark
          key={key++}
          className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30"
        >
          {renderInline(m[14])}
        </mark>
      );
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(...plain(last, text.length));
  return out;
}

// ── Typographic Headings ──────────────────────────────────────────────────

const HEADING_CLASSES: Record<number, string> = {
  1: "text-lg font-bold pb-1.5 border-b border-border/50 text-foreground tracking-tight",
  2: "text-base font-semibold pb-1 border-b border-border/30 text-foreground",
  3: "text-sm font-semibold text-foreground",
  4: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
};

function HeadingView({
  level,
  text,
  trailing,
}: {
  level: number;
  text: string;
  trailing?: React.ReactNode;
}) {
  const className = `pt-1.5 ${HEADING_CLASSES[level] || HEADING_CLASSES[4]}`;
  const children = (
    <>
      <InlineLine text={text} />
      {trailing}
    </>
  );

  switch (level) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
    default:
      return <h4 className={className}>{children}</h4>;
  }
}

// ── Lists and Checklists ──────────────────────────────────────────────────

function ListView({
  ordered,
  items,
  trailing,
}: {
  ordered: boolean;
  items: ListItem[];
  trailing?: React.ReactNode;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="space-y-1.5 my-2">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const isChecklist = item.checked !== undefined;

        return (
          <li key={idx} className="flex gap-2 items-start">
            {isChecklist ? (
              <span
                role="checkbox"
                aria-checked={item.checked}
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 select-none items-center justify-center rounded border transition-colors ${
                  item.checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/80 bg-background/60"
                }`}
              >
                {item.checked && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-2.5 w-2.5"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            ) : (
              <span className="shrink-0 select-none tabular-nums text-muted-foreground font-mono text-xs mt-0.5">
                {ordered ? `${item.num}.` : "•"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <span
                className={
                  item.checked ? "line-through text-muted-foreground/80" : ""
                }
              >
                <InlineLine text={item.text} />
              </span>
              {isLast && !item.children.length && trailing}
              {item.children.length > 0 && (
                <div className="mt-1">
                  <ListView
                    ordered={item.children[0].ordered}
                    items={item.children}
                    trailing={isLast ? trailing : undefined}
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

// ── Block Dispatcher ──────────────────────────────────────────────────────

function BlockView({
  block,
  trailing,
  onRun,
  runningCode,
}: {
  block: Block;
  trailing?: React.ReactNode;
  onRun?: (code: string) => void;
  runningCode?: string | null;
}) {
  switch (block.kind) {
    case "heading":
      return (
        <HeadingView
          level={block.level}
          text={block.text}
          trailing={trailing}
        />
      );
    case "paragraph":
      return (
        <p className="my-1.5 leading-relaxed">
          {block.lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              <InlineLine text={line} />
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
        />
      );
    case "code":
      return (
        <CodeBlock
          lang={block.lang}
          code={block.code}
          onRun={onRun}
          runningCode={runningCode}
          showLineNumbers={true}
        />
      );
    case "alert":
      return (
        <CalloutAlert
          type={block.alertType}
          title={block.title}
          lines={block.lines}
          renderInline={renderInline}
          trailing={trailing}
        />
      );
    case "table":
      return (
        <MarkdownTable
          headers={block.headers}
          alignments={block.alignments}
          rows={block.rows}
          renderInline={renderInline}
        />
      );
    case "math":
      return <MathView math={block.math} display={block.display} />;
    case "quote":
      return (
        <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">
          {block.lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              <InlineLine text={line} />
            </React.Fragment>
          ))}
          {trailing}
        </blockquote>
      );
    case "rule":
      return <hr className="my-3 border-border/60" />;
  }
}

// ── Block Memoization Comparison ──────────────────────────────────────────

function areListItemsEqual(a: ListItem[], b: ListItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].text !== b[i].text ||
      a[i].num !== b[i].num ||
      a[i].ordered !== b[i].ordered ||
      a[i].checked !== b[i].checked
    ) {
      return false;
    }
    if (a[i].children.length !== b[i].children.length) return false;
    if (
      a[i].children.length > 0 &&
      !areListItemsEqual(a[i].children, b[i].children)
    ) {
      return false;
    }
  }
  return true;
}

function areBlocksEqual(
  prev: {
    block: Block;
    trailing?: React.ReactNode;
    onRun?: (code: string) => void;
    runningCode?: string | null;
  },
  next: {
    block: Block;
    trailing?: React.ReactNode;
    onRun?: (code: string) => void;
    runningCode?: string | null;
  }
): boolean {
  if (prev.trailing !== next.trailing) return false;
  if (prev.onRun !== next.onRun) return false;
  if (prev.runningCode !== next.runningCode) return false;

  const b1 = prev.block;
  const b2 = next.block;
  if (b1.kind !== b2.kind) return false;

  switch (b1.kind) {
    case "paragraph": {
      const p2 = b2 as typeof b1;
      if (b1.lines.length !== p2.lines.length) return false;
      for (let i = 0; i < b1.lines.length; i++) {
        if (b1.lines[i] !== p2.lines[i]) return false;
      }
      return true;
    }
    case "heading": {
      const h2 = b2 as typeof b1;
      return b1.level === h2.level && b1.text === h2.text;
    }
    case "code": {
      const c2 = b2 as typeof b1;
      return b1.lang === c2.lang && b1.code === c2.code;
    }
    case "quote": {
      const q2 = b2 as typeof b1;
      if (b1.lines.length !== q2.lines.length) return false;
      for (let i = 0; i < b1.lines.length; i++) {
        if (b1.lines[i] !== q2.lines[i]) return false;
      }
      return true;
    }
    case "alert": {
      const a2 = b2 as typeof b1;
      if (b1.alertType !== a2.alertType || b1.title !== a2.title) return false;
      if (b1.lines.length !== a2.lines.length) return false;
      for (let i = 0; i < b1.lines.length; i++) {
        if (b1.lines[i] !== a2.lines[i]) return false;
      }
      return true;
    }
    case "table": {
      const t2 = b2 as typeof b1;
      if (b1.headers.length !== t2.headers.length) return false;
      if (b1.alignments.length !== t2.alignments.length) return false;
      if (b1.rows.length !== t2.rows.length) return false;
      for (let i = 0; i < b1.headers.length; i++) {
        if (b1.headers[i] !== t2.headers[i]) return false;
        if (b1.alignments[i] !== t2.alignments[i]) return false;
      }
      for (let r = 0; r < b1.rows.length; r++) {
        if (b1.rows[r].length !== t2.rows[r].length) return false;
        for (let c = 0; c < b1.rows[r].length; c++) {
          if (b1.rows[r][c] !== t2.rows[r][c]) return false;
        }
      }
      return true;
    }
    case "math": {
      const m2 = b2 as typeof b1;
      return b1.math === m2.math && b1.display === m2.display;
    }
    case "rule":
      return true;
    case "list": {
      const l2 = b2 as typeof b1;
      if (b1.ordered !== l2.ordered || b1.items.length !== l2.items.length) {
        return false;
      }
      return areListItemsEqual(b1.items, l2.items);
    }
  }
}

const MemoizedBlockView = React.memo(BlockView, areBlocksEqual);

/** Caret shown at the end of a streaming answer. */
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
  /** Show a caret after the last character */
  streaming?: boolean;
  className?: string;
  /** Adds a run button to one-line snippets; called with the snippet text */
  onRun?: (code: string) => void;
  /** Snippet currently running, so its run button shows a spinner */
  runningCode?: string | null;
  /** Claims in `content` and their sources; each claim gets a chip with its `sources` */
  citations?: ChatCitation[];
  sources?: ChatSource[];
}

/**
 * While streaming, close inline marks the model has opened but not yet closed on the last
 * line, so `**bold` renders bold right away instead of showing raw `**` and then jumping to
 * bold when the closing pair arrives. Inline marks never span lines, so only the last line
 * matters; inside an open code fence nothing is touched.
 */
export function closeOpenInline(text: string): string {
  const fences = text.match(/^\s*```/gm)?.length ?? 0;
  if (fences % 2 === 1) return text;

  const lineStart = text.lastIndexOf("\n") + 1;
  // A lone trailing "*" is half of a closing "**" still on its way: hold it back.
  let line = text.slice(lineStart).replace(/(^|[^*])\*$/, "$1");

  const ticks = line.match(/`/g)?.length ?? 0;
  if (ticks % 2 === 1) line += "`";
  const bolds = line.match(/\*\*/g)?.length ?? 0;
  if (bolds % 2 === 1) line += "**";

  return text.slice(0, lineStart) + line;
}

export function ChatMarkdown({
  content,
  streaming = false,
  className = "",
  onRun,
  runningCode = null,
  citations,
  sources,
}: ChatMarkdownProps) {
  const visible = streaming
    ? closeOpenInline(content.replace(/\n[ \t]*`{1,2}$/, ""))
    : content;
  // Citations come with the finished answer, so while it streams nothing below changes
  const marked = markClaims(visible, citations);
  const blocks = parseBlocks(marked.content);
  const caret = streaming ? <StreamingCaret /> : null;
  const last = blocks[blocks.length - 1];
  const caretInline =
    !!last &&
    last.kind !== "code" &&
    last.kind !== "rule" &&
    last.kind !== "table" &&
    last.kind !== "math";
  // Unique sources, in the order the answer named them
  const uniqueSources = [...new Map((sources ?? []).map((s) => [s.id, s])).values()];
  const sourceChips = uniqueSources.length > 0 ? <SourceChips sources={uniqueSources} /> : null;
  // Caret and source chips share the end of the answer; they sit on the last text line when it can hold them
  const tail = caret || sourceChips ? (
    <>
      {caret}
      {sourceChips}
    </>
  ) : undefined;
  const blockViews = blocks.map((block, idx) => (
    <MemoizedBlockView
      key={idx}
      block={block}
      onRun={onRun}
      runningCode={runningCode}
      trailing={idx === blocks.length - 1 && caretInline ? tail : undefined}
    />
  ));
  // With citations the answer is the root the source chips highlight in; without, nothing is wrapped
  const scoped = marked.claims.length > 0 || uniqueSources.length > 0;

  return (
    <div
      data-citation-root={scoped ? "" : undefined}
      className={`min-w-0 max-w-full space-y-3 break-words text-sm leading-relaxed text-foreground ${className}`}
    >
      {scoped ? (
        <CitationContext.Provider value={marked.claims}>{blockViews}</CitationContext.Provider>
      ) : (
        blockViews
      )}
      {!caretInline && tail}
    </div>
  );
}
