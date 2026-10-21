import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import type { ChatbotConfig } from "./types";
import { useRoadmapAssistantChat } from "./useRoadmapAssistantChat";
import {
  SparklesIcon,
  ArrowUpIcon,
  StopIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  CheckCircleIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  MoreVerticalIcon,
  NewChatIcon,
  ArrowDownIcon,
} from "./icons";
import { formatTime, formatToolDisplayName, toStepItems } from "./utils/formatters";
import { ChatMarkdown } from "./ChatMarkdown";
import { LayerChoicePicker } from "./LayerChoicePicker";
import { WELCOME_MESSAGE_ID } from "./welcome";
import { PulsatingDots } from "./components/PulsatingDots";
import { FeedbackReasonSheet } from "./components/FeedbackReasonSheet";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { useVisualViewportBox } from "./utils/useVisualViewportBox";
import { MessageList } from "./components/MessageList";
import { useFeedback, type VoteDetail } from "./useFeedback";
import { feedbackKey } from "./storage";

import { CollapsibleStepsSummary, StepItem } from "./ToolStepRow";

const WIDGET_THEME_VARS: React.CSSProperties = {
  colorScheme: "light",
  ...({
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
  } as React.CSSProperties),
};

export function RoadmapChatbotWidget({
  position = "bottom-right",
  offsetX = 24,
  offsetY = 24,
  zIndex = 9999,
  title = "Abot",
  subtitle = "Trợ lý kiến thức & lộ trình",
  baseUrl = "http://localhost:8000",
  initialOpen = false,
  initialMessages,
  onToolExecuted,
  onFeedback,
  getContext,
  onWebMcpMessage,
  className = "",
  conversationId: customConversationId,
  threadId,
  canWrite = false,
}: ChatbotConfig) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [copiedConvId, setCopiedConvId] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleLauncherMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // What the open reason sheet holds so far
  const [sheetDraft, setSheetDraft] = useState<VoteDetail>({});
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!feedbackNotice) return;
    const timer = setTimeout(() => setFeedbackNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [feedbackNotice]);

  // Votes show at once; the host only gets the last one (see useFeedback)
  const { votes: feedback, vote, commit } = useFeedback({
    storageKey: feedbackKey(baseUrl),
    send: async (msgId, value, detail) => {
      const traceId = messages.find((m) => m.id === msgId)?.traceId;
      await onFeedback?.(msgId, value, { traceId, ...detail });
    },
    onFailed: () => setFeedbackNotice("Chưa gửi được đánh giá, vui lòng thử lại."),
  });

  const handleFeedback = (msgId: string, val: 1 | 0) => {
    const isRemoving = feedback[msgId] === val;
    if (activeFeedbackMsgId === msgId) setActiveFeedbackMsgId(null);
    if (val === 1 || isRemoving) {
      vote(msgId, isRemoving ? null : val);
      return;
    }
    // 👎 is sent once the reason sheet closes, with the reason if one was given.
    // Another reply's open sheet is closed first: its 👎 is sent with what was picked or typed so far.
    if (activeFeedbackMsgId && activeFeedbackMsgId !== msgId) void commit(activeFeedbackMsgId, sheetDraft);
    setSheetDraft({});
    vote(msgId, 0, { defer: true });
    setActiveFeedbackMsgId(msgId);
  };

  const {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    activeTool,
    conversationId,
    sendMessage,
    stopStreaming,
    clearMessages,
    retry,
  } = useRoadmapAssistantChat({
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
  const keyboardBox = useVisualViewportBox(isOpen);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  // Snippet tapped to run; only that snippet's run button spins while the reply is loading
  const [runningCode, setRunningCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoading) setRunningCode(null);
  }, [isLoading]);
  const handleRunCode = useCallback(
    (code: string) => {
      if (isLoading) return;
      setRunningCode(code.trim());
      sendMessage(code);
    },
    [isLoading, sendMessage]
  );

  // Close container & options on click outside or Escape
  useEffect(() => {
    if (!isOpen && !isOptionsOpen) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (isOpen && containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
        setIsOptionsOpen(false);
      } else if (isOptionsOpen && optionsRef.current && !optionsRef.current.contains(target)) {
        setIsOptionsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
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

  const handleCopyConversationId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!conversationId) return;
    navigator.clipboard?.writeText(conversationId).then(
      () => {
        setCopiedConvId(true);
        setTimeout(() => {
          setCopiedConvId(false);
          setIsOptionsOpen(false);
        }, 1200);
      },
      () => {}
    );
  };

  const isAtBottomRef = useRef(true);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // "Stick to bottom": a 1px sentinel after the last message tells us whether the reader is
  // at the end. The browser reports only when that changes, so nothing runs while scrolling.
  // Within 80px of the end still counts as "at the bottom".
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!isOpen || !root || !sentinel || typeof IntersectionObserver === "undefined") return;
    const followObserver = new IntersectionObserver(
      ([entry]) => {
        isAtBottomRef.current = entry.isIntersecting;
      },
      { root, rootMargin: "0px 0px 80px 0px" }
    );
    followObserver.observe(sentinel);
    return () => followObserver.disconnect();
  }, [isOpen]);

  const scrollToBottom = () => {
    // Jump straight to the end, like Claude Code: no animated glide. The observer hides the
    // button once the sentinel is in view.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Follow new content while the reader is at the end. Layout effect: the jump happens before
  // paint, so the sentinel never leaves view mid-stream and the button doesn't flash.
  useLayoutEffect(() => {
    if (isOpen && scrollRef.current && isAtBottomRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isOpen, isStreaming, activeTool]);

  // Auto-focus on open or when generation completes (Desktop only >= 768px, avoid aggressive mobile keyboard jump)
  useEffect(() => {
    if (isOpen && typeof window !== "undefined" && window.innerWidth >= 768) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading]);

  // Reset the "copied" tick after a moment
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedId]);

  // Offsets and z-index come from props, so they cannot be static utility classes.
  const positionStyles: React.CSSProperties = useMemo(() => {
    const styles: React.CSSProperties = { position: "fixed", zIndex };
    const vertical = position.startsWith("top") ? "top" : "bottom";
    const horizontal = position.endsWith("left") ? "left" : "right";
    styles[vertical] = `${offsetY}px`;
    styles[horizontal] = `${offsetX}px`;
    return styles;
  }, [position, offsetX, offsetY, zIndex]);

  const toggleToolExpand = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSend = (textToSend?: string) => {
    if (isSendingRef.current) return;

    const val = (textToSend ?? input).trim();
    if (!val) return;

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessage = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopiedId(id),
      () => {}
    );
  };

  const status = activeTool
    ? formatToolDisplayName(activeTool)
    : isStreaming
      ? "Đang trả lời…"
      : subtitle;
  const showStop = isStreaming && !input.trim();

  return (
    <div
      style={positionStyles}
      className={`pointer-events-none flex flex-col font-sans ${
        position.endsWith("left") ? "items-start" : "items-end"
      } ${className}`}
    >
      {isOpen && (
        <div
          ref={containerRef}
          style={{ ...WIDGET_THEME_VARS, ...keyboardBox }}
          className="pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] animate-in fade-in duration-200 rounded-none border-0 md:relative md:inset-auto md:z-auto md:h-[720px] md:max-h-[calc(100vh-3rem)] md:w-[400px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[#E6E4DF] md:zoom-in-95"
        >
          {/* ── Header ── */}
          <ChatHeader
            canWrite={canWrite}
            clearMessages={clearMessages}
            copiedConvId={copiedConvId}
            handleCopyConversationId={handleCopyConversationId}
            isOptionsOpen={isOptionsOpen}
            optionsRef={optionsRef}
            setIsOpen={setIsOpen}
            setIsOptionsOpen={setIsOptionsOpen}
            status={status}
            title={title}
          />

          {/* ── Messages ── */}
          <MessageList
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            runningCode={runningCode}
            expandedTools={expandedTools}
            feedback={feedback}
            copiedId={copiedId}
            sendMessage={sendMessage}
            retry={retry}
            copyMessage={copyMessage}
            handleFeedback={handleFeedback}
            handleRunCode={handleRunCode}
            toggleToolExpand={toggleToolExpand}
            scrollRef={scrollRef}
            bottomSentinelRef={bottomSentinelRef}
            scrollToBottom={scrollToBottom}
          />

          {feedbackNotice && (
            <div
              role="status"
              className="mx-3 mb-1.5 rounded-md border border-[#B42318]/20 bg-[#FBEDE5] px-3 py-1.5 text-xs text-[#B42318]"
            >
              {feedbackNotice}
            </div>
          )}

          {/* ── Composer ── */}
          <ChatComposer
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            showStop={showStop}
            stopStreaming={stopStreaming}
            handleSend={handleSend}
            handleKeyDown={handleKeyDown}
          />

          {/* ── Feedback Reason Bottom Sheet ── */}
          {activeFeedbackMsgId && (
            <FeedbackReasonSheet
              // A fresh sheet per reply: one reply's draft never shows up on another
              key={activeFeedbackMsgId}
              messageId={activeFeedbackMsgId}
              onDraftChange={(reason, comment) => setSheetDraft({ reason, comment })}
              onSubmit={(reason, comment) => void commit(activeFeedbackMsgId, { reason, comment })}
              onClose={() => {
                // Closed without a reason (or after sending one): sends the 👎 if it is still waiting
                void commit(activeFeedbackMsgId);
                setActiveFeedbackMsgId(null);
              }}
            />
          )}
        </div>
      )}

      {/* ── Launcher (hidden while open: the panel takes its corner; header has a close button) ── */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Mở Abot"
          className="pointer-events-auto group flex h-11 items-center gap-2 rounded-full border border-white/25 bg-[#181A20] px-4 text-[14px] font-medium tracking-normal text-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:bg-[#22252D] hover:border-white/40 hover:scale-[1.03] active:scale-[0.97] select-none cursor-pointer"
        >
          {/* Minimal 4-point star icon sáng rõ */}
          <span className="flex items-center justify-center text-white/80 transition-colors group-hover:text-white">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </span>

          <span className="text-white/95 transition-colors group-hover:text-white">
            Ask AI
          </span>
        </button>
      )}
    </div>
  );
}
