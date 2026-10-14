import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ChatbotConfig, FeedbackDetail } from "./types";
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
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "./icons";
import { formatTime, formatToolDisplayName } from "./utils/formatters";
import { ChatMarkdown } from "./ChatMarkdown";
import { LayerChoicePicker } from "./LayerChoicePicker";
import { ToolStepRow, CollapsibleStepsSummary, StepItem } from "./ToolStepRow";

const WIDGET_THEME_VARS: React.CSSProperties = {
  ["--bg" as any]: "#FFFFFF",
  ["--surface" as any]: "#F4F3F0",
  ["--border" as any]: "#E6E4DF",
  ["--text" as any]: "#1F1E1C",
  ["--text-muted" as any]: "#6B6862",
  ["--accent" as any]: "#C2410C",
  ["--accent-soft" as any]: "#FBEDE5",
  ["--success" as any]: "#3F7D58",
  ["--danger" as any]: "#B42318",

  // Semantic mappings for Tailwind components (e.g. ChatMarkdown)
  ["--background" as any]: "#FFFFFF",
  ["--foreground" as any]: "#1F1E1C",
  ["--muted-foreground" as any]: "#6B6862",
  ["--card" as any]: "#F4F3F0",
  ["--card-foreground" as any]: "#1F1E1C",
  ["--popover" as any]: "#FFFFFF",
  ["--popover-foreground" as any]: "#1F1E1C",
  ["--border" as any]: "#E6E4DF",
  ["--input" as any]: "#F4F3F0",
  ["--muted" as any]: "#F4F3F0",
  ["--primary" as any]: "#C2410C",
  ["--primary-foreground" as any]: "#FFFFFF",
  colorScheme: "light",
};

const UNLIKE_REASONS = [
  "Ảo giác / Sai kiến thức",
  "Lạc đề / Chưa đúng trọng tâm",
  "Lỗi cú pháp / Lộ trình hỏng",
  "Khó hiểu / Quá dài dòng",
] as const;

interface FeedbackReasonSheetProps {
  messageId: string;
  onSubmit: (reason?: string, comment?: string) => void;
  onClose: () => void;
}

function FeedbackReasonSheet({
  onSubmit,
  onClose,
}: FeedbackReasonSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitted(true);
    onSubmit(selectedReason || undefined, comment.trim() || undefined);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] p-3.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-[#E6E4DF]/60">
        <span className="text-xs font-semibold text-[#1F1E1C]">
          Góp ý câu trả lời chưa tốt
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          aria-label="Đóng bảng góp ý"
          className="flex h-5 w-5 items-center justify-center rounded text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {isSubmitted ? (
        <div className="flex items-center justify-center gap-1.5 py-6 text-xs font-medium text-[#3F7D58]">
          <CheckIcon className="h-4 w-4" />
          <span>Đã ghi nhận góp ý, cảm ơn bạn!</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {UNLIKE_REASONS.map((opt) => {
              const isSelected = selectedReason === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSelectedReason(isSelected ? null : opt)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border border-[#C2410C] bg-[#FBEDE5] text-[#C2410C] font-medium"
                      : "border border-[#E6E4DF] bg-[#F4F3F0] text-[#1F1E1C] hover:bg-[#ECEAE5]"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="AI cần cải thiện điểm nào? (tùy chọn)..."
            rows={2}
            maxLength={300}
            className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] p-2 text-xs text-[#1F1E1C] outline-none placeholder:text-[#6B6862] focus:border-[#C2410C] focus:bg-[#FFFFFF]"
          />

          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-xs text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
            >
              Bỏ qua
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              Gửi góp ý
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

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
  onFeedback,
  getContext,
  onWebMcpMessage,
  className = "",
}: ChatbotConfig) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const [feedback, setFeedback] = useState<Record<string, 1 | 0>>({});
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleFeedback = (msgId: string, val: 1 | 0) => {
    if (val === 1) {
      const isRemoving = feedback[msgId] === 1;
      setFeedback((prev) => {
        const next = { ...prev };
        if (isRemoving) {
          delete next[msgId];
        } else {
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
    } else {
      const isRemoving = feedback[msgId] === 0;
      setFeedback((prev) => {
        const next = { ...prev };
        if (isRemoving) {
          delete next[msgId];
        } else {
          next[msgId] = 0;
        }
        return next;
      });
      if (isRemoving) {
        setActiveFeedbackMsgId(null);
      } else {
        onFeedback?.(msgId, 0);
        setActiveFeedbackMsgId(msgId);
      }
    }
  };

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

  // Auto-scroll (immediate follow during stream like Claude Code, smooth on arrival)
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isStreaming ? "auto" : "smooth",
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
          style={WIDGET_THEME_VARS}
          className="pointer-events-auto relative flex h-[720px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] animate-in fade-in zoom-in-95 duration-200"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 border-b border-[#E6E4DF] bg-[#FFFFFF] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F4F3F0] border border-[#E6E4DF] text-[#6B6862]">
                <SparklesIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-[#1F1E1C]">
                  {title}
                </div>
                <div className="truncate text-xs leading-tight text-[#6B6862]">
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
              >
                <NewChatIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu gọn"
                aria-label="Thu gọn"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
              >
                <CloseIcon className="h-4 w-4" />
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
                    <div className="relative max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-xs bg-[#F4F3F0] border border-[#E6E4DF] px-3.5 py-2 text-sm leading-relaxed text-[#1F1E1C]">
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-1.5 pr-1 text-xs text-[#6B6862]">
                      <button
                        type="button"
                        onClick={() => copyMessage(msg.id, msg.content)}
                        title="Sao chép câu hỏi"
                        aria-label="Sao chép câu hỏi"
                        className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <CheckIcon className="h-3 w-3 text-[#3F7D58]" />
                        ) : (
                          <CopyIcon className="h-3 w-3" />
                        )}
                      </button>
                      {timeStr && <span className="text-[11px]">{timeStr}</span>}
                    </div>
                  </div>
                );
              }

              const awaitingConfirm =
                !isStreaming &&
                isLast &&
                (msg.content.includes("Xác nhận thực hiện") ||
                  msg.content.includes("DRY-RUN PREVIEW"));

              const awaitingLayerChoice =
                !isStreaming &&
                isLast &&
                msg.content.includes("Chọn layer cho bài học");

              // Build step items
              const stepItems: StepItem[] = [];
              toolCalls.forEach((tc, idx) => {
                const toolKey = `${msg.id}-${idx}`;
                stepItems.push({
                  id: toolKey,
                  label: formatToolDisplayName(tc.name),
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

              return (
                <div key={msg.id} className="group flex flex-col gap-2">
                  {/* Main answer content rendered directly on canvas without a bubble card */}
                  {msg.content && (
                    <div className="text-sm leading-relaxed text-[#1F1E1C] py-0.5">
                      <ChatMarkdown
                        content={msg.content}
                        streaming={isLive}
                        onRun={isLoading ? undefined : sendMessage}
                      />
                    </div>
                  )}

                  {/* Step summary (collapsible, defaults to last action + total time), placed at bottom of response */}
                  {stepItems.length > 0 && (
                    <div className="-mx-1">
                      <CollapsibleStepsSummary
                        steps={stepItems}
                        expandedTools={expandedTools}
                        onToggleTool={toggleToolExpand}
                        isLive={isLive}
                      />
                    </div>
                  )}

                  {/* Confirmation for destructive actions (dry-run preview) */}
                  {awaitingConfirm && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => sendMessage("ok")}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        <span>Xác nhận thực hiện</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => sendMessage("hủy")}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-lg border border-[#E4E2DD] bg-[#F2F1EE] px-3 py-1.5 text-xs font-medium text-[#1F1E1C] transition-colors hover:bg-[#EAE8E3] disabled:opacity-50 cursor-pointer"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                        <span>Hủy bỏ</span>
                      </button>
                    </div>
                  )}

                  {awaitingLayerChoice && (
                    <LayerChoicePicker onSend={sendMessage} disabled={isLoading} />
                  )}

                  {/* Actions bar (Time and action buttons grouped on the right) */}
                  {msg.content && !isLive && (
                    <div className="flex items-center justify-end gap-1.5 pt-0.5 text-xs text-[#6B6862]">
                      {timeStr && <span className="select-none text-[11px]">{timeStr}</span>}
                      <button
                        type="button"
                        onClick={() => copyMessage(msg.id, msg.content)}
                        title="Sao chép"
                        aria-label="Sao chép câu trả lời"
                        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <CheckIcon className="h-3.5 w-3.5 text-[#3F7D58]" />
                        ) : (
                          <CopyIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 1)}
                        title="Hữu ích"
                        aria-label="Câu trả lời hữu ích"
                        aria-pressed={feedback[msg.id] === 1}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] cursor-pointer ${
                          feedback[msg.id] === 1
                            ? "text-[#1F1E1C] bg-[#F4F3F0]"
                            : "text-[#6B6862] hover:text-[#1F1E1C]"
                        }`}
                      >
                        <ThumbsUpIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 0)}
                        title="Chưa tốt"
                        aria-label="Câu trả lời chưa tốt"
                        aria-pressed={feedback[msg.id] === 0}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F3F0] cursor-pointer ${
                          feedback[msg.id] === 0
                            ? "text-[#B42318] bg-[#FBEDE5]"
                            : "text-[#6B6862] hover:text-[#1F1E1C]"
                        }`}
                      >
                        <ThumbsDownIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Composer ── */}
          <div className="p-3 border-t border-[#E6E4DF] bg-[#FFFFFF]">
            <div className="flex items-center gap-2 rounded-xl border border-[#E6E4DF] bg-[#F4F3F0] py-1.5 pl-3.5 pr-1.5 transition-all focus-within:border-[#C2410C] focus-within:ring-1 focus-within:ring-[#C2410C]/25">
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
                className="min-w-0 flex-1 bg-transparent text-sm text-[#1F1E1C] outline-none placeholder:text-[#6B6862]"
              />
              {showStop ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  title="Dừng phản hồi"
                  aria-label="Dừng phản hồi"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FBEDE5] text-[#B42318] border border-[#B42318]/20 transition-opacity hover:opacity-90 cursor-pointer"
                >
                  <StopIcon className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C2410C] text-white font-medium transition-all hover:bg-[#9A3412] hover:scale-105 active:scale-95 disabled:bg-[#E6E4DF] disabled:text-[#6B6862] disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* ── Feedback Reason Bottom Sheet ── */}
          {activeFeedbackMsgId && (
            <FeedbackReasonSheet
              messageId={activeFeedbackMsgId}
              onSubmit={(reason, comment) => {
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
              }}
              onClose={() => setActiveFeedbackMsgId(null)}
            />
          )}
        </div>
      )}

      {/* ── Launcher (hidden while open: the panel takes its corner; header has a close button) ── */}
      {!isOpen && (
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Roadmap Assistant"
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFFFFF] text-[#1F1E1C] border border-[#E6E4DF] shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] transition-all hover:bg-[#F4F3F0] hover:scale-105 active:scale-95 cursor-pointer"
      >
        {isOpen ? (
          <CloseIcon className="h-5 w-5 text-[#6B6862]" />
        ) : (
          <SparklesIcon className="h-5 w-5 text-[#1F1E1C]" />
        )}
      </button>
      )}
    </div>
  );
}
