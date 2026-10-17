import React from 'react';
import type { AssistantStepEvent } from '../../types';
import type { StepItem } from '../ToolStepRow';
/** Inline Markdown (**bold**, *italic*, `code`, [links](url)) as React nodes. */
export declare function renderInlineStyles(text: string): React.ReactNode;
/**
 * Block Markdown for a chat message. Kept for SDK consumers; new code can use
 * `<ChatMarkdown>` directly (it also supports a streaming caret).
 */
export declare function formatMarkdownText(content: string): React.ReactNode;
export declare function formatTime(date?: Date | string | number): string;
export declare function formatToolDisplayName(name: string): string;
/** Row title for a step; the server sends data only (contract: rag_service/steps.py). */
export declare function formatStepLabel(step: AssistantStepEvent): string;
/** Short result shown next to the title once the step has finished. */
export declare function formatStepSummary(step: AssistantStepEvent): string | undefined;
/** Expanded body of a step (retrieval items are rendered separately as links). */
export declare function formatStepDetail(step: AssistantStepEvent): string | undefined;
/** Timeline rows for a message's step events. */
export declare function toStepItems(msgId: string, steps: AssistantStepEvent[], isLive: boolean): StepItem[];
