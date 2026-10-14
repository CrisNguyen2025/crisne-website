import type { PageContext, ChatActionChip } from '../types';
export type { ChatActionChip };
/**
 * Configuration and state types for the Roadmap Assistant Chatbot Widget.
 */
export type ChatbotPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export interface ToolCall {
    name: string;
    args?: Record<string, unknown>;
    result: string;
    /** Epoch ms when the tool started (client clock). */
    startedAt?: number;
    /** Epoch ms when the tool finished; undefined while running. */
    endedAt?: number;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: ToolCall[];
    actionChips?: ChatActionChip[];
    status?: 'sending' | 'streaming' | 'complete' | 'error';
    /** Epoch ms of the first streamed token; ends the "thinking" step. */
    firstTokenAt?: number;
    timestamp: Date;
}
export interface ChatbotConfig {
    /**
     * Screen anchor corner for the floating widget.
     * Default: 'bottom-right'
     */
    position?: ChatbotPosition;
    /**
     * Horizontal offset from screen edge in pixels.
     * Default: 24
     */
    offsetX?: number;
    /**
     * Vertical offset from screen edge in pixels.
     * Default: 24
     */
    offsetY?: number;
    /**
     * CSS z-index for floating container.
     * Default: 9999
     */
    zIndex?: number;
    /**
     * Widget title in header.
     * Default: 'Roadmap Assistant'
     */
    title?: string;
    /**
     * Subtitle description in header.
     * Default: 'Natural Language CUD & Mini-RAG'
     */
    subtitle?: string;
    /**
     * FastAPI service base URL.
     * Default: 'http://localhost:8000'
     */
    baseUrl?: string;
    /**
     * Returns the page the user is viewing (roadmap, layer, item), sent with each message.
     */
    getContext?: () => PageContext | undefined;
    /** Handles "/webmcp <request>" messages by running a WebMCP tool in the browser. */
    onWebMcpMessage?: (request: string) => Promise<string>;
    /**
     * Whether the chat window starts open.
     * Default: false
     */
    initialOpen?: boolean;
    /**
     * Suggested quick prompts displayed in the empty state.
     */
    suggestedPrompts?: string[];
    /**
     * Initial messages to populate the chat history.
     */
    initialMessages?: ChatMessage[];
    /**
     * Callback fired whenever the agent invokes a tool successfully.
     */
    onToolExecuted?: (toolName: string, result: string) => void;
    /**
     * Callback fired when user rates an answer (1 for like, 0 for unlike) with optional detail.
     */
    onFeedback?: (messageId: string, value: 0 | 1, detail?: FeedbackDetail) => void | Promise<void>;
    /**
     * Optional custom CSS class name for the wrapper container.
     */
    className?: string;
}
export interface FeedbackDetail {
    reason?: string;
    comment?: string;
    query?: string;
    assistantMsg?: string;
}
