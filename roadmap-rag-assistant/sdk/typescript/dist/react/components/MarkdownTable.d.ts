import React from "react";
export interface MarkdownTableProps {
    headers: string[];
    alignments: ("left" | "center" | "right")[];
    rows: string[][];
    renderInline: (text: string, fade?: boolean) => React.ReactNode[];
    fade?: boolean;
}
export declare function MarkdownTable({ headers, alignments, rows, renderInline, fade, }: MarkdownTableProps): import("react/jsx-runtime").JSX.Element;
