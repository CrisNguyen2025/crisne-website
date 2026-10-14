import type { ChatMessage } from './types';
import type { PageContext } from '../types';
export interface UseRoadmapAssistantChatOptions {
    baseUrl?: string;
    threadId?: string;
    initialMessages?: ChatMessage[];
    onToolExecuted?: (toolName: string, result: string) => void;
    /** Returns the page the user is viewing; read at send time. */
    getContext?: () => PageContext | undefined;
    /** Handles "/webmcp <request>" messages; returns the text to show. */
    onWebMcpMessage?: (request: string) => Promise<string>;
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
    sendMessage: (textToSend?: string) => Promise<void>;
    stopStreaming: () => void;
    clearMessages: () => void;
}
export declare function useRoadmapAssistantChat(options?: UseRoadmapAssistantChatOptions): UseRoadmapAssistantChatReturn;
