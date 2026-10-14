import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ChatbotConfig, ChatbotPosition } from "./types";
import { useRoadmapAssistantChat } from "./useRoadmapAssistantChat";
import {
  ModernSparklesIcon,
  TelegramPaperPlaneIcon,
  VerifiedBadgeIcon,
  DoubleCheckIcon,
  QuadrantArrowsIcon,
  ResetChatIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  LoaderIcon,
  CheckCircleIcon,
  PromptSparkleIcon,
} from "./icons";
import {
  formatMarkdownText,
  formatTime,
  formatToolDisplayName,
} from "./utils/formatters";
import { ToolStepRow } from "./ToolStepRow";

// ── Main Chatbot Widget Component (Telegram Style) ──────────────────────────

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
  const [currentPos, setCurrentPos] = useState<ChatbotPosition>(position);
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
  const isSendingRef = useRef(false);

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

  // Position styles
  const positionStyles: React.CSSProperties = useMemo(() => {
    const styles: React.CSSProperties = {
      position: "fixed",
      zIndex,
    };

    switch (currentPos) {
      case "bottom-left":
        styles.bottom = `${offsetY}px`;
        styles.left = `${offsetX}px`;
        break;
      case "top-right":
        styles.top = `${offsetY}px`;
        styles.right = `${offsetX}px`;
        break;
      case "top-left":
        styles.top = `${offsetY}px`;
        styles.left = `${offsetX}px`;
        break;
      case "bottom-right":
      default:
        styles.bottom = `${offsetY}px`;
        styles.right = `${offsetX}px`;
        break;
    }

    return styles;
  }, [currentPos, offsetX, offsetY, zIndex]);

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
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cyclePosition = () => {
    const positions: ChatbotPosition[] = [
      "bottom-right",
      "bottom-left",
      "top-left",
      "top-right",
    ];
    const nextIdx = (positions.indexOf(currentPos) + 1) % positions.length;
    setCurrentPos(positions[nextIdx]);
  };

  return (
    <div
      style={positionStyles}
      className={`font-sans pointer-events-none flex flex-col transition-all duration-300 ${
        currentPos.includes("left") ? "items-start" : "items-end"
      } ${className}`}
    >
      {/* ── Telegram Style Chat Window ── */}
      {isOpen && (
        <div
          style={{ width: "410px", height: "585px", maxHeight: "82vh" }}
          className="pointer-events-auto mb-3.5 flex flex-col overflow-hidden rounded-[26px] border border-slate-200/90 bg-[#edf2f6] text-slate-800 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.18)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          {/* ── Telegram Top Header ── */}
          <div className="relative flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-2xs backdrop-blur-md">
            <div className="flex items-center gap-3">
              {/* Modern AI Avatar with Telegram Blue Gradient */}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#2AABEE] to-[#229ED9] text-white shadow-xs">
                <ModernSparklesIcon className="w-5 h-5 text-white" />
                <span className="absolute bottom-0 right-0 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white" />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-900 leading-tight">
                    {title}
                  </span>
                  <VerifiedBadgeIcon className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                  {activeTool ? (
                    <span className="text-amber-600 font-medium flex items-center gap-1 animate-pulse">
                      <LoaderIcon className="w-3 h-3 text-amber-600" />
                      <span>{formatToolDisplayName(activeTool)}</span>
                    </span>
                  ) : isStreaming ? (
                    <span className="text-[#2AABEE] font-medium flex items-center gap-1">
                      <span className="animate-pulse">●</span> đang phản hồi...
                    </span>
                  ) : (
                    <span className="text-slate-400">bot • trực tuyến</span>
                  )}
                </div>
              </div>
            </div>

            {/* Header Control Buttons (Clean SVGs) */}
            <div className="flex items-center gap-1 text-slate-400">
              <button
                type="button"
                onClick={cyclePosition}
                title={`Đổi góc hiển thị (Hiện tại: ${currentPos})`}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <QuadrantArrowsIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={clearMessages}
                title="Xóa lịch sử trò chuyện"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <ResetChatIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu gọn"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Messages Scroll Area (Telegram Wallpaper Background) ── */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 text-[13px] leading-relaxed"
          >
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const timeStr = formatTime(msg.timestamp);
              const isLive =
                !isUser &&
                isStreaming &&
                msg.id === messages[messages.length - 1]?.id;
              const toolCalls = msg.toolCalls ?? [];
              const toolRunning = toolCalls.some(
                (tc) => tc.endedAt === undefined && isLive
              );
              // Waiting for the model after tools finished (or before any tool started).
              const showThinking = isLive && !msg.content && !toolRunning;
              const thinkingSince =
                toolCalls[toolCalls.length - 1]?.endedAt ??
                new Date(msg.timestamp).getTime();
              const showBubble = isUser || !!msg.content || !isLive;

              return (
                <div
                  key={msg.id}
                  className={`group flex flex-col ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  {/* Step list (tool calls + thinking), above the answer */}
                  {!isUser &&
                    (toolCalls.length > 0 ||
                      showThinking ||
                      msg.firstTokenAt !== undefined) && (
                      <div className="mb-1.5 w-[88%] space-y-0.5">
                        {toolCalls.map((tc, idx) => {
                          const toolKey = `${msg.id}-${idx}`;
                          const running = isLive && tc.endedAt === undefined;
                          return (
                            <ToolStepRow
                              key={toolKey}
                              label={formatToolDisplayName(tc.name)}
                              startedAt={tc.startedAt}
                              endedAt={tc.endedAt}
                              running={running}
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

                  {/* Telegram Bubble */}
                  {showBubble && (
                    <div
                      className={`relative px-3.5 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                        isUser
                          ? "max-w-[85%] bg-[#2AABEE] text-white rounded-2xl rounded-tr-xs"
                          : "max-w-[88%] bg-white text-slate-800 border border-slate-200/70 rounded-2xl rounded-tl-xs"
                      }`}
                    >
                      <div>
                        {msg.content ? (
                          formatMarkdownText(msg.content, isUser)
                        ) : isStreaming && !isUser ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2AABEE] animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2AABEE] animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2AABEE] animate-bounce" />
                          </div>
                        ) : null}

                        {/* Blinking progressive cursor during streaming */}
                        {isStreaming &&
                          !isUser &&
                          msg.id === messages[messages.length - 1]?.id && (
                            <span className="inline-block w-1.5 h-3.5 bg-[#2AABEE] ml-1 rounded-sm animate-pulse align-middle" />
                          )}

                        {/* Interactive Confirmation Action Bar (Phase 4) */}
                        {!isUser &&
                          !isStreaming &&
                          msg.id === messages[messages.length - 1]?.id &&
                          (msg.content.includes("Xác nhận thực hiện") ||
                            msg.content.includes("DRY-RUN PREVIEW")) && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => sendMessage("ok")}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-medium text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                <span>Xác nhận thực hiện</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => sendMessage("hủy")}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-98 text-slate-700 font-medium text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CloseIcon className="w-3.5 h-3.5 text-slate-400" />
                                <span>Hủy bỏ</span>
                              </button>
                            </div>
                          )}
                      </div>

                      {/* Telegram Timestamp & Meta Row */}
                      <div
                        className={`flex items-center justify-end gap-1.5 mt-1 select-none text-[10px] font-mono leading-none ${
                          isUser ? "text-white/80" : "text-slate-400"
                        }`}
                      >
                        {timeStr && <span>{timeStr}</span>}

                        {/* Double Checkmark for User messages */}
                        {isUser && (
                          <DoubleCheckIcon className="w-3.5 h-3.5 text-white/90 shrink-0" />
                        )}

                        {/* Copy Button for Assistant messages */}
                        {!isUser && msg.content && !isStreaming && (
                          <button
                            type="button"
                            onClick={() => copyMessage(msg.id, msg.content)}
                            title="Sao chép tin nhắn"
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 hover:text-slate-700 transition-opacity ml-1"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <CheckIcon className="w-2.5 h-2.5 text-emerald-500" />
                                <span className="text-[9px] text-emerald-600">
                                  Đã chép
                                </span>
                              </>
                            ) : (
                              <CopyIcon className="w-2.5 h-2.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Stop Generation Float Button ── */}
          {isStreaming && (
            <div className="flex justify-center -mb-2.5 z-10">
              <button
                type="button"
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 shadow-sm transition-all hover:scale-105 active:scale-95 backdrop-blur-xs"
              >
                <span className="w-2 h-2 rounded-xs bg-rose-500" />
                <span>Dừng phản hồi</span>
              </button>
            </div>
          )}

          {/* ── Telegram Style Input Bar ── */}
          <div className="border-t border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-xs">
            <div className="flex items-center gap-2 rounded-full border border-transparent bg-[#f0f2f5] hover:bg-[#eaecee] focus-within:bg-white focus-within:border-[#2AABEE] focus-within:ring-2 focus-within:ring-[#2AABEE]/20 px-3.5 py-1.5 transition-all shadow-2xs">
              <span className="text-slate-400 select-none">
                <PromptSparkleIcon className="w-3.5 h-3.5 text-[#2AABEE]" />
              </span>
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
                className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                aria-label="Send message"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2AABEE] text-white hover:bg-[#229ED9] disabled:opacity-40 transition-all shadow-xs hover:scale-105 active:scale-95 disabled:hover:scale-100 shrink-0"
              >
                {isLoading && !input.trim() ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <TelegramPaperPlaneIcon className="w-4 h-4 -translate-x-px translate-y-px" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Telegram Floating Action Button (FAB) ── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Roadmap Assistant"
        className="pointer-events-auto group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#2AABEE] via-[#229ED9] to-[#1E88E5] text-white shadow-[0_8px_24px_rgba(42,171,238,0.45)] border-2 border-white hover:scale-105 active:scale-95 transition-all duration-200"
      >
        {/* Glow Aura */}
        <span className="absolute -inset-1 rounded-full bg-[#2AABEE] opacity-25 blur-md group-hover:opacity-50 transition-opacity" />

        {/* Modern Official Telegram Icon */}
        <span className="relative flex items-center justify-center transition-transform duration-200">
          {isOpen ? (
            <CloseIcon className="w-6 h-6" />
          ) : (
            <TelegramPaperPlaneIcon className="w-7 h-7 -translate-x-0.5 translate-y-0.5" />
          )}
        </span>

        {/* Pulsing Status Dot */}
        {!isOpen && (
          <span className="absolute top-0 right-0 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
          </span>
        )}
      </button>
    </div>
  );
}
