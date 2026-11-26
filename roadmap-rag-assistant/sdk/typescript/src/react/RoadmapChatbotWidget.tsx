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
import { OwnerMemorySheet } from "./components/OwnerMemorySheet";
import { ThreadHistorySheet } from "./components/ThreadHistorySheet";
import { usePendingMemoryCount } from "./useOwnerMemories";
import { useThreadHistory } from "./useThreadHistory";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { AbotMascot, type MascotState } from "./components/AbotMascot";
import { useVisualViewportBox } from "./utils/useVisualViewportBox";
import { copyText } from "./utils/clipboard";
import { useDrawerMotion } from "./utils/useDrawerMotion";
import { useHeaderFlip } from "./utils/useHeaderFlip";
import { useDesktopPanelHeight } from "./utils/useDesktopPanelHeight";
import { useSidebarLayout } from "./utils/useSidebarLayout";
import { useSidebarWidth } from "./utils/useSidebarWidth";
import { useWidgetDismiss } from "./utils/useWidgetDismiss";
import { useChatAutoScroll } from "./utils/useChatAutoScroll";
import { DesktopResizeHandle } from "./components/DesktopResizeHandle";
import { WELCOME_MESSAGE_ID } from "./welcome";
import { MessageList } from "./components/MessageList";
import { useFeedback, type VoteDetail } from "./useFeedback";
import {
  feedbackKey,
  loadOpenState,
  openStateKey,
  saveOpenState,
} from "./storage";
import { WIDGET_THEME_VARS } from "./tokens";
import { ChatNavigationContext } from "./utils/navigation";
import { useActiveContextRef } from "./utils/pageContextRef";

export function RoadmapChatbotWidget({
  position = "bottom-right",
  offsetX = 24,
  offsetY = 24,
  zIndex = 9999,
  title = "Abot",
  subtitle = "Trợ lý kiến thức cá nhân",
  baseUrl = "http://localhost:8000",
  initialOpen = false,
  defaultViewMode = "floating",
  initialMessages,
  onToolExecuted,
  onNotify,
  onNavigate,
  onFeedback,
  getContext,
  routeKey,
  onWebMcpMessage,
  className = "",
  conversationId: customConversationId,
  threadId,
  canWrite = false,
  restoreLatestThread = false,
}: ChatbotConfig) {
  const openStorageKey = openStateKey(baseUrl);
  const [isOpen, setIsOpenState] = useState<boolean>(
    () => loadOpenState(openStorageKey) ?? initialOpen
  );
  const setIsOpen = useCallback(
    (open: boolean) => {
      setIsOpenState(open);
      saveOpenState(openStorageKey, open);
    },
    [openStorageKey]
  );
  const [isHovered, setIsHovered] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isSwitchMenuOpen, setIsSwitchMenuOpen] = useState(false);
  const [copiedConvId, setCopiedConvId] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSwitchingThread, setIsSwitchingThread] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const switchMenuRef = useRef<HTMLDivElement>(null);
  const { viewMode, setViewMode, isSidebarActive } = useSidebarLayout(baseUrl, defaultViewMode, isOpen);
  const { pageContext: activePageContext, contextRef: activeContextRef } = useActiveContextRef(getContext, isOpen, routeKey);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
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
    switchToThread,
    handleThreadDeleted,
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
    restoreLatestThread,
  });

  const [memorySuggestionBanner, setMemorySuggestionBanner] = useState<number | null>(null);
  const isMemoryOpenRef = useRef(isMemoryOpen);
  useEffect(() => {
    isMemoryOpenRef.current = isMemoryOpen;
  }, [isMemoryOpen]);
  const [pendingMemoryCount, setPendingMemoryCount] = usePendingMemoryCount(
    baseUrl,
    canWrite && restoreLatestThread && isOpen,
    isStreaming,
    {
      onPendingIncrease: (nextCount) => {
        if (!isMemoryOpenRef.current) {
          setMemorySuggestionBanner(nextCount);
        }
      },
    }
  );
  const {
    threads: historyThreads,
    query: historyQuery,
    setQuery: setHistoryQuery,
    isLoading: isHistoryLoading,
    isSearching: isHistorySearching,
    error: historyError,
    deletingId: deletingHistoryId,
    refresh: refreshHistory,
    removeThread: removeHistoryThread,
  } = useThreadHistory({
    baseUrl,
    isOpen: isOpen && isHistoryOpen,
    enabled: canWrite,
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
    setIsSwitchMenuOpen(false);
    setIsContextOpen(false);
    setIsMemoryOpen(false);
    setIsHistoryOpen(false);
  }, [setIsOpen]);
  const { close: animateClose } = useDrawerMotion(
    containerRef,
    scrimRef,
    isOpen && !activeFeedbackMsgId && !isMemoryOpen && !isContextOpen && !isHistoryOpen,
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

  useWidgetDismiss({
    isOpen,
    isOptionsOpen,
    isSwitchMenuOpen,
    viewMode,
    containerRef,
    scrimRef,
    optionsRef,
    switchMenuRef,
    closeDrawer,
    setIsOptionsOpen,
    setIsSwitchMenuOpen,
  });

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

  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  const isInitStage =
    messages.length === 1 && messages[0]?.id === WELCOME_MESSAGE_ID;
  const canNewChat = messages.length > 0 && !isInitStage;

  const { isAtBottomRef, autoFollowRef, scrollToBottom, disengageFollow } =
    useChatAutoScroll({
      isOpen,
      isStreaming,
      activeTool,
      messages,
      scrollRef,
      bottomSentinelRef,
      isResizingRef,
    });

  const handlePanelResize = useCallback(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isAtBottomRef]);

  const resizeHandleProps = useDesktopPanelHeight({
    isOpen: isOpen && viewMode === "floating",
    offsetY,
    position,
    containerRef,
    onResize: handlePanelResize,
  });

  const sidebarWidthProps = useSidebarWidth({
    isSidebarActive,
    baseUrl,
    containerRef,
    onResize: handlePanelResize,
  });

  useEffect(() => {
    isResizingRef.current =
      resizeHandleProps.isDragging || sidebarWidthProps.isDragging;
  }, [resizeHandleProps.isDragging, sidebarWidthProps.isDragging]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window.requestAnimationFrame !== "function") {
      handlePanelResize();
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      handlePanelResize();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, viewMode, handlePanelResize]);

  // Auto-focus on open or when generation completes (Desktop only >= 768px, avoid aggressive mobile keyboard jump)
  useEffect(() => {
    if (
      isOpen &&
      !isMemoryOpen &&
      !isHistoryOpen &&
      !isContextOpen &&
      typeof window !== "undefined" &&
      window.innerWidth >= 768
    ) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading, isMemoryOpen, isHistoryOpen, isContextOpen]);

  // Reset the "copied" tick after a moment
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedId]);

  // Offsets and z-index come from props, so they cannot be static utility classes.
  const positionStyles: React.CSSProperties = useMemo(() => {
    if (isSidebarActive) {
      return { position: "fixed", zIndex, top: 0, right: 0, bottom: 0 };
    }
    const styles: React.CSSProperties = { position: "fixed", zIndex };
    const vertical = position.startsWith("top") ? "top" : "bottom";
    const horizontal = position.endsWith("left") ? "left" : "right";
    styles[vertical] = `${offsetY}px`;
    styles[horizontal] = `${offsetX}px`;
    return styles;
  }, [isSidebarActive, position, offsetX, offsetY, zIndex]);

  const {
    headerMascotRef,
    headerTextRef,
    heroMascotRef,
    heroTextRef,
    heroChipsRef,
    captureBeforeSend,
    captureBeforeReset,
  } = useHeaderFlip(isInitStage, scrollRef);

  const handleNewChat = useCallback(() => {
    captureBeforeReset();
    clearMessages();
  }, [captureBeforeReset, clearMessages]);

  const closeHistorySheet = useCallback(() => {
    setIsHistoryOpen(false);
    setHistoryQuery("");
  }, [setHistoryQuery]);

  const notify = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      if (onNotify) {
        onNotify(message, type);
      } else if (type === "error") {
        setFeedbackNotice(message);
      }
    },
    [onNotify]
  );

  const handleSelectHistoryThread = useCallback(
    async (selectedId: string): Promise<boolean> => {
      if (selectedId === conversationId) {
        return true;
      }
      setIsSwitchingThread(true);
      try {
        const ok = await switchToThread(selectedId);
        if (!ok) {
          notify("Chưa mở được cuộc trò chuyện.", "error");
          return false;
        }
        isAtBottomRef.current = true;
        autoFollowRef.current = true;
        return true;
      } catch (err: unknown) {
        notify(
          err instanceof Error ? err.message : "Chưa mở được cuộc trò chuyện.",
          "error"
        );
        return false;
      } finally {
        setIsSwitchingThread(false);
      }
    },
    [conversationId, switchToThread, isAtBottomRef, autoFollowRef, notify]
  );

  const handleDeleteHistoryThread = useCallback(
    async (deletedId: string): Promise<boolean> => {
      const ok = await removeHistoryThread(deletedId);
      if (ok) {
        handleThreadDeleted(deletedId);
        notify("Đã xoá cuộc trò chuyện", "success");
      } else {
        notify("Chưa xoá được cuộc trò chuyện.", "error");
      }
      return ok;
    },
    [removeHistoryThread, handleThreadDeleted, notify]
  );

  const toggleToolExpand = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSend = (
    textToSend?: string,
    options?: { titles?: string[]; target?: { topic?: string; section?: string } }
  ) => {
    if (isSendingRef.current) return;

    const val = (textToSend ?? input).trim();
    if (!val) return;

    isSendingRef.current = true;
    setTimeout(() => {
      isSendingRef.current = false;
    }, 400);

    captureBeforeSend();

    // 1. Immediately wipe both React state and DOM value
    setInput("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    // 2. Keep input focused immediately
    inputRef.current?.focus();

    isAtBottomRef.current = true;
    autoFollowRef.current = true;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    sendMessage(val, options);

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
  const lastMsg = messages[messages.length - 1];
  const activityState: MascotState = isStreaming
    ? "speaking"
    : isLoading || Boolean(activeTool)
      ? "thinking"
      : lastMsg?.status === "error"
        ? "error"
        : "idle";

  return (
    <ChatNavigationContext.Provider value={onNavigate}>
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
          data-abot-overlay-root=""
          data-abot-view-mode={viewMode}
          style={{ ...WIDGET_THEME_VARS, ...keyboardBox }}
          className={`pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#FFFFFF] text-[#1F1E1C] max-md:shadow-[-8px_0_28px_rgba(0,0,0,0.15)] transition-none animate-in fade-in animation-duration-200 max-md:slide-in-from-right max-md:animation-duration-300 motion-reduce:animate-none rounded-none border-0 md:relative md:inset-auto md:z-auto md:w-[25rem] ${
            viewMode === "sidebar"
              ? "md:h-dvh md:max-h-dvh md:max-w-none md:rounded-none md:border-l md:border-[#E6E4DF] md:shadow-none"
              : "md:h-[40.625rem] md:max-h-[calc(100dvh-3rem)] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[#E6E4DF] md:shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] md:zoom-in-95"
          }`}
        >
          {viewMode === "floating" && !position.startsWith("top") && (
            <DesktopResizeHandle edge="top" {...resizeHandleProps} />
          )}
          {viewMode === "sidebar" && (
            <DesktopResizeHandle edge="left" {...sidebarWidthProps} />
          )}

          <ChatHeader
            activityState={activityState}
            canNewChat={canNewChat}
            canWrite={canWrite}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            clearMessages={handleNewChat}
            copiedConvId={copiedConvId}
            hideBrand={isInitStage}
            mascotRef={headerMascotRef}
            textRef={headerTextRef}
            openContext={() => { setIsMemoryOpen(false); setIsHistoryOpen(false); setIsContextOpen(true); void refreshContext(); }}
            openMemory={canWrite ? () => { setIsContextOpen(false); setIsHistoryOpen(false); setIsMemoryOpen(true); } : undefined}
            openHistory={canWrite ? () => { setIsContextOpen(false); setIsMemoryOpen(false); setIsHistoryOpen(true); } : undefined}
            pendingMemoryCount={canWrite ? pendingMemoryCount : 0}
            handleCopyConversationId={handleCopyConversationId}
            isOptionsOpen={isOptionsOpen}
            isSwitchMenuOpen={isSwitchMenuOpen}
            optionsRef={optionsRef}
            switchMenuRef={switchMenuRef}
            setIsOpen={closeDrawer}
            setIsOptionsOpen={setIsOptionsOpen}
            setIsSwitchMenuOpen={setIsSwitchMenuOpen}
            status={status}
            title={title}
          />

          <MessageList
            activityState={activityState}
            title={title}
            viewMode={viewMode}
            heroMascotRef={heroMascotRef}
            heroTextRef={heroTextRef}
            heroChipsRef={heroChipsRef}
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            runningCode={runningCode}
            expandedTools={expandedTools}
            feedback={feedback}
            copiedId={copiedId}
            canWrite={canWrite}
            showFeedback={Boolean(onFeedback)}
            sendMessage={handleSend}
            retry={retry}
            copyMessage={copyMessage}
            handleFeedback={handleFeedback}
            handleRunCode={handleRunCode}
            toggleToolExpand={toggleToolExpand}
            scrollRef={scrollRef}
            bottomSentinelRef={bottomSentinelRef}
            autoFollowRef={autoFollowRef}
            scrollToBottom={scrollToBottom}
            onBeforeJump={disengageFollow}
            conversationKey={conversationId}
            isTransitioning={isSwitchingThread}
          />

          {feedbackNotice && (
            <div
              role="status"
              className="mx-3 mb-1.5 rounded-md border border-[#B42318]/20 bg-[#FBEDE5] px-3 py-1.5 text-xs text-[#B42318]"
            >
              {feedbackNotice}
            </div>
          )}

          {canWrite && memorySuggestionBanner !== null && pendingMemoryCount > 0 && !isMemoryOpen && (
            <div
              role="status"
              className="mx-3 mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-[#E6E4DF] bg-[#FAF9F7] px-2.5 py-1.5 text-[0.6875rem] text-[#1F1E1C]"
            >
              <span className="truncate">
                Abot vừa rút ra gợi ý bộ nhớ mới ({memorySuggestionBanner} đang chờ duyệt)
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMemorySuggestionBanner(null);
                    setIsMemoryOpen(true);
                  }}
                  className="cursor-pointer rounded bg-[#1F1E1C] px-2 py-0.5 font-medium text-white hover:opacity-90"
                >
                  Xem & duyệt
                </button>
                <button
                  type="button"
                  aria-label="Đóng thông báo gợi ý bộ nhớ"
                  onClick={() => setMemorySuggestionBanner(null)}
                  className="cursor-pointer text-[#5E5B55] hover:text-[#1F1E1C]"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          <ChatComposer
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            showStop={showStop}
            stopStreaming={stopStreaming}
            handleSend={handleSend}
            handleKeyDown={handleKeyDown}
            contextRef={activeContextRef}
            isKeyboardOpen={
              typeof keyboardBox?.height === "number" &&
              typeof window !== "undefined" &&
              window.innerHeight - keyboardBox.height > 100
            }
          />

          {viewMode === "floating" && position.startsWith("top") && (
            <DesktopResizeHandle edge="bottom" {...resizeHandleProps} />
          )}

          {/* ── Context Bottom Sheet ── */}
          {isContextOpen && (
            <ContextUsageSheet
              context={conversationContext}
              contextRef={activeContextRef}
              onRetry={() => void refreshContext()}
              onClose={() => setIsContextOpen(false)}
            />
          )}

          {/* ── Owner Memory Bottom Sheet (Owner-only, ADR-0015) ── */}
          {canWrite && isMemoryOpen && (
            <OwnerMemorySheet baseUrl={baseUrl} currentTopicSlug={activePageContext?.roadmapSlug ?? getContext?.()?.roadmapSlug} onPendingCountChange={setPendingMemoryCount} onClose={() => setIsMemoryOpen(false)} />
          )}

          {/* ── Thread History Bottom Sheet (Owner-only, ADR-0012) ── */}
          {canWrite && isHistoryOpen && (
            <ThreadHistorySheet
              threads={historyThreads}
              query={historyQuery}
              onQueryChange={setHistoryQuery}
              isLoading={isHistoryLoading}
              isSearching={isHistorySearching}
              error={historyError}
              deletingId={deletingHistoryId}
              currentThreadId={conversationId}
              onRetry={() => void refreshHistory()}
              onSelectThread={handleSelectHistoryThread}
              onDeleteThread={handleDeleteHistoryThread}
              onClose={closeHistorySheet}
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
          onClick={() => {
            setIsHovered(false);
            setIsOpen(true);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label="Mở Abot"
          className="pointer-events-auto group flex h-11 items-center gap-2 rounded-full border border-white/25 bg-[#181A20] pl-2.5 pr-4 text-[14px] font-medium tracking-normal text-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:bg-[#22252D] hover:border-white/40 hover:scale-[1.03] active:scale-[0.97] select-none cursor-pointer"
        >
          <AbotMascot
            size={30}
            state={isHovered ? "happy" : activityState}
          />

          <span className="text-white/95 transition-colors group-hover:text-white">
            Abot
          </span>

          <SparklesIcon className="h-3.5 w-3.5 text-[#8BB5D9]/80 transition-transform duration-300 group-hover:rotate-12 group-hover:text-[#C4E4FF]" />
        </button>
      )}
      </div>
    </ChatNavigationContext.Provider>
  );
}

export { formatTime };
