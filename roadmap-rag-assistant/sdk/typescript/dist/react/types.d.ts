/**
 * Configuration and state types for the Roadmap Assistant Chatbot Widget.
 */
export type ChatbotPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: Array<{
        name: string;
        args?: Record<string, unknown>;
        result: string;
    }>;
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
     * Whether the chat window starts open.
     * Default: false
     */
    initialOpen?: boolean;
    /**
     * Suggested quick prompts displayed in the empty state.
     */
    suggestedPrompts?: string[];
    /**
     * Callback fired whenever the agent invokes a tool successfully.
     */
    onToolExecuted?: (toolName: string, result: string) => void;
    /**
     * Optional custom CSS class name for the wrapper container.
     */
    className?: string;
}
