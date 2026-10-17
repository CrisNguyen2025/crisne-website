import React from "react";
export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";
export interface CalloutAlertProps {
    type: CalloutType;
    title?: string;
    lines: string[];
    renderInline: (text: string, fade?: boolean) => React.ReactNode[];
    trailing?: React.ReactNode;
    fade?: boolean;
}
export declare function CalloutAlert({ type, title, lines, renderInline, trailing, fade, }: CalloutAlertProps): import("react/jsx-runtime").JSX.Element;
