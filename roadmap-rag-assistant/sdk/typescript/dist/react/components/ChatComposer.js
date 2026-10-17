"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_INPUT_LENGTH = void 0;
exports.ChatComposer = ChatComposer;
const jsx_runtime_1 = require("react/jsx-runtime");
const icons_1 = require("../icons");
/** Longest question the reader can type; the proxy and the service refuse more. */
exports.MAX_INPUT_LENGTH = 2000;
/** Show the counter once the question is close to the limit. */
const COUNTER_THRESHOLD = 1800;
function ChatComposer({ inputRef, input, setInput, isLoading, showStop, stopStreaming, handleSend, handleKeyDown, }) {
    return ((0, jsx_runtime_1.jsx)("div", { className: "p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#E6E4DF] bg-[#FFFFFF] shrink-0", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 rounded-2xl border border-[#E6E4DF] bg-[#F4F3F0]/80 py-1.5 pl-4 pr-1.5 transition-all focus-within:bg-[#FFFFFF] focus-within:border-[#C2410C]/60", children: [(0, jsx_runtime_1.jsx)("input", { ref: inputRef, type: "text", value: input, maxLength: exports.MAX_INPUT_LENGTH, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: isLoading
                        ? "Abot đang trả lời…"
                        : "Hỏi Abot hoặc gõ /plan…", className: "min-w-0 flex-1 bg-transparent py-1 text-[16px] md:text-sm font-normal tracking-[-0.01em] leading-normal text-[#1F1E1C] outline-none placeholder:text-[#6B6862]/70 placeholder:font-normal placeholder:text-sm disabled:opacity-50" }), input.length >= COUNTER_THRESHOLD && ((0, jsx_runtime_1.jsxs)("span", { className: `shrink-0 select-none text-[11px] tabular-nums ${input.length >= exports.MAX_INPUT_LENGTH ? "text-[#B42318]" : "text-[#6B6862]"}`, children: [input.length.toLocaleString("vi-VN"), "/", exports.MAX_INPUT_LENGTH.toLocaleString("vi-VN")] })), showStop ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: stopStreaming, title: "D\u1EEBng ph\u1EA3n h\u1ED3i", "aria-label": "D\u1EEBng ph\u1EA3n h\u1ED3i", className: "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#FBEDE5] text-[#B42318] border border-[#B42318]/20 transition-all hover:opacity-90 active:scale-95", children: (0, jsx_runtime_1.jsx)(icons_1.StopIcon, { className: "h-3.5 w-3.5" }) })) : ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleSend(), disabled: !input.trim(), "aria-label": "G\u1EEDi tin nh\u1EAFn", className: "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#C2410C] text-white shadow-xs transition-all hover:bg-[#9A3412] hover:scale-105 active:scale-95 disabled:bg-[#E6E4DF] disabled:text-[#6B6862] disabled:opacity-40 disabled:hover:scale-100", children: (0, jsx_runtime_1.jsx)(icons_1.ArrowUpIcon, { className: "h-4 w-4" }) }))] }) }));
}
