"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  Sparkles,
  RotateCcw,
  Square,
  ArrowDown,
  User,
} from "lucide-react";
import { useFloatingChat } from "@/hooks/use-floating-chat";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Cris có kinh nghiệm gì về Next.js & React?",
  "Dự án nổi bật nhất của Cris gần đây?",
  "Cris có nhận làm Freelance / Remote không?",
  "Làm thế nào để liên hệ Zalo hoặc tải CV?",
];

function FormattedMessage({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-1.5 text-[13px] sm:text-[13px] leading-relaxed">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-1" />;
        }

        // Bullet point
        if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
          const itemText = line.replace(/^[-•*]\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-steel font-bold mt-0.5 shrink-0">•</span>
              <span>{parseInlineMarkdown(itemText)}</span>
            </div>
          );
        }

        // Numbered list
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-steel font-semibold shrink-0">{numberedMatch[1]}.</span>
              <span>{parseInlineMarkdown(numberedMatch[2])}</span>
            </div>
          );
        }

        // Regular paragraph
        return <p key={idx}>{parseInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-muted/80 text-steel font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function FloatingChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, input, setInput, isLoading, sendMessage, resetChat, stopResponse } =
    useFloatingChat();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages or during streaming
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when opened (Desktop only, avoid aggressive mobile keyboard jump)
  useEffect(() => {
    if (isOpen && window.innerWidth >= 640) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 80);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* ── Mobile Backdrop (Tap outside to close) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[9998] sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="AI Assistant"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] flex flex-col items-end pointer-events-none"
      >
        {/* ── Chat Window Popup / Mobile Bottom Sheet ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cn(
                "pointer-events-auto flex flex-col overflow-hidden bg-background/95 backdrop-blur-2xl shadow-2xl ring-1 ring-border/80 dark:ring-white/10",
                // Mobile: Full bottom sheet with safe area
                "fixed inset-x-0 bottom-0 top-auto h-[88dvh] max-h-[88dvh] rounded-t-3xl rounded-b-none border-t border-border",
                // Desktop: Compact bottom-right floating window
                "sm:static sm:inset-auto sm:mb-4 sm:w-[420px] sm:h-[560px] sm:max-h-[82vh] sm:rounded-3xl sm:border sm:border-border/80"
              )}
            >
              {/* Mobile Drag Indicator */}
              <div className="w-full flex justify-center pt-2 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="px-5 py-3.5 bg-card/80 border-b border-border/60 flex items-center justify-between backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center w-9 h-9 rounded-2xl bg-steel/15 text-steel border border-steel/30 shadow-inner">
                    <Bot className="w-5 h-5" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm text-foreground">Cris Assistant</h3>
                      <span className="px-1.5 py-0.2 rounded-md bg-steel/15 text-steel text-[10px] font-medium border border-steel/20">
                        AI
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Digital Twin của Cris Nguyen
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={resetChat}
                      title="Xóa đoạn chat"
                      aria-label="Xóa đoạn chat"
                      className="p-2 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    title="Đóng chat"
                    aria-label="Đóng chat"
                    className="p-2 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Container */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin scrollbar-thumb-muted-foreground/20"
              >
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-center px-2 py-4 space-y-4">
                    <div className="w-12 h-12 rounded-3xl bg-steel/10 text-steel border border-steel/20 flex items-center justify-center shadow-inner">
                      <Sparkles className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm sm:text-base text-foreground">
                        Xin chào! 👋
                      </p>
                      <p className="text-xs sm:text-[13px] text-muted-foreground max-w-[300px] leading-relaxed">
                        Tôi là trợ lý AI của <strong>Cris Nguyen</strong>. Hãy hỏi tôi về kinh nghiệm làm việc, dự án thực tế, tech stack hoặc cách thức hợp tác nhé!
                      </p>
                    </div>

                    <div className="w-full space-y-2 pt-2">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left pl-1">
                        Gợi ý câu hỏi nhanh:
                      </p>
                      {QUICK_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(prompt)}
                          className="w-full text-left p-3 rounded-2xl bg-card/60 hover:bg-muted/80 text-foreground border border-border/60 text-xs sm:text-[13px] transition-all hover:border-steel/40 hover:translate-x-0.5 flex items-center justify-between group cursor-pointer active:scale-[0.98]"
                        >
                          <span className="truncate pr-2">{prompt}</span>
                          <span className="text-muted-foreground group-hover:text-steel transition-colors text-xs shrink-0">
                            →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex gap-2.5 items-start",
                          msg.role === "user" ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        {/* Avatar */}
                        <div
                          className={cn(
                            "w-6 h-6 rounded-xl flex items-center justify-center shrink-0 text-[11px] mt-1 shadow-sm",
                            msg.role === "user"
                              ? "bg-steel text-white"
                              : "bg-muted text-foreground border border-border/80"
                          )}
                        >
                          {msg.role === "user" ? (
                            <User className="w-3.5 h-3.5" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-steel" />
                          )}
                        </div>

                        {/* Bubble */}
                        <div
                          className={cn(
                            "p-3.5 rounded-2xl max-w-[85%] shadow-sm",
                            msg.role === "user"
                              ? "bg-steel text-white rounded-tr-xs"
                              : "bg-card text-card-foreground border border-border/70 rounded-tl-xs"
                          )}
                        >
                          {msg.content ? (
                            <FormattedMessage content={msg.content} />
                          ) : (
                            <div className="flex items-center gap-1.5 py-1 px-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-steel animate-bounce" />
                              <span className="w-1.5 h-1.5 rounded-full bg-steel animate-bounce [animation-delay:0.2s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-steel animate-bounce [animation-delay:0.4s]" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Scroll-to-bottom button */}
              {showScrollBottom && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-24 right-5 sm:bottom-20 sm:right-6 p-2 rounded-full bg-background/90 text-foreground border border-border shadow-lg hover:bg-muted transition-all cursor-pointer z-10"
                  aria-label="Cuộn xuống cuối"
                >
                  <ArrowDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              )}

              {/* Input Bar with iOS Auto-Zoom Prevention */}
              <div className="p-3 sm:p-3 border-t border-border/60 bg-card/70 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập câu hỏi của bạn..."
                    disabled={isLoading}
                    // text-base on mobile prevents iOS Safari zoom; sm:text-xs on desktop
                    className="flex-1 px-3.5 py-2.5 sm:py-2.5 rounded-2xl bg-muted/60 border border-border/80 text-base sm:text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-steel/60 focus:ring-1 focus:ring-steel/30 transition-all disabled:opacity-60"
                  />

                  {isLoading ? (
                    <button
                      type="button"
                      onClick={stopResponse}
                      title="Dừng phản hồi"
                      className="p-3 sm:p-2.5 rounded-2xl bg-destructive/15 text-destructive hover:bg-destructive/25 transition-all border border-destructive/20 cursor-pointer shrink-0"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      title="Gửi câu hỏi"
                      className="p-3 sm:p-2.5 rounded-2xl bg-steel text-white hover:bg-steel-dark disabled:opacity-40 disabled:hover:bg-steel transition-all shadow-md shadow-steel/20 cursor-pointer shrink-0 active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </form>
                <p className="text-[10px] text-muted-foreground/70 text-center mt-1.5 hidden sm:block">
                  AI có thể mắc sai sót. Vui lòng xác thực với Cris khi cần thiết.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Floating Action Trigger Button ── */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "pointer-events-auto relative w-13 h-13 sm:w-14 sm:h-14 rounded-full shadow-2xl flex items-center justify-center transition-all cursor-pointer duration-300",
            isOpen
              ? "bg-muted text-foreground border border-border"
              : "bg-linear-to-tr from-steel-dark via-steel to-steel-light text-white shadow-steel/30"
          )}
          aria-label={isOpen ? "Đóng AI Assistant" : "Mở AI Assistant"}
        >
          {!isOpen && (
            <>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-steel-light opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-steel" />
              </span>
            </>
          )}
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageSquare className="w-6 h-6" />
          )}
        </motion.button>
      </aside>
    </>
  );
}
