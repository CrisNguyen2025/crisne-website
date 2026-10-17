export interface CodeBlockProps {
    lang?: string;
    code: string;
    showLineNumbers?: boolean;
    onRun?: (code: string) => void;
    /** Snippet currently being run; the matching snippet shows a spinner and the rest are disabled */
    runningCode?: string | null;
}
export declare function CodeBlock({ lang, code, showLineNumbers, onRun, runningCode, }: CodeBlockProps): import("react/jsx-runtime").JSX.Element;
