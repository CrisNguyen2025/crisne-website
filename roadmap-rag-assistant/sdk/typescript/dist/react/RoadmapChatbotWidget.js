"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadmapChatbotWidget = RoadmapChatbotWidget;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const useRoadmapAssistantChat_1 = require("./useRoadmapAssistantChat");
const formatters_1 = require("./utils/formatters");
const FeedbackReasonSheet_1 = require("./components/FeedbackReasonSheet");
const ChatComposer_1 = require("./components/ChatComposer");
const ChatHeader_1 = require("./components/ChatHeader");
const useVisualViewportBox_1 = require("./utils/useVisualViewportBox");
const MessageList_1 = require("./components/MessageList");
const WIDGET_THEME_VARS = {
    colorScheme: "light",
    ...{
        "--bg": "#FFFFFF",
        "--surface": "#F4F3F0",
        "--border": "#E6E4DF",
        "--text": "#1F1E1C",
        "--text-muted": "#6B6862",
        "--accent": "#C2410C",
        "--accent-soft": "#FBEDE5",
        "--success": "#3F7D58",
        "--danger": "#B42318",
        "--background": "#FFFFFF",
        "--foreground": "#1F1E1C",
        "--muted-foreground": "#6B6862",
        "--card": "#F4F3F0",
        "--card-foreground": "#1F1E1C",
        "--popover": "#FFFFFF",
        "--popover-foreground": "#1F1E1C",
        "--input": "#F4F3F0",
        "--muted": "#F4F3F0",
        "--primary": "#C2410C",
        "--primary-foreground": "#FFFFFF",
    },
};
function RoadmapChatbotWidget({ position = "bottom-right", offsetX = 24, offsetY = 24, zIndex = 9999, title = "Abot", subtitle = "Trợ lý kiến thức & lộ trình", baseUrl = "http://localhost:8000", initialOpen = false, initialMessages, onToolExecuted, onFeedback, getContext, onWebMcpMessage, className = "", conversationId: customConversationId, threadId, canWrite = false, }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(initialOpen);
    const [isOptionsOpen, setIsOptionsOpen] = (0, react_1.useState)(false);
    const [copiedConvId, setCopiedConvId] = (0, react_1.useState)(false);
    const optionsRef = (0, react_1.useRef)(null);
    const [mousePos, setMousePos] = (0, react_1.useState)({ x: 0, y: 0 });
    const handleLauncherMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };
    const [expandedTools, setExpandedTools] = (0, react_1.useState)({});
    const [feedback, setFeedback] = (0, react_1.useState)({});
    const [activeFeedbackMsgId, setActiveFeedbackMsgId] = (0, react_1.useState)(null);
    const [copiedId, setCopiedId] = (0, react_1.useState)(null);
    const handleFeedback = (msgId, val) => {
        if (val === 1) {
            const isRemoving = feedback[msgId] === 1;
            setFeedback((prev) => {
                const next = { ...prev };
                if (isRemoving) {
                    delete next[msgId];
                }
                else {
                    next[msgId] = 1;
                }
                return next;
            });
            if (activeFeedbackMsgId === msgId) {
                setActiveFeedbackMsgId(null);
            }
            if (!isRemoving) {
                onFeedback?.(msgId, 1);
            }
        }
        else {
            const isRemoving = feedback[msgId] === 0;
            setFeedback((prev) => {
                const next = { ...prev };
                if (isRemoving) {
                    delete next[msgId];
                }
                else {
                    next[msgId] = 0;
                }
                return next;
            });
            if (isRemoving) {
                setActiveFeedbackMsgId(null);
            }
            else {
                onFeedback?.(msgId, 0);
                setActiveFeedbackMsgId(msgId);
            }
        }
    };
    const { messages, input, setInput, isLoading, isStreaming, activeTool, conversationId, sendMessage, stopStreaming, clearMessages, retry, } = (0, useRoadmapAssistantChat_1.useRoadmapAssistantChat)({
        baseUrl,
        threadId,
        conversationId: customConversationId,
        initialMessages,
        onToolExecuted,
        getContext,
        onWebMcpMessage,
        canWrite,
    });
    // Follows the on-screen keyboard on phones so the composer stays visible
    const keyboardBox = (0, useVisualViewportBox_1.useVisualViewportBox)(isOpen);
    const scrollRef = (0, react_1.useRef)(null);
    const inputRef = (0, react_1.useRef)(null);
    const containerRef = (0, react_1.useRef)(null);
    const isSendingRef = (0, react_1.useRef)(false);
    // Snippet tapped to run; only that snippet's run button spins while the reply is loading
    const [runningCode, setRunningCode] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        if (!isLoading)
            setRunningCode(null);
    }, [isLoading]);
    const handleRunCode = (0, react_1.useCallback)((code) => {
        if (isLoading)
            return;
        setRunningCode(code.trim());
        sendMessage(code);
    }, [isLoading, sendMessage]);
    // Close container & options on click outside or Escape
    (0, react_1.useEffect)(() => {
        if (!isOpen && !isOptionsOpen)
            return;
        const handleClick = (e) => {
            const target = e.target;
            if (isOpen && containerRef.current && !containerRef.current.contains(target)) {
                setIsOpen(false);
                setIsOptionsOpen(false);
            }
            else if (isOptionsOpen && optionsRef.current && !optionsRef.current.contains(target)) {
                setIsOptionsOpen(false);
            }
        };
        const handleKey = (e) => {
            if (e.key === "Escape") {
                setIsOpen(false);
                setIsOptionsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("touchstart", handleClick, { passive: true });
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("touchstart", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [isOpen, isOptionsOpen]);
    const handleCopyConversationId = (e) => {
        e.stopPropagation();
        if (!conversationId)
            return;
        navigator.clipboard?.writeText(conversationId).then(() => {
            setCopiedConvId(true);
            setTimeout(() => {
                setCopiedConvId(false);
                setIsOptionsOpen(false);
            }, 1200);
        }, () => { });
    };
    const isAtBottomRef = (0, react_1.useRef)(true);
    const bottomSentinelRef = (0, react_1.useRef)(null);
    const [showScrollBottom, setShowScrollBottom] = (0, react_1.useState)(false);
    // "Stick to bottom": a 1px sentinel after the last message tells us whether the reader is
    // at the end. The browser reports only when that changes, so nothing runs while scrolling.
    // Within 80px of the end still counts as "at the bottom".
    (0, react_1.useEffect)(() => {
        const root = scrollRef.current;
        const sentinel = bottomSentinelRef.current;
        if (!isOpen || !root || !sentinel || typeof IntersectionObserver === "undefined")
            return;
        const observer = new IntersectionObserver(([entry]) => {
            isAtBottomRef.current = entry.isIntersecting;
            setShowScrollBottom(!entry.isIntersecting);
        }, { root, rootMargin: "0px 0px 80px 0px" });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [isOpen]);
    const scrollToBottom = () => {
        // The observer flips "at bottom" and hides the button on arrival. Setting them here would
        // stick if the reader scrolls away mid-animation, since the sentinel never came into view.
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    };
    // Follow new content while the reader is at the end. Layout effect: the jump happens before
    // paint, so the sentinel never leaves view mid-stream and the button doesn't flash.
    (0, react_1.useLayoutEffect)(() => {
        if (isOpen && scrollRef.current && isAtBottomRef.current) {
            const el = scrollRef.current;
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, isOpen, isStreaming, activeTool]);
    // Auto-focus on open or when generation completes (Desktop only >= 768px, avoid aggressive mobile keyboard jump)
    (0, react_1.useEffect)(() => {
        if (isOpen && typeof window !== "undefined" && window.innerWidth >= 768) {
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
        isAtBottomRef.current = true;
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
    return ((0, jsx_runtime_1.jsxs)("div", { style: positionStyles, className: `pointer-events-none flex flex-col font-sans ${position.endsWith("left") ? "items-start" : "items-end"} ${className}`, children: [isOpen && ((0, jsx_runtime_1.jsxs)("div", { ref: containerRef, style: { ...WIDGET_THEME_VARS, ...keyboardBox }, className: "pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] animate-in fade-in duration-200 rounded-none border-0 md:relative md:inset-auto md:z-auto md:h-[720px] md:max-h-[calc(100vh-3rem)] md:w-[400px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[#E6E4DF] md:zoom-in-95", children: [(0, jsx_runtime_1.jsx)(ChatHeader_1.ChatHeader, { canWrite: canWrite, clearMessages: clearMessages, copiedConvId: copiedConvId, handleCopyConversationId: handleCopyConversationId, isOptionsOpen: isOptionsOpen, optionsRef: optionsRef, setIsOpen: setIsOpen, setIsOptionsOpen: setIsOptionsOpen, status: status, title: title }), (0, jsx_runtime_1.jsx)(MessageList_1.MessageList, { messages: messages, isLoading: isLoading, isStreaming: isStreaming, runningCode: runningCode, expandedTools: expandedTools, feedback: feedback, copiedId: copiedId, sendMessage: sendMessage, retry: retry, copyMessage: copyMessage, handleFeedback: handleFeedback, handleRunCode: handleRunCode, toggleToolExpand: toggleToolExpand, scrollRef: scrollRef, bottomSentinelRef: bottomSentinelRef, showScrollBottom: showScrollBottom, scrollToBottom: scrollToBottom }), (0, jsx_runtime_1.jsx)(ChatComposer_1.ChatComposer, { inputRef: inputRef, input: input, setInput: setInput, isLoading: isLoading, showStop: showStop, stopStreaming: stopStreaming, handleSend: handleSend, handleKeyDown: handleKeyDown }), activeFeedbackMsgId && ((0, jsx_runtime_1.jsx)(FeedbackReasonSheet_1.FeedbackReasonSheet, { messageId: activeFeedbackMsgId, onSubmit: (reason, comment) => {
                            const targetMsg = messages.find((m) => m.id === activeFeedbackMsgId);
                            const targetIdx = messages.findIndex((m) => m.id === activeFeedbackMsgId);
                            let userQuery = "";
                            if (targetIdx > 0) {
                                for (let i = targetIdx - 1; i >= 0; i--) {
                                    if (messages[i].role === "user") {
                                        userQuery = messages[i].content;
                                        break;
                                    }
                                }
                            }
                            onFeedback?.(activeFeedbackMsgId, 0, {
                                reason,
                                comment,
                                query: userQuery,
                                assistantMsg: targetMsg?.content,
                            });
                        }, onClose: () => setActiveFeedbackMsgId(null) }))] })), !isOpen && ((0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setIsOpen(!isOpen), "aria-label": "M\u1EDF Abot", className: "pointer-events-auto group flex h-11 items-center gap-2 rounded-full border border-white/25 bg-[#181A20] px-4 text-[14px] font-medium tracking-normal text-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:bg-[#22252D] hover:border-white/40 hover:scale-[1.03] active:scale-[0.97] select-none cursor-pointer", children: [(0, jsx_runtime_1.jsx)("span", { className: "flex items-center justify-center text-white/80 transition-colors group-hover:text-white", children: (0, jsx_runtime_1.jsx)("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", children: (0, jsx_runtime_1.jsx)("path", { d: "M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" }) }) }), (0, jsx_runtime_1.jsx)("span", { className: "text-white/95 transition-colors group-hover:text-white", children: "Ask AI" })] }))] }));
}
