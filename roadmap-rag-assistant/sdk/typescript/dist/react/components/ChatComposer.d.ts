import React from "react";
/** Longest question the reader can type; the proxy and the service refuse more. */
export declare const MAX_INPUT_LENGTH = 2000;
export interface ChatComposerProps {
    inputRef: React.RefObject<HTMLInputElement | null>;
    input: string;
    setInput: (value: string) => void;
    isLoading: boolean;
    showStop: boolean;
    stopStreaming: () => void;
    handleSend: (textToSend?: string) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}
export declare function ChatComposer({ inputRef, input, setInput, isLoading, showStop, stopStreaming, handleSend, handleKeyDown, }: ChatComposerProps): import("react/jsx-runtime").JSX.Element;
