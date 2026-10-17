import React from "react";
export interface ChatHeaderProps {
    canWrite: boolean;
    clearMessages: () => void;
    copiedConvId: boolean;
    handleCopyConversationId: (e: React.MouseEvent) => void;
    isOptionsOpen: boolean;
    optionsRef: React.RefObject<HTMLDivElement | null>;
    setIsOpen: (open: boolean) => void;
    setIsOptionsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    status: string;
    title: string;
}
export declare function ChatHeader({ canWrite, clearMessages, copiedConvId, handleCopyConversationId, isOptionsOpen, optionsRef, setIsOpen, setIsOptionsOpen, status, title }: ChatHeaderProps): import("react/jsx-runtime").JSX.Element;
