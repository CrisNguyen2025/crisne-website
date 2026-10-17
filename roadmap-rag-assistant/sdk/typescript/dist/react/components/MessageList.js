"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageList = MessageList;
const jsx_runtime_1 = require("react/jsx-runtime");
const icons_1 = require("../icons");
const ChatMarkdown_1 = require("../ChatMarkdown");
const LayerChoicePicker_1 = require("../LayerChoicePicker");
const ToolStepRow_1 = require("../ToolStepRow");
const formatters_1 = require("../utils/formatters");
const welcome_1 = require("../welcome");
const PulsatingDots_1 = require("./PulsatingDots");
function MessageList({ messages, isLoading, isStreaming, runningCode, expandedTools, feedback, copiedId, sendMessage, retry, copyMessage, handleFeedback, handleRunCode, toggleToolExpand, scrollRef, bottomSentinelRef, showScrollBottom, scrollToBottom }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "relative flex min-h-0 flex-1 flex-col", children: [(0, jsx_runtime_1.jsxs)("div", { ref: scrollRef, className: "flex-1 space-y-6 overflow-y-auto px-4 py-5 overscroll-contain touch-pan-y [scrollbar-color:#E6E4DF_transparent] [scrollbar-width:thin]", children: [messages.map((msg) => {
                        const isUser = msg.role === "user";
                        const timeStr = (0, formatters_1.formatTime)(msg.timestamp);
                        const isLast = msg.id === messages[messages.length - 1]?.id;
                        const isLive = !isUser && isStreaming && isLast;
                        const toolCalls = msg.toolCalls ?? [];
                        const toolRunning = toolCalls.some((tc) => tc.endedAt === undefined && isLive);
                        // Waiting for the model after tools finished (or before any tool started).
                        const showThinking = isLive && !msg.content && !toolRunning;
                        const thinkingSince = toolCalls[toolCalls.length - 1]?.endedAt ??
                            new Date(msg.timestamp).getTime();
                        if (isUser) {
                            return ((0, jsx_runtime_1.jsxs)("div", { className: "group flex flex-col items-end gap-1", children: [(0, jsx_runtime_1.jsx)("div", { className: "relative max-w-[88%] md:max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-[#F4F3F0] px-3.5 py-2.5 text-sm leading-relaxed text-[#1F1E1C]", children: msg.content }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 pr-1 text-xs text-[#6B6862]", children: [timeStr && (0, jsx_runtime_1.jsx)("span", { className: "select-none text-[11px]", children: timeStr }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => copyMessage(msg.id, msg.content), title: "Sao ch\u00E9p c\u00E2u h\u1ECFi", "aria-label": "Sao ch\u00E9p c\u00E2u h\u1ECFi", className: "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: copiedId === msg.id ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-[#3F7D58]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" })) })] })] }, msg.id));
                        }
                        const awaitingConfirm = !isStreaming &&
                            isLast &&
                            (msg.content.includes("Xác nhận thực hiện") ||
                                msg.content.includes("DRY-RUN PREVIEW"));
                        const awaitingLayerChoice = !isStreaming &&
                            isLast &&
                            msg.content.includes("Chọn layer cho bài học");
                        // Step events from the server when it sends them; tool calls for older servers.
                        const stepItems = msg.steps?.length
                            ? (0, formatters_1.toStepItems)(msg.id, msg.steps, isLive)
                            : toolCalls.map((tc, idx) => ({
                                id: `${msg.id}-${idx}`,
                                label: (0, formatters_1.formatToolDisplayName)(tc.name),
                                startedAt: tc.startedAt,
                                endedAt: tc.endedAt,
                                running: isLive && tc.endedAt === undefined,
                                detail: tc.result,
                            }));
                        // Between steps (e.g. the model extracting entities) nothing is running yet:
                        // keep the header live instead of showing "Thought for" before the answer starts.
                        if (msg.steps?.length && isLive && !msg.content && !stepItems.some((s) => s.running)) {
                            const lastEnd = msg.steps[msg.steps.length - 1].endedAt;
                            stepItems.push({ id: `${msg.id}-thinking`, label: "Đang suy nghĩ…", startedAt: lastEnd ?? thinkingSince, running: true });
                        }
                        if (!msg.steps?.length && toolCalls.length === 0) {
                            if (showThinking) {
                                stepItems.push({ id: `${msg.id}-thinking`, label: "Đang suy nghĩ…", startedAt: thinkingSince, running: true });
                            }
                            else if (msg.firstTokenAt && thinkingSince) {
                                // Only streamed answers: a static greeting has no thinking to show
                                stepItems.push({ id: `${msg.id}-thinking`, label: "Đã suy nghĩ", startedAt: thinkingSince, endedAt: msg.firstTokenAt, running: false });
                            }
                        }
                        return ((0, jsx_runtime_1.jsxs)("div", { className: "group flex flex-col gap-2", children: [stepItems.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "-mx-1", children: (0, jsx_runtime_1.jsx)(ToolStepRow_1.CollapsibleStepsSummary, { steps: stepItems, expandedTools: expandedTools, onToggleTool: toggleToolExpand, isLive: isLive }) })), msg.content && ((0, jsx_runtime_1.jsx)("div", { className: "text-sm leading-relaxed text-[#1F1E1C] py-0.5", children: (0, jsx_runtime_1.jsx)(ChatMarkdown_1.ChatMarkdown, { content: msg.content, streaming: isLive, onRun: handleRunCode, runningCode: isLoading ? runningCode : null }) })), msg.status === "error" && !isLive && ((0, jsx_runtime_1.jsx)("div", { className: "pt-0.5", children: (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => retry(msg.id), disabled: isLoading, className: "flex items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-3 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#ECEAE5] disabled:opacity-50 cursor-pointer", children: "Th\u1EED l\u1EA1i" }) })), !msg.content && !isLive && ((0, jsx_runtime_1.jsx)("p", { className: "py-0.5 text-sm italic text-[#6B6862]", children: "M\u00ECnh ch\u01B0a c\u00F3 c\u00E2u tr\u1EA3 l\u1EDDi cho c\u00E2u n\u00E0y. B\u1EA1n n\u00F3i r\u00F5 h\u01A1n gi\u00FAp m\u00ECnh nh\u00E9." })), msg.stopped && ((0, jsx_runtime_1.jsx)("p", { className: "text-xs italic text-[#6B6862]", children: "\u0110\u00E3 d\u1EEBng" })), awaitingConfirm && ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2 pt-1", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-xs text-[#6B6862]", children: "\u0110ang ch\u1EDD b\u1EA1n x\u00E1c nh\u1EADn" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => sendMessage("ok"), disabled: isLoading, className: "flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer", children: [(0, jsx_runtime_1.jsx)(icons_1.CheckCircleIcon, { className: "h-3.5 w-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "X\u00E1c nh\u1EADn th\u1EF1c hi\u1EC7n" })] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => sendMessage("hủy"), disabled: isLoading, className: "flex items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] px-3.5 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#ECEAE5] disabled:opacity-50 cursor-pointer", children: [(0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-3.5 w-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "H\u1EE7y b\u1ECF" })] })] })] })), awaitingLayerChoice && ((0, jsx_runtime_1.jsx)(LayerChoicePicker_1.LayerChoicePicker, { onSend: sendMessage, disabled: isLoading })), msg.content && ((0, jsx_runtime_1.jsxs)("div", { className: `flex items-center justify-end gap-1 pt-1 text-xs text-[#6B6862] transition-opacity duration-200 ${isLive ? "invisible opacity-0" : "opacity-100"}`, children: [timeStr && (0, jsx_runtime_1.jsx)("span", { className: "select-none text-[11px] pr-1", children: timeStr }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => copyMessage(msg.id, msg.content), title: "Sao ch\u00E9p", "aria-label": "Sao ch\u00E9p c\u00E2u tr\u1EA3 l\u1EDDi", className: "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: copiedId === msg.id ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-[#3F7D58]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" })) }), msg.id !== welcome_1.WELCOME_MESSAGE_ID && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleFeedback(msg.id, 1), title: "H\u1EEFu \u00EDch", "aria-label": "C\u00E2u tr\u1EA3 l\u1EDDi h\u1EEFu \u00EDch", "aria-pressed": feedback[msg.id] === 1, className: `flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color] duration-200 ease-out hover:bg-[#F4F3F0] cursor-pointer ${feedback[msg.id] === 1
                                                        ? "text-[#3F7D58] bg-[#E6F1EA]"
                                                        : "text-[#6B6862] hover:text-[#1F1E1C]"}`, children: (0, jsx_runtime_1.jsx)(icons_1.ThumbsUpIcon, { className: `h-3.5 w-3.5 transition-[fill] duration-200 ease-out ${feedback[msg.id] === 1 ? "fill-current" : "fill-transparent"}` }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleFeedback(msg.id, 0), title: "Ch\u01B0a t\u1ED1t", "aria-label": "C\u00E2u tr\u1EA3 l\u1EDDi ch\u01B0a t\u1ED1t", "aria-pressed": feedback[msg.id] === 0, className: `flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color] duration-200 ease-out hover:bg-[#F4F3F0] cursor-pointer ${feedback[msg.id] === 0
                                                        ? "text-[#B42318] bg-[#FBEDE5]"
                                                        : "text-[#6B6862] hover:text-[#1F1E1C]"}`, children: (0, jsx_runtime_1.jsx)(icons_1.ThumbsDownIcon, { className: `h-3.5 w-3.5 transition-[fill] duration-200 ease-out ${feedback[msg.id] === 0 ? "fill-current" : "fill-transparent"}` }) })] }))] }))] }, msg.id));
                    }), (0, jsx_runtime_1.jsx)("div", { ref: bottomSentinelRef, "aria-hidden": "true", className: "!mt-0 h-px" })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: scrollToBottom, tabIndex: showScrollBottom ? 0 : -1, "aria-hidden": !showScrollBottom, "aria-label": isLoading ? "Đang trả lời — cuộn xuống để xem" : "Cuộn xuống cuối", className: `absolute bottom-1 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_2px_8px_rgb(0_0_0_/_0.08)] transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#F4F3F0] active:scale-95 ${showScrollBottom
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-3 scale-90 opacity-0"}`, children: isLoading ? ((0, jsx_runtime_1.jsx)(PulsatingDots_1.PulsatingDots, { className: "h-2.5 w-5 text-[#C2410C]" })) : ((0, jsx_runtime_1.jsx)(icons_1.ArrowDownIcon, { className: "h-3.5 w-3.5" })) })] }));
}
