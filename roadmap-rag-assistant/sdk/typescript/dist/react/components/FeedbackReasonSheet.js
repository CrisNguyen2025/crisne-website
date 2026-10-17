"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackReasonSheet = FeedbackReasonSheet;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const icons_1 = require("../icons");
const UNLIKE_REASONS = [
    "Ảo giác / Sai kiến thức",
    "Lạc đề / Chưa đúng trọng tâm",
    "Lỗi cú pháp / Lộ trình hỏng",
    "Khó hiểu / Quá dài dòng",
];
function FeedbackReasonSheet({ onSubmit, onClose, }) {
    const [selectedReason, setSelectedReason] = (0, react_1.useState)(null);
    const [comment, setComment] = (0, react_1.useState)("");
    const [isSubmitted, setIsSubmitted] = (0, react_1.useState)(false);
    const handleSubmit = (e) => {
        e?.preventDefault();
        setIsSubmitted(true);
        onSubmit(selectedReason || undefined, comment.trim() || undefined);
        setTimeout(() => {
            onClose();
        }, 1200);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between pb-2 border-b border-[#E6E4DF]/60", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs font-semibold text-[#1F1E1C]", children: "G\u00F3p \u00FD c\u00E2u tr\u1EA3 l\u1EDDi ch\u01B0a t\u1ED1t" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: onClose, title: "\u0110\u00F3ng", "aria-label": "\u0110\u00F3ng b\u1EA3ng g\u00F3p \u00FD", className: "flex h-8 w-8 min-h-[44px] min-w-[44px] md:h-5 md:w-5 md:min-h-0 md:min-w-0 items-center justify-center rounded text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: (0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-4 w-4 md:h-3.5 md:w-3.5" }) })] }), isSubmitted ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-center gap-1.5 py-6 text-xs font-medium text-[#3F7D58]", children: [(0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-4 w-4" }), (0, jsx_runtime_1.jsx)("span", { children: "\u0110\u00E3 ghi nh\u1EADn g\u00F3p \u00FD, c\u1EA3m \u01A1n b\u1EA1n!" })] })) : ((0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, className: "flex flex-col gap-2.5 pt-2.5", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-1.5", children: UNLIKE_REASONS.map((opt) => {
                            const isSelected = selectedReason === opt;
                            return ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setSelectedReason(isSelected ? null : opt), className: `rounded-md px-3 py-1.5 min-h-[38px] md:min-h-0 text-xs transition-colors cursor-pointer flex items-center justify-center ${isSelected
                                    ? "border border-[#C2410C] bg-[#FBEDE5] text-[#C2410C] font-medium"
                                    : "border border-[#E6E4DF] bg-[#F4F3F0] text-[#1F1E1C] hover:bg-[#ECEAE5]"}`, children: opt }, opt));
                        }) }), (0, jsx_runtime_1.jsx)("textarea", { value: comment, onChange: (e) => setComment(e.target.value), placeholder: "AI c\u1EA7n c\u1EA3i thi\u1EC7n \u0111i\u1EC3m n\u00E0o? (t\u00F9y ch\u1ECDn)...", rows: 2, maxLength: 300, className: "w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] p-2.5 text-[16px] md:text-xs text-[#1F1E1C] outline-none placeholder:text-[#6B6862] focus:border-[#C2410C] focus:bg-[#FFFFFF]" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-end gap-2 pt-0.5", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: onClose, className: "rounded-md px-3 py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-xs text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: "B\u1ECF qua" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "rounded-lg bg-[#C2410C] px-3.5 py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-xs font-medium text-white transition-opacity hover:opacity-90 cursor-pointer", children: "G\u1EEDi g\u00F3p \u00FD" })] })] }))] }));
}
