import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ChatbotConfig } from "./types";
import { useRoadmapAssistantChat } from "./useRoadmapAssistantChat";
import {
  SparklesIcon,
  ArrowUpIcon,
  StopIcon,
  NewChatIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  CheckCircleIcon,
} from "./icons";
import { formatTime, formatToolDisplayName } from "./utils/formatters";
import { ChatMarkdown } from "./ChatMarkdown";
import { ToolStepRow } from "./ToolStepRow";

const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function RoadmapChatbotWidget({
  position = "bottom-right",
  offsetX = 24,
  offsetY = 24,
  zIndex = 9999,
  title = "Roadmap Assistant",
  subtitle = "AI Knowledge & Roadmap Agent",
  baseUrl = "http://localhost:8000",
  initialOpen = false,
  initialMessages,
  onToolExecuted,
  getContext,
  onWebMcpMessage,
  className = "",
}: ChatbotConfig) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    activeTool,
    sendMessage,
    stopStreaming,
    clearMessages,
  } = useRoadmapAssistantChat({
    baseUrl,
    initialMessages,
    onToolExecuted,
    getContext,
    onWebMcpMessage,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  // Click outside to close smoothly
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
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

  // Auto-scroll
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isOpen, isStreaming, activeTool]);

  // Auto-focus on open or when generation completes
  useEffect(() => {
    if (isOpen) {
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
          className="pointer-events-auto mb-3 flex h-[600px] max-h-[80vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/95 text-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 dark:ring-white/10"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SparklesIcon className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium leading-tight">
                  {title}
                </div>
                <div className="truncate text-xs leading-tight text-muted-foreground">
                  {status}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={clearMessages}
                title="Cuộc trò chuyện mới"
                aria-label="Cuộc trò chuyện mới"
                className={ICON_BUTTON}
              >
                <NewChatIcon />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu gọn"
                aria-label="Thu gọn"
                className={ICON_BUTTON}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-6 overflow-y-auto px-4 py-5"
          >
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const timeStr = formatTime(msg.timestamp);
              const isLast = msg.id === messages[messages.length - 1]?.id;
              const isLive = !isUser && isStreaming && isLast;
              const toolCalls = msg.toolCalls ?? [];
              const toolRunning = toolCalls.some(
                (tc) => tc.endedAt === undefined && isLive
              );
              // Waiting for the model after tools finished (or before any tool started).
              const showThinking = isLive && !msg.content && !toolRunning;
              const thinkingSince =
                toolCalls[toolCalls.length - 1]?.endedAt ??
                new Date(msg.timestamp).getTime();

              if (isUser) {
                return (
                  <div
                    key={msg.id}
                    className="group flex flex-col items-end gap-1"
                  >
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3.5 py-2 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                    {timeStr && (
                      <span className="pr-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        {timeStr}
                      </span>
                    )}
                  </div>
                );
              }

              const awaitingConfirm =
                !isStreaming &&
                isLast &&
                (msg.content.includes("Xác nhận thực hiện") ||
                  msg.content.includes("DRY-RUN PREVIEW"));

              return (
                <div key={msg.id} className="group flex flex-col gap-2">
                  {/* Step list (tool calls + thinking), above the answer */}
                  {(toolCalls.length > 0 ||
                    showThinking ||
                    msg.firstTokenAt !== undefined) && (
                    <div className="-mx-1.5 space-y-0.5">
                      {toolCalls.map((tc, idx) => {
                        const toolKey = `${msg.id}-${idx}`;
                        return (
                          <ToolStepRow
                            key={toolKey}
                            label={formatToolDisplayName(tc.name)}
                            startedAt={tc.startedAt}
                            endedAt={tc.endedAt}
                            running={isLive && tc.endedAt === undefined}
                            detail={tc.result}
                            expanded={!!expandedTools[toolKey]}
                            onToggle={() => toggleToolExpand(toolKey)}
                          />
                        );
                      })}
                      {showThinking && (
                        <ToolStepRow
                          label="Đang soạn câu trả lời"
                          startedAt={thinkingSince}
                          running
                        />
                      )}
                      {!showThinking && msg.firstTokenAt !== undefined && (
                        <ToolStepRow
                          label="Soạn câu trả lời"
                          startedAt={thinkingSince}
                          endedAt={msg.firstTokenAt}
                          running={false}
                        />
                      )}
                    </div>
                  )}

                  {msg.content && (
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3.5 shadow-xs transition-colors">
                      <ChatMarkdown content={msg.content} streaming={isLive} />
                    </div>
                  )}

                  {/* Confirmation for destructive actions (dry-run preview) */}
                  {awaitingConfirm && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => sendMessage("ok")}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        <span>Xác nhận thực hiện</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => sendMessage("hủy")}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                        <span>Hủy bỏ</span>
                      </button>
                    </div>
                  )}

                  {/* Copy + time, revealed on hover once the answer is complete */}
                  {msg.content && !isLive && (
                    <div className="-ml-1.5 flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => copyMessage(msg.id, msg.content)}
                        title="Sao chép"
                        aria-label="Sao chép câu trả lời"
                        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {copiedId === msg.id ? (
                          <CheckIcon className="h-3.5 w-3.5" />
                        ) : (
                          <CopyIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {timeStr && <span>{timeStr}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Composer ── */}
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-ring">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isLoading
                    ? "AI đang phản hồi... Bạn có thể nhập tiếp"
                    : "Nhập lệnh tạo, hỏi đáp bài học hoặc /plan..."
                }
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {showStop ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  title="Dừng phản hồi"
                  aria-label="Dừng phản hồi"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90"
                >
                  <StopIcon className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <ArrowUpIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Launcher ── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Roadmap Assistant"
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {isOpen ? (
          <CloseIcon className="h-5 w-5" />
        ) : (
          <SparklesIcon className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
