"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadmapChatbotWidget = RoadmapChatbotWidget;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const useRoadmapAssistantChat_1 = require("./useRoadmapAssistantChat");
const icons_1 = require("./icons");
const formatters_1 = require("./utils/formatters");
const ChatMarkdown_1 = require("./ChatMarkdown");
const LayerChoicePicker_1 = require("./LayerChoicePicker");
const ToolStepRow_1 = require("./ToolStepRow");
const WIDGET_THEME_VARS = {
    ["--bg"]: "#FFFFFF",
    ["--surface"]: "#F4F3F0",
    ["--border"]: "#E6E4DF",
    ["--text"]: "#1F1E1C",
    ["--text-muted"]: "#6B6862",
    ["--accent"]: "#C2410C",
    ["--accent-soft"]: "#FBEDE5",
    ["--success"]: "#3F7D58",
    ["--danger"]: "#B42318",
    // Semantic mappings for Tailwind components (e.g. ChatMarkdown)
    ["--background"]: "#FFFFFF",
    ["--foreground"]: "#1F1E1C",
    ["--muted-foreground"]: "#6B6862",
    ["--card"]: "#F4F3F0",
    ["--card-foreground"]: "#1F1E1C",
    ["--popover"]: "#FFFFFF",
    ["--popover-foreground"]: "#1F1E1C",
    ["--border"]: "#E6E4DF",
    ["--input"]: "#F4F3F0",
    ["--muted"]: "#F4F3F0",
    ["--primary"]: "#C2410C",
    ["--primary-foreground"]: "#FFFFFF",
    colorScheme: "light",
};
function RoadmapChatbotWidget({ position = "bottom-right", offsetX = 24, offsetY = 24, zIndex = 9999, title = "Roadmap Assistant", subtitle = "AI Knowledge & Roadmap Agent", baseUrl = "http://localhost:8000", initialOpen = false, initialMessages, onToolExecuted, getContext, onWebMcpMessage, className = "", }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(initialOpen);
    const [expandedTools, setExpandedTools] = (0, react_1.useState)({});
    const [feedback, setFeedback] = (0, react_1.useState)({});
    const [copiedId, setCopiedId] = (0, react_1.useState)(null);
    const handleFeedback = (msgId, val) => {
        setFeedback((prev) => ({
            ...prev,
            [msgId]: prev[msgId] === val ? undefined : val,
        }));
    };
    const { messages, input, setInput, isLoading, isStreaming, activeTool, sendMessage, stopStreaming, clearMessages, } = (0, useRoadmapAssistantChat_1.useRoadmapAssistantChat)({
        baseUrl,
        initialMessages,
        onToolExecuted,
        getContext,
        onWebMcpMessage,
    });
    const scrollRef = (0, react_1.useRef)(null);
    const inputRef = (0, react_1.useRef)(null);
    const containerRef = (0, react_1.useRef)(null);
    const isSendingRef = (0, react_1.useRef)(false);
    // Click outside to close smoothly
    (0, react_1.useEffect)(() => {
        if (!isOpen)
            return;
        const handleClickOutside = (event) => {
            if (containerRef.current &&
                !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside, { passive: true });
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);
    // Auto-scroll (immediate follow during stream like Claude Code, smooth on arrival)
    (0, react_1.useEffect)(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: isStreaming ? "auto" : "smooth",
            });
        }
    }, [messages, isOpen, isStreaming, activeTool]);
    // Auto-focus on open or when generation completes
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            const timer = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen, isLoading]);
    // Reset the "copied" tick after a moment
    (0, react_1.useEffect)(() => {
        if (!copiedId)
            return;
        const timer = setTimeout(() => setCopiedId(null), 1500);
        return () => clearTimeout(timer);
    }, [copiedId]);
    // Offsets and z-index come from props, so they cannot be static utility classes.
    const positionStyles = (0, react_1.useMemo)(() => {
        const styles = { position: "fixed", zIndex };
        const vertical = position.startsWith("top") ? "top" : "bottom";
        const horizontal = position.endsWith("left") ? "left" : "right";
        styles[vertical] = `${offsetY}px`;
        styles[horizontal] = `${offsetX}px`;
        return styles;
    }, [position, offsetX, offsetY, zIndex]);
    const toggleToolExpand = (id) => {
        setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    const handleSend = (textToSend) => {
        if (isSendingRef.current)
            return;
        const val = (textToSend ?? input).trim();
        if (!val)
            return;
        isSendingRef.current = true;
        setTimeout(() => {
            isSendingRef.current = false;
        }, 400);
        // 1. Immediately wipe both React state and DOM value
        setInput("");
        if (inputRef.current) {
            inputRef.current.value = "";
        }
        // 2. Keep input focused immediately
        inputRef.current?.focus();
        // 3. Send message
        sendMessage(val);
        // 4. Re-ensure focus on next animation frame
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };
    const handleKeyDown = (e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const copyMessage = (id, text) => {
        navigator.clipboard?.writeText(text).then(() => setCopiedId(id), () => { });
    };
    const status = activeTool
        ? (0, formatters_1.formatToolDisplayName)(activeTool)
        : isStreaming
            ? "Đang trả lời…"
            : subtitle;
    const showStop = isStreaming && !input.trim();
    return ((0, jsx_runtime_1.jsxs)("div", { style: positionStyles, className: `pointer-events-none flex flex-col font-sans ${position.endsWith("left") ? "items-start" : "items-end"} ${className}`, children: [isOpen && ((0, jsx_runtime_1.jsxs)("div", { ref: containerRef, style: WIDGET_THEME_VARS, className: "pointer-events-auto mb-3 flex h-[600px] max-h-[80vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] animate-in fade-in zoom-in-95 duration-200", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between gap-3 border-b border-[#E6E4DF] bg-[#FFFFFF] px-4 py-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex min-w-0 items-center gap-2.5", children: [(0, jsx_runtime_1.jsx)("span", { className: "flex h-7 w-7 items-center justify-center rounded-lg bg-[#F4F3F0] border border-[#E6E4DF] text-[#6B6862]", children: (0, jsx_runtime_1.jsx)(icons_1.SparklesIcon, { className: "h-4 w-4" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0", children: [(0, jsx_runtime_1.jsx)("div", { className: "truncate text-sm font-semibold tracking-tight text-[#1F1E1C]", children: title }), (0, jsx_runtime_1.jsx)("div", { className: "truncate text-xs leading-tight text-[#6B6862]", children: status })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex shrink-0 items-center gap-0.5", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: clearMessages, title: "Cu\u1ED9c tr\u00F2 chuy\u1EC7n m\u1EDBi", "aria-label": "Cu\u1ED9c tr\u00F2 chuy\u1EC7n m\u1EDBi", className: "flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: (0, jsx_runtime_1.jsx)(icons_1.NewChatIcon, { className: "h-4 w-4" }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setIsOpen(false), title: "Thu g\u1ECDn", "aria-label": "Thu g\u1ECDn", className: "flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: (0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-4 w-4" }) })] })] }), (0, jsx_runtime_1.jsx)("div", { ref: scrollRef, className: "flex-1 space-y-6 overflow-y-auto px-4 py-5", children: messages.map((msg) => {
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
                                return ((0, jsx_runtime_1.jsxs)("div", { className: "group flex flex-col items-end gap-1", children: [(0, jsx_runtime_1.jsx)("div", { className: "relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-xs bg-[#F4F3F0] border border-[#E6E4DF] px-3.5 py-2 text-sm leading-relaxed text-[#1F1E1C]", children: msg.content }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 pr-1 text-xs text-[#6B6862]", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => copyMessage(msg.id, msg.content), title: "Sao ch\u00E9p c\u00E2u h\u1ECFi", "aria-label": "Sao ch\u00E9p c\u00E2u h\u1ECFi", className: "flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: copiedId === msg.id ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3 w-3 text-[#3F7D58]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3 w-3" })) }), timeStr && (0, jsx_runtime_1.jsx)("span", { className: "text-[11px]", children: timeStr })] })] }, msg.id));
                            }
                            const awaitingConfirm = !isStreaming &&
                                isLast &&
                                (msg.content.includes("Xác nhận thực hiện") ||
                                    msg.content.includes("DRY-RUN PREVIEW"));
                            const awaitingLayerChoice = !isStreaming &&
                                isLast &&
                                msg.content.includes("Chọn layer cho bài học");
                            // Build step items
                            const stepItems = [];
                            toolCalls.forEach((tc, idx) => {
                                const toolKey = `${msg.id}-${idx}`;
                                stepItems.push({
                                    id: toolKey,
                                    label: (0, formatters_1.formatToolDisplayName)(tc.name),
                                    startedAt: tc.startedAt,
                                    endedAt: tc.endedAt,
                                    running: isLive && tc.endedAt === undefined,
                                    detail: tc.result,
                                });
                            });
                            if (showThinking && toolCalls.length === 0) {
                                stepItems.push({
                                    id: `${msg.id}-thinking`,
                                    label: "Đang suy nghĩ & soạn câu trả lời",
                                    startedAt: thinkingSince,
                                    running: true,
                                });
                            }
                            return ((0, jsx_runtime_1.jsxs)("div", { className: "group flex flex-col gap-2", children: [msg.content && ((0, jsx_runtime_1.jsx)("div", { className: "text-sm leading-relaxed text-[#1F1E1C] py-0.5", children: (0, jsx_runtime_1.jsx)(ChatMarkdown_1.ChatMarkdown, { content: msg.content, streaming: isLive, onRun: isLoading ? undefined : sendMessage }) })), stepItems.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "-mx-1", children: (0, jsx_runtime_1.jsx)(ToolStepRow_1.CollapsibleStepsSummary, { steps: stepItems, expandedTools: expandedTools, onToggleTool: toggleToolExpand, isLive: isLive }) })), awaitingConfirm && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 pt-1", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => sendMessage("ok"), disabled: isLoading, className: "flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer", children: [(0, jsx_runtime_1.jsx)(icons_1.CheckCircleIcon, { className: "h-3.5 w-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "X\u00E1c nh\u1EADn th\u1EF1c hi\u1EC7n" })] }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => sendMessage("hủy"), disabled: isLoading, className: "flex items-center gap-1.5 rounded-lg border border-[#E4E2DD] bg-[#F2F1EE] px-3 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#EAE8E3] disabled:opacity-50 cursor-pointer", children: [(0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-3.5 w-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "H\u1EE7y b\u1ECF" })] })] })), awaitingLayerChoice && ((0, jsx_runtime_1.jsx)(LayerChoicePicker_1.LayerChoicePicker, { onSend: sendMessage, disabled: isLoading })), msg.content && !isLive && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 pt-0.5 text-xs text-[#6B6862]", children: [timeStr && (0, jsx_runtime_1.jsx)("span", { className: "select-none text-[11px]", children: timeStr }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => copyMessage(msg.id, msg.content), title: "Sao ch\u00E9p", "aria-label": "Sao ch\u00E9p c\u00E2u tr\u1EA3 l\u1EDDi", className: "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer", children: copiedId === msg.id ? ((0, jsx_runtime_1.jsx)(icons_1.CheckIcon, { className: "h-3.5 w-3.5 text-[#3F7D58]" })) : ((0, jsx_runtime_1.jsx)(icons_1.CopyIcon, { className: "h-3.5 w-3.5" })) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleFeedback(msg.id, 1), title: "H\u1EEFu \u00EDch", "aria-label": "C\u00E2u tr\u1EA3 l\u1EDDi h\u1EEFu \u00EDch", "aria-pressed": feedback[msg.id] === 1, className: `flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] cursor-pointer ${feedback[msg.id] === 1
                                                    ? "text-[#1F1E1C] bg-[#F4F3F0]"
                                                    : "text-[#6B6862] hover:text-[#1F1E1C]"}`, children: (0, jsx_runtime_1.jsx)(icons_1.ThumbsUpIcon, { className: "h-3.5 w-3.5" }) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleFeedback(msg.id, 0), title: "Ch\u01B0a t\u1ED1t", "aria-label": "C\u00E2u tr\u1EA3 l\u1EDDi ch\u01B0a t\u1ED1t", "aria-pressed": feedback[msg.id] === 0, className: `flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] cursor-pointer ${feedback[msg.id] === 0
                                                    ? "text-[#B42318] bg-[#FBEDE5]"
                                                    : "text-[#6B6862] hover:text-[#1F1E1C]"}`, children: (0, jsx_runtime_1.jsx)(icons_1.ThumbsDownIcon, { className: "h-3.5 w-3.5" }) })] }))] }, msg.id));
                        }) }), (0, jsx_runtime_1.jsx)("div", { className: "p-3 border-t border-[#E6E4DF] bg-[#FFFFFF]", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 rounded-xl border border-[#E6E4DF] bg-[#F4F3F0] py-1.5 pl-3.5 pr-1.5 transition-all focus-within:border-[#C2410C] focus-within:ring-1 focus-within:ring-[#C2410C]/25", children: [(0, jsx_runtime_1.jsx)("input", { ref: inputRef, type: "text", value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: isLoading
                                        ? "AI đang phản hồi... Bạn có thể nhập tiếp"
                                        : "Nhập lệnh tạo, hỏi đáp bài học hoặc /plan...", className: "min-w-0 flex-1 bg-transparent text-sm text-[#1F1E1C] outline-none placeholder:text-[#6B6862]" }), showStop ? ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: stopStreaming, title: "D\u1EEBng ph\u1EA3n h\u1ED3i", "aria-label": "D\u1EEBng ph\u1EA3n h\u1ED3i", className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FBEDE5] text-[#B42318] border border-[#B42318]/20 transition-opacity hover:opacity-90 cursor-pointer", children: (0, jsx_runtime_1.jsx)(icons_1.StopIcon, { className: "h-3.5 w-3.5" }) })) : ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => handleSend(), disabled: !input.trim(), "aria-label": "Send message", className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C2410C] text-white font-medium transition-all hover:bg-[#9A3412] hover:scale-105 active:scale-95 disabled:bg-[#E6E4DF] disabled:text-[#6B6862] disabled:opacity-40 disabled:hover:scale-100 cursor-pointer", children: (0, jsx_runtime_1.jsx)(icons_1.ArrowUpIcon, { className: "h-4 w-4" }) }))] }) })] })), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setIsOpen(!isOpen), "aria-label": "Toggle Roadmap Assistant", className: "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFFFFF] text-[#1F1E1C] border border-[#E6E4DF] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] transition-all hover:bg-[#F4F3F0] hover:scale-105 active:scale-95 cursor-pointer", children: isOpen ? ((0, jsx_runtime_1.jsx)(icons_1.CloseIcon, { className: "h-5 w-5 text-[#6B6862]" })) : ((0, jsx_runtime_1.jsx)(icons_1.SparklesIcon, { className: "h-5 w-5 text-[#1F1E1C]" })) })] }));
}
