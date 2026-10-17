import React from "react";
import type { ChatMessage } from "../types";
export interface MessageListProps {
    messages: ChatMessage[];
    isLoading: boolean;
    isStreaming: boolean;
    runningCode: string | null;
    expandedTools: Record<string, boolean>;
    feedback: Record<string, 1 | 0>;
    copiedId: string | null;
    sendMessage: (textToSend?: string) => void;
    retry: (errorMessageId: string) => void;
    copyMessage: (id: string, text: string) => void;
    handleFeedback: (msgId: string, val: 1 | 0) => void;
    handleRunCode: (code: string) => void;
    toggleToolExpand: (id: string) => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
    showScrollBottom: boolean;
    scrollToBottom: () => void;
}
export declare function MessageList({ messages, isLoading, isStreaming, runningCode, expandedTools, feedback, copiedId, sendMessage, retry, copyMessage, handleFeedback, handleRunCode, toggleToolExpand, scrollRef, bottomSentinelRef, showScrollBottom, scrollToBottom }: MessageListProps): import("react/jsx-runtime").JSX.Element;
