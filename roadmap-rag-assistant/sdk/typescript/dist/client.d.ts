/**
 * RoadmapChatClient — TypeScript SDK for the Roadmap RAG Assistant with SSE streaming.
 */
import type { AssistantStepEvent, ChatResponse, HealthResponse, PageContext, PlanResponse, WebMcpToolSpec } from './types';
export interface RoadmapChatClientOptions {
    baseUrl?: string;
    /** Total time allowed for one request, in ms. */
    timeout?: number;
    /** Longest silence allowed between stream chunks, in ms. */
    idleTimeout?: number;
}
/** The stream stopped sending data for too long; the request was cancelled. */
export declare class StreamTimeoutError extends Error {
    readonly kind: "timeout";
    constructor(message?: string);
}
export type { AssistantStepEvent, AssistantStepItem, AssistantStepKind } from './types';
export interface StreamCallbacks {
    onToken?: (delta: string) => void;
    onThinking?: (delta: string) => void;
    onToolStart?: (name: string, args: Record<string, unknown>) => void;
    onToolEnd?: (name: string, result: string) => void;
    onStep?: (step: AssistantStepEvent) => void;
    onDone?: (response: ChatResponse) => void;
    onError?: (error: Error) => void;
}
export declare class RoadmapChatClient {
    private readonly baseUrl;
    private readonly timeout;
    private readonly idleTimeout;
    constructor(options?: RoadmapChatClientOptions);
    /**
     * Real-time Server-Sent Events (SSE) streaming chat.
     *
     * @param message - User prompt
     * @param callbacks - Event callbacks for real-time tokens and tool events
     * @param threadId - Conversation thread ID
     * @param context - Optional page context (current roadmap, layer, item)
     * @returns AbortController to allow canceling the stream
     */
    streamChat(message: string, callbacks: StreamCallbacks, threadId?: string, context?: PageContext): AbortController;
    /**
     * Synchronous chat request (waits until response completes).
     */
    chat(message: string, threadId?: string, context?: PageContext): Promise<ChatResponse>;
    /**
     * Ask the service to choose one WebMCP tool for a message. Nothing is executed server-side.
     */
    plan(message: string, tools: WebMcpToolSpec[], context?: PageContext): Promise<PlanResponse>;
    /**
     * Check health of the Assistant service.
     */
    health(): Promise<HealthResponse>;
}
