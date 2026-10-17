interface FeedbackReasonSheetProps {
    messageId: string;
    onSubmit: (reason?: string, comment?: string) => void;
    onClose: () => void;
}
export declare function FeedbackReasonSheet({ onSubmit, onClose, }: FeedbackReasonSheetProps): import("react/jsx-runtime").JSX.Element;
export {};
