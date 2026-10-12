import type { ChatMessage } from './types';
export interface UseRoadmapAssistantChatOptions {
    baseUrl?: string;
    threadId?: string;
    onToolExecuted?: (toolName: string, result: string) => void;
}
export declare function useRoadmapAssistantChat(options?: UseRoadmapAssistantChatOptions): {
    messages: ChatMessage[];
    input: string;
    setInput: import("react").Dispatch<import("react").SetStateAction<string>>;
    isLoading: boolean;
    isStreaming: boolean;
    activeTool: string | null;
    error: string | null;
    sendMessage: (textToSend?: string) => Promise<void>;
    stopStreaming: () => void;
    clearMessages: () => void;
};
