import React, { useState, useRef, useEffect, useMemo } from "react";
import type { ChatbotConfig, ChatbotPosition } from "./types";
import { useRoadmapAssistantChat } from "./useRoadmapAssistantChat";

// ── Ultra-Modern Refined Vector Icons (Linear / Telegram Aesthetics) ──────────

function ModernSparklesIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function TelegramPaperPlaneIcon({
  className = "w-6 h-6",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.673c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.414z" />
    </svg>
  );
}

function VerifiedBadgeIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`text-[#2AABEE] ${className}`}
    >
      <path d="M10.29 2.29a2.42 2.42 0 0 1 3.42 0l.71.71a2.42 2.42 0 0 0 1.71.71h1a2.42 2.42 0 0 1 2.42 2.42v1a2.42 2.42 0 0 0 .71 1.71l.71.71a2.42 2.42 0 0 1 0 3.42l-.71.71a2.42 2.42 0 0 0-.71 1.71v1a2.42 2.42 0 0 1-2.42 2.42h-1a2.42 2.42 0 0 0-1.71.71l-.71.71a2.42 2.42 0 0 1-3.42 0l-.71-.71a2.42 2.42 0 0 0-1.71-.71h-1a2.42 2.42 0 0 1-2.42-2.42v-1a2.42 2.42 0 0 0-.71-1.71l-.71-.71a2.42 2.42 0 0 1 0-3.42l.71-.71a2.42 2.42 0 0 0 .71-1.71v-1a2.42 2.42 0 0 1 2.42-2.42h1a2.42 2.42 0 0 0 1.71-.71l.71-.71z" />
      <path
        d="m9 12 2 2 4-4"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DoubleCheckIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

function QuadrantArrowsIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m15 3 6 0 0 6" />
      <path d="m21 3-6.5 6.5" />
      <path d="m9 21-6 0 0-6" />
      <path d="m3 21 6.5-6.5" />
    </svg>
  );
}

function ResetChatIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function CloseIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CopyIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function LoaderIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animate-spin ${className}`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckCircleIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ChevronDownIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PromptSparkleIcon({
  className = "w-3.5 h-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

// ── Markdown Formatter (Clean Telegram Data View) ──────────────────────────────

function renderInlineStyles(text: string, isUser = false): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={i}
          className={`font-semibold ${isUser ? "text-white" : "text-slate-900"}`}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
            isUser
              ? "bg-white/20 text-white border border-white/25"
              : "bg-slate-100 text-[#1e88e5] border border-slate-200/80"
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function formatMarkdownText(content: string, isUser = false): React.ReactNode {
  const lines = content.split("\n");

  return lines.map((line, lineIdx) => {
    if (!line.trim()) {
      return <div key={lineIdx} className="h-1.5" />;
    }

    // Bullet point
    if (
      line.startsWith("- ") ||
      line.startsWith("• ") ||
      line.startsWith("* ")
    ) {
      const text = line.replace(/^[-•*]\s+/, "");
      return (
        <div key={lineIdx} className="flex items-start gap-2 my-0.5 pl-0.5">
          <span
            className={`font-bold leading-relaxed shrink-0 ${isUser ? "text-white/80" : "text-[#2AABEE]"}`}
          >
            •
          </span>
          <span>{renderInlineStyles(text, isUser)}</span>
        </div>
      );
    }

    // Numbered list
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      return (
        <div key={lineIdx} className="flex items-start gap-1.5 my-0.5 pl-0.5">
          <span
            className={`font-semibold shrink-0 ${isUser ? "text-white/90" : "text-[#2AABEE]"}`}
          >
            {numbered[1]}.
          </span>
          <span>{renderInlineStyles(numbered[2], isUser)}</span>
        </div>
      );
    }

    // Headers
    if (line.startsWith("### ")) {
      return (
        <h4
          key={lineIdx}
          className={`text-xs font-bold mt-2 mb-1 ${isUser ? "text-white" : "text-slate-900"}`}
        >
          {renderInlineStyles(line.slice(4), isUser)}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3
          key={lineIdx}
          className={`text-sm font-bold mt-2.5 mb-1 pb-0.5 border-b ${isUser ? "text-white border-white/20" : "text-slate-900 border-slate-200"}`}
        >
          {renderInlineStyles(line.slice(3), isUser)}
        </h3>
      );
    }

    return (
      <p
        key={lineIdx}
        className={`my-0.5 leading-relaxed ${isUser ? "text-white" : "text-slate-800"}`}
      >
        {renderInlineStyles(line, isUser)}
      </p>
    );
  });
}

function formatTime(date?: Date | string | number): string {
  if (!date) return "";
  const d =
    typeof date === "string" || typeof date === "number"
      ? new Date(date)
      : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatToolDisplayName(name: string): string {
  switch (name) {
    case "search_live_knowledge":
      return "🔍 Tra cứu cơ sở tri thức Live";
    case "create_topic":
    case "create_topics_batch":
      return "🗺️ Tạo Topic Roadmap";
    case "create_layer":
    case "create_layers_batch":
      return "📑 Tạo Layer mảng kiến thức";
    case "create_group":
      return "🏷️ Tạo Nhóm phân loại (Group)";
    case "create_item":
    case "create_items_batch":
      return "📖 Thêm Bài học (Item)";
    case "delete_topic":
    case "delete_layer":
    case "delete_group":
    case "delete_item":
      return "🗑️ Xóa thực thể Roadmap";
    case "preview_roadmap_plan":
      return "📋 Phác thảo kế hoạch Roadmap (/plan)";
    case "generate_roadmap_from_template":
      return "⚡ Sinh nhanh từ Blueprint (/goal)";
    case "list_topics":
      return "📚 Liệt kê danh sách Topic";
    default:
      return name;
  }
}

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
  onToolExecuted,
  getContext,
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
    onToolExecuted,
    getContext,
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

              return (
                <div
                  key={msg.id}
                  className={`group flex flex-col ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  {/* Telegram Bubble */}
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

                  {/* Telegram Inline Tool Execution Cards */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-1.5 w-[88%] space-y-1.5">
                      {msg.toolCalls.map((tc, idx) => {
                        const toolKey = `${msg.id}-${idx}`;
                        const isExpanded = expandedTools[toolKey];
                        const isExecuting = tc.result === "Đang thực thi...";

                        return (
                          <div
                            key={toolKey}
                            className={`rounded-xl border shadow-2xs transition-all overflow-hidden text-xs ${
                              isExecuting
                                ? "border-amber-200 bg-amber-50/80 text-amber-900 animate-pulse"
                                : "border-slate-200 bg-white/95 text-slate-800"
                            }`}
                          >
                            <div
                              onClick={() => toggleToolExpand(toolKey)}
                              className="flex cursor-pointer items-center justify-between px-3 py-2 select-none hover:bg-slate-50/80 transition-colors"
                            >
                              <div className="flex items-center gap-2 font-mono">
                                {isExecuting ? (
                                  <LoaderIcon className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                                <span className="font-semibold text-slate-800 text-[11px]">
                                  {formatToolDisplayName(tc.name)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <span>
                                  {isExecuting ? "Đang chạy" : "Chi tiết"}
                                </span>
                                <ChevronDownIcon
                                  className={`w-3 h-3 transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Expanded Result Box */}
                            {isExpanded && !isExecuting && (
                              <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                                {tc.result}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Active Live Tool Badge */}
            {activeTool && (
              <div className="flex items-center gap-2 rounded-xl border border-[#2AABEE]/30 bg-white/95 px-3.5 py-2 text-slate-700 text-xs shadow-xs animate-pulse">
                <LoaderIcon className="w-4 h-4 text-[#2AABEE] shrink-0" />
                <span className="text-[12px]">
                  Đang thực thi:{" "}
                  <strong className="text-[#2AABEE]">
                    {formatToolDisplayName(activeTool)}
                  </strong>
                  ...
                </span>
              </div>
            )}
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
