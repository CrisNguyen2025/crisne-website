import React from "react";
import { CalloutType } from "./components/CalloutAlert";
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
 * - **bold**, *italic*, `inline code`, [links](url), $math$
 */
export type ListItem = {
    text: string;
    num: number;
    ordered: boolean;
    checked?: boolean;
    children: ListItem[];
};
export type Block = {
    kind: "heading";
    level: number;
    text: string;
} | {
    kind: "paragraph";
    lines: string[];
} | {
    kind: "list";
    ordered: boolean;
    items: ListItem[];
} | {
    kind: "code";
    lang: string;
    code: string;
} | {
    kind: "quote";
    lines: string[];
} | {
    kind: "alert";
    alertType: CalloutType;
    title?: string;
    lines: string[];
} | {
    kind: "table";
    headers: string[];
    alignments: ("left" | "center" | "right")[];
    rows: string[][];
} | {
    kind: "math";
    math: string;
    display: boolean;
} | {
    kind: "rule";
};
export declare function parseBlocks(content: string): Block[];
export declare function renderInline(text: string, fade?: boolean): React.ReactNode[];
/** Caret shown at the end of a streaming answer. */
export declare function StreamingCaret(): import("react/jsx-runtime").JSX.Element;
export interface ChatMarkdownProps {
    content: string;
    /** Show a caret after the last character */
    streaming?: boolean;
    className?: string;
    /** Adds a run button to one-line snippets; called with the snippet text */
    onRun?: (code: string) => void;
    /** Snippet currently running, so its run button shows a spinner */
    runningCode?: string | null;
}
export declare function ChatMarkdown({ content, streaming, className, onRun, runningCode, }: ChatMarkdownProps): import("react/jsx-runtime").JSX.Element;
