import type { ChatMessage } from './types';
/** Keep the stored history short: older turns are not needed to answer the next question. */
export declare const MAX_STORED_MESSAGES = 50;
export interface StoredConversation {
    conversationId: string;
    messages: ChatMessage[];
}
export declare function conversationKey(baseUrl: string): string;
export declare function loadConversation(key: string): StoredConversation | null;
export declare function saveConversation(key: string, conversation: StoredConversation): void;
export declare function clearConversation(key: string): void;
