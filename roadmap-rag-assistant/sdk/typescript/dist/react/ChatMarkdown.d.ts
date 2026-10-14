import React from "react";
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
type ListItem = {
    text: string;
    num: number;
    ordered: boolean;
    children: ListItem[];
};
type Block = {
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
    kind: "rule";
};
export declare function parseBlocks(content: string): Block[];
export declare function renderInline(text: string): React.ReactNode[];
/** Thin caret shown at the end of a streaming answer. */
export declare function StreamingCaret(): import("react/jsx-runtime").JSX.Element;
export interface ChatMarkdownProps {
    content: string;
    /** Show a caret after the last character (inline when the last block allows it). */
    streaming?: boolean;
    className?: string;
    /** Adds a run button to one-line snippets; called with the snippet text. */
    onRun?: (code: string) => void;
}
export declare function ChatMarkdown({ content, streaming, className, onRun, }: ChatMarkdownProps): import("react/jsx-runtime").JSX.Element;
export {};
