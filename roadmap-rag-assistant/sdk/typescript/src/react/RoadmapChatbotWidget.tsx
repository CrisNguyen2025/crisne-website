import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import type { ChatbotConfig } from "./types";
import { useRoadmapAssistantChat } from "./useRoadmapAssistantChat";
import { SparklesIcon } from "./icons";
import { formatTime } from "./utils/formatters";
import { FeedbackReasonSheet } from "./components/FeedbackReasonSheet";
import { ContextUsageSheet } from "./components/ContextUsageSheet";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { useVisualViewportBox } from "./utils/useVisualViewportBox";
import { copyText } from "./utils/clipboard";
import { useDrawerMotion } from "./utils/useDrawerMotion";
import { MessageList } from "./components/MessageList";
import { useFeedback, type VoteDetail } from "./useFeedback";
import { feedbackKey } from "./storage";
import { WIDGET_THEME_VARS } from "./tokens";

export function RoadmapChatbotWidget({
  position = "bottom-right",
  offsetX = 24,
  offsetY = 24,
  zIndex = 9999,
  title = "Abot",
  subtitle = "Trợ lý kiến thức cá nhân",
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
  const [isContextOpen, setIsContextOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState<string | null>(
    null
  );
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
  const {
    votes: feedback,
    vote,
    commit,
  } = useFeedback({
    storageKey: feedbackKey(baseUrl),
    send: async (msgId, value, detail) => {
      const traceId = messages.find((m) => m.id === msgId)?.traceId;
      await onFeedback?.(msgId, value, { traceId, ...detail });
    },
    onFailed: () =>
      setFeedbackNotice("Chưa gửi được đánh giá, vui lòng thử lại."),
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
    if (activeFeedbackMsgId && activeFeedbackMsgId !== msgId)
      void commit(activeFeedbackMsgId, sheetDraft);
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
    conversationContext,
    refreshContext,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  // Phones: the panel slides in from the right and closes by swiping right. A feedback sheet
  // open at the bottom keeps the gesture off, so a swipe can't dismiss a half-written reason.
  const dismiss = useCallback(() => {
    setIsOpen(false);
    setIsOptionsOpen(false);
  }, []);
  const { close: animateClose } = useDrawerMotion(
    containerRef,
    scrimRef,
    isOpen && !activeFeedbackMsgId,
    dismiss
  );
  const closeDrawer = useCallback(
    () => animateClose(dismiss),
    [animateClose, dismiss]
  );
  const isSendingRef = useRef(false);

  // Snippet tapped to run; only that snippet's run button spins while the reply is loading
  const [runningCode, setRunningCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setRunningCode(null), 0);
      return () => clearTimeout(timer);
    }
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
      // The scrim has its own click handler, which closes with the slide-out animation
      if (scrimRef.current?.contains(target)) return;
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        closeDrawer();
      } else if (
        isOptionsOpen &&
        optionsRef.current &&
        !optionsRef.current.contains(target)
      ) {
        setIsOptionsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
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
  }, [isOpen, isOptionsOpen, closeDrawer]);

  const handleCopyConversationId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!conversationId) return;
    void copyText(conversationId).then((ok) => {
      if (!ok) return;
      setCopiedConvId(true);
      setTimeout(() => {
        setCopiedConvId(false);
        setIsOptionsOpen(false);
      }, 1200);
    });
  };

  const isAtBottomRef = useRef(true);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // "Stick to bottom": a 1px sentinel after the last message tells us whether the reader is
  // at the end. The browser reports only when that changes, so nothing runs while scrolling.
  // Within 80px of the end still counts as "at the bottom".
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (
      !isOpen ||
      !root ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    // Only ever turns follow on here. Content growing below pushes the sentinel out of view for a
    // frame; turning follow off on that would stop the lerp for good. Follow is turned off only by
    // the user scrolling up (wheel/touch handlers below).
    const followObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) isAtBottomRef.current = true;
      },
      { root, rootMargin: "0px 0px 80px 0px" }
    );
    followObserver.observe(sentinel);
    return () => followObserver.disconnect();
  }, [isOpen]);

  const rafIdRef = useRef<number | null>(null);

  // Jump straight to the end on open
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isOpen]);

  // Cancel lerp when user manually scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (!isOpen || !el) return;

    let touchStartY = 0;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        isAtBottomRef.current = false;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY > 10) {
        // Dragging down scrolls content up
        isAtBottomRef.current = false;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isOpen]);

  const scrollToBottom = () => {
    // Jump straight to the end, like Claude Code: no animated glide. The observer hides the
    // button once the sentinel is in view.
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      isAtBottomRef.current = true;
    }
  };

  // Follow new content while the reader is at the end. Lerp over ~150-180ms so new elements
  // (like 50px snippet cards) slide into view smoothly instead of snapping in a single frame.
  useEffect(() => {
    if (!isOpen || !scrollRef.current || !isAtBottomRef.current) return;

    const el = scrollRef.current;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= el.scrollTop) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      el.scrollTop = maxScroll;
      return;
    }

    if (rafIdRef.current !== null) return;

    let lastTime = performance.now();
    const tick = (now: number) => {
      const container = scrollRef.current;
      if (!container || !isAtBottomRef.current) {
        rafIdRef.current = null;
        return;
      }
      const target = container.scrollHeight - container.clientHeight;
      const curr = container.scrollTop;
      const dist = target - curr;

      if (dist <= 0.5) {
        container.scrollTop = target;
        rafIdRef.current = null;
        return;
      }

      const dt = Math.min(now - lastTime, 100);
      lastTime = now;

      // Exponential damping towards target (settles ~95% in ~160ms, tau = 55ms)
      const factor = 1 - Math.exp(-dt / 55);
      const step = Math.max(1, dist * factor);
      container.scrollTop = Math.min(target, curr + step);

      if (container.scrollTop < target && isAtBottomRef.current) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [messages, isOpen, isStreaming, activeTool]);

  // When reply finishes streaming, guarantee the message list cleanly glides
  // all the way to the true bottom so late-mounted elements (action toolbar, citations)
  // never leave the view stranded ~118px above the end.
  useEffect(() => {
    if (!isOpen || isStreaming || !isAtBottomRef.current) return;

    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container || !isAtBottomRef.current) return;

      const max = container.scrollHeight - container.clientHeight;
      if (max <= container.scrollTop) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      let lastTime = performance.now();
      const settleTick = (now: number) => {
        const el = scrollRef.current;
        if (!el || !isAtBottomRef.current) {
          rafIdRef.current = null;
          return;
        }
        const target = el.scrollHeight - el.clientHeight;
        const curr = el.scrollTop;
        const dist = target - curr;

        if (dist <= 0.5) {
          el.scrollTop = target;
          rafIdRef.current = null;
          return;
        }

        const dt = Math.min(now - lastTime, 100);
        lastTime = now;
        const factor = 1 - Math.exp(-dt / 55);
        const step = Math.max(1, dist * factor);
        el.scrollTop = Math.min(target, curr + step);

        if (el.scrollTop < target && isAtBottomRef.current) {
          rafIdRef.current = requestAnimationFrame(settleTick);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(settleTick);
    });

    return () => cancelAnimationFrame(frame);
  }, [isStreaming, isOpen, messages]);

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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    sendMessage(val);

    // 4. Re-ensure focus on next animation frame
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessage = (id: string, text: string) => {
    void copyText(text).then((ok) => {
      if (ok) setCopiedId(id);
    });
  };

  // The header line stays the fixed subtitle while answering; the streaming state shows in the
  // message itself, not in the header.
  const status = subtitle;
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
          ref={scrimRef}
          aria-hidden="true"
          onClick={closeDrawer}
          className="pointer-events-auto fixed inset-0 z-40 bg-black/40 opacity-100 animate-in fade-in duration-300 motion-reduce:animate-none md:hidden"
        />
      )}
      {isOpen && (
        <div
          ref={containerRef}
          style={{ ...WIDGET_THEME_VARS, ...keyboardBox }}
          className="pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] max-md:shadow-[-8px_0_28px_rgba(0,0,0,0.15)] animate-in fade-in duration-200 max-md:slide-in-from-right max-md:duration-300 motion-reduce:animate-none rounded-none border-0 md:relative md:inset-auto md:z-auto md:h-[720px] md:max-h-[calc(100vh-3rem)] md:w-[400px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[#E6E4DF] md:zoom-in-95"
        >
          {/* ── Header ── */}
          <ChatHeader
            canWrite={canWrite}
            clearMessages={clearMessages}
            copiedConvId={copiedConvId}
            openContext={() => {
              setIsContextOpen(true);
              void refreshContext();
            }}
            handleCopyConversationId={handleCopyConversationId}
            isOptionsOpen={isOptionsOpen}
            optionsRef={optionsRef}
            setIsOpen={closeDrawer}
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
            canWrite={canWrite}
            showFeedback={Boolean(onFeedback)}
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
            isKeyboardOpen={
              typeof keyboardBox?.height === "number" &&
              typeof window !== "undefined" &&
              window.innerHeight - keyboardBox.height > 100
            }
          />

          {/* ── Context Bottom Sheet ── */}
          {isContextOpen && (
            <ContextUsageSheet
              context={conversationContext}
              onRetry={() => void refreshContext()}
              onClose={() => setIsContextOpen(false)}
            />
          )}

          {/* ── Feedback Reason Bottom Sheet ── */}
          {activeFeedbackMsgId && (
            <FeedbackReasonSheet
              // A fresh sheet per reply: one reply's draft never shows up on another
              key={activeFeedbackMsgId}
              messageId={activeFeedbackMsgId}
              onDraftChange={(reason, comment) =>
                setSheetDraft({ reason, comment })
              }
              onSubmit={(reason, comment) =>
                void commit(activeFeedbackMsgId, { reason, comment })
              }
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
            <SparklesIcon className="h-4 w-4" />
          </span>

          <span className="text-white/95 transition-colors group-hover:text-white">
            Abot
          </span>
        </button>
      )}
    </div>
  );
}

export { formatTime };
