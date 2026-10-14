"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFloatingChat } from "@/hooks/use-floating-chat";
import { cn } from "@/lib/utils";
import {
  AUTHORITATIVE_CONTACTS,
  AUTHORITATIVE_PROJECTS,
  parseMessageContentAndActions,
  type ChatActionChip,
} from "@/lib/ai/action-chips";
import { ChatMarkdown } from "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { ToolStepRow } from "@/roadmap-rag-assistant/sdk/typescript/src/react/ToolStepRow";
import {
  SparklesIcon,
  CloseIcon,
  NewChatIcon,
  ArrowUpIcon,
  StopIcon,
  ArrowDownIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/icons";

/** Where an [[action:type|id|label]] chip from the model points; null when unknown. */
function chipHref(
  chip: ChatActionChip
): { href: string; external: boolean } | null {
  let href: string | undefined;
  if (chip.type === "project") {
    href =
      AUTHORITATIVE_PROJECTS.find((p) => p.id === chip.id)?.url ?? "#projects";
  } else if (chip.type === "contact") {
    const contact = AUTHORITATIVE_CONTACTS.find((c) => c.id === chip.id);
    href = contact?.href ?? contact?.path;
  } else if (chip.type === "roadmap") {
    href = "/";
  } else if (/^(https?:\/\/|\/)/.test(chip.id)) {
    href = chip.id;
  }
  return href ? { href, external: /^https?:\/\//.test(href) } : null;
}

const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer";

const QUICK_PROMPTS = [
  "Cris có kinh nghiệm gì về Next.js & React?",
  "Dự án nổi bật nhất của Cris gần đây?",
  "Cris có nhận làm Freelance / Remote không?",
  "Làm thế nào để liên hệ Zalo hoặc tải CV?",
];

export function FloatingChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    sendFeedback,
    resetChat,
    stopResponse,
  } = useFloatingChat();

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
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 80);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const lastId = messages[messages.length - 1]?.id;

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
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-xs sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="AI Assistant"
        className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col items-end font-sans sm:bottom-6 sm:right-6"
      >
        {/* ── Chat Window Popup / Mobile Bottom Sheet ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cn(
                "pointer-events-auto relative flex flex-col overflow-hidden bg-background text-foreground shadow-xl",
                // Mobile: Full bottom sheet with safe area
                "fixed inset-x-0 bottom-0 top-auto h-[88dvh] max-h-[88dvh] rounded-t-2xl border-t border-border",
                // Desktop: Compact bottom-right floating window
                "sm:static sm:inset-auto sm:mb-3 sm:h-[600px] sm:max-h-[80vh] sm:w-[400px] sm:rounded-2xl sm:border sm:border-border"
              )}
            >
              {/* Mobile Drag Indicator */}
              <div className="flex w-full justify-center pb-1 pt-2 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <SparklesIcon className="h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium leading-tight">
                      Cris Assistant
                    </h3>
                    <p className="truncate text-xs leading-tight text-muted-foreground">
                      {isLoading
                        ? "Đang trả lời…"
                        : "Digital Twin của Cris Nguyen"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {messages.length > 0 && (
                    <button
                      onClick={resetChat}
                      title="Cuộc trò chuyện mới"
                      aria-label="Cuộc trò chuyện mới"
                      className={ICON_BUTTON}
                    >
                      <NewChatIcon />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    title="Đóng chat"
                    aria-label="Đóng chat"
                    className={ICON_BUTTON}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              {/* Messages Container */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 space-y-6 overflow-y-auto px-4 py-5"
              >
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col justify-center space-y-5 px-1">
                    <div className="space-y-1.5">
                      <SparklesIcon className="h-5 w-5 text-primary" />
                      <p className="pt-1 text-base font-semibold text-foreground">
                        Xin chào! 👋
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Tôi là trợ lý AI của{" "}
                        <strong className="font-semibold text-foreground">
                          Cris Nguyen
                        </strong>
                        . Hãy hỏi tôi về kinh nghiệm làm việc, dự án thực tế,
                        tech stack hoặc cách thức hợp tác nhé!
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Gợi ý câu hỏi
                      </p>
                      {QUICK_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(prompt)}
                          className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <span className="truncate">{prompt}</span>
                          <ArrowUpIcon className="h-3.5 w-3.5 rotate-45 text-muted-foreground transition-colors group-hover:text-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => {
                      if (msg.role === "user") {
                        return (
                          <div key={msg.id} className="flex justify-end">
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3.5 py-2 text-sm leading-relaxed">
                              {msg.content}
                            </div>
                          </div>
                        );
                      }

                      const isLive = isLoading && msg.id === lastId;
                      const { cleanContent, actionChips } =
                        parseMessageContentAndActions(msg.content);
                      // Hide a marker that is still streaming in ("[[action:proj…")
                      const visibleContent = cleanContent
                        .replace(/\[\[[^\]]*$/, "")
                        .trim();
                      return (
                        <div key={msg.id} className="flex flex-col gap-2">
                          {msg.content ? (
                            <ChatMarkdown
                              content={visibleContent}
                              streaming={isLive}
                            />
                          ) : (
                            isLive && (
                              <div className="-mx-1.5">
                                <ToolStepRow
                                  label="Đang soạn câu trả lời"
                                  running
                                />
                              </div>
                            )
                          )}

                          {!isLive && actionChips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {actionChips.map((chip, idx) => {
                                const link = chipHref(chip);
                                if (!link) return null;
                                return (
                                  <a
                                    key={`${chip.type}-${chip.id}-${idx}`}
                                    href={link.href}
                                    {...(link.external
                                      ? {
                                          target: "_blank",
                                          rel: "noopener noreferrer",
                                        }
                                      : {})}
                                    onClick={() =>
                                      !link.external && setIsOpen(false)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                  >
                                    {chip.label}
                                    <ArrowUpIcon className="h-3 w-3 rotate-45 text-muted-foreground" />
                                  </a>
                                );
                              })}
                            </div>
                          )}

                          {/* Feedback: shown once the answer has finished streaming */}
                          {msg.traceId && msg.content && !isLive && (
                            <div className="-ml-1.5 flex items-center gap-0.5">
                              <button
                                onClick={() => sendFeedback(msg, 1)}
                                className={cn(
                                  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted",
                                  msg.feedback === 1
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                                aria-label="Câu trả lời hữu ích"
                                aria-pressed={msg.feedback === 1}
                              >
                                <ThumbsUpIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => sendFeedback(msg, 0)}
                                className={cn(
                                  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted",
                                  msg.feedback === 0
                                    ? "text-destructive"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                                aria-label="Câu trả lời chưa tốt"
                                aria-pressed={msg.feedback === 0}
                              >
                                <ThumbsDownIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Scroll-to-bottom button */}
              {showScrollBottom && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-24 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-muted sm:bottom-20"
                  aria-label="Cuộn xuống cuối"
                >
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Composer (text-base on mobile prevents iOS Safari zoom) */}
              <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-ring"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập câu hỏi của bạn..."
                    // Matches MAX_MESSAGE_LENGTH in app/api/chat/route.ts
                    maxLength={1000}
                    disabled={isLoading}
                    className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60 sm:text-sm"
                  />

                  {isLoading ? (
                    <button
                      type="button"
                      onClick={stopResponse}
                      title="Dừng phản hồi"
                      aria-label="Dừng phản hồi"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90"
                    >
                      <StopIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      title="Gửi câu hỏi"
                      aria-label="Gửi câu hỏi"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </form>
                <p className="mt-1.5 hidden text-center text-xs text-muted-foreground sm:block">
                  AI có thể mắc sai sót. Vui lòng xác thực với Cris khi cần
                  thiết.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Launcher ── */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "pointer-events-auto h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg",
            // On mobile the open sheet covers the screen and has its own close button
            isOpen ? "hidden sm:flex" : "flex"
          )}
          aria-label={isOpen ? "Đóng AI Assistant" : "Mở AI Assistant"}
        >
          {isOpen ? (
            <CloseIcon className="h-5 w-5" />
          ) : (
            <SparklesIcon className="h-5 w-5" />
          )}
        </motion.button>
      </aside>
    </>
  );
}
