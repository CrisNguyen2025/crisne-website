import type { ChatMessage } from './types';
import type { PageContext } from '../types';
export interface UseRoadmapAssistantChatOptions {
    baseUrl?: string;
    threadId?: string;
    conversationId?: string;
    initialMessages?: ChatMessage[];
    onToolExecuted?: (toolName: string, result: string) => void;
    /** Returns the page the user is viewing; read at send time. */
    getContext?: () => PageContext | undefined;
    /** Handles "/webmcp <request>" messages; returns the text to show. */
    onWebMcpMessage?: (request: string) => Promise<string>;
    /** Whether the reader may change roadmap data; decides which examples the greeting shows. */
    canWrite?: boolean;
}
export interface UseRoadmapAssistantChatReturn {
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    input: string;
    setInput: React.Dispatch<React.SetStateAction<string>>;
    isLoading: boolean;
    isStreaming: boolean;
    activeTool: string | null;
    error: string | null;
    conversationId: string;
    sendMessage: (textToSend?: string) => Promise<void>;
    stopStreaming: () => void;
    clearMessages: () => void;
    retry: (errorMessageId: string) => void;
}
export declare function useRoadmapAssistantChat(options?: UseRoadmapAssistantChatOptions): UseRoadmapAssistantChatReturn;
