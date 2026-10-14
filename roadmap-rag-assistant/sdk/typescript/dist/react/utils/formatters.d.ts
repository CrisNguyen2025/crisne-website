import React from 'react';
/** Inline Markdown (**bold**, *italic*, `code`, [links](url)) as React nodes. */
export declare function renderInlineStyles(text: string): React.ReactNode;
/**
 * Block Markdown for a chat message. Kept for SDK consumers; new code can use
 * `<ChatMarkdown>` directly (it also supports a streaming caret).
 */
export declare function formatMarkdownText(content: string): React.ReactNode;
export declare function formatTime(date?: Date | string | number): string;
export declare function formatToolDisplayName(name: string): string;
