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
  ArrowUpIcon,
  StopIcon,
  ArrowDownIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  MoreVerticalIcon,
  CopyIcon,
  CheckIcon,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/icons";
import { ChatTriggerButton, type ChatTriggerVariant } from "./ChatTriggerButton";

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
  "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer";

const QUICK_PROMPTS = [
  "Cris có kinh nghiệm gì về Next.js & React?",
  "Dự án nổi bật nhất của Cris gần đây?",
  "Cris có nhận làm Freelance / Remote không?",
  "Làm thế nào để liên hệ Zalo hoặc tải CV?",
];

export interface FloatingChatBotProps {
  /**
   * Style của Float Trigger Button:
   * - 'capsule': Glassmorphism Capsule bo tròn "Ask AI ✨" (Mặc định - V1)
   * - 'mascot': 3D Robot Avatar Chibi thân thiện (V2)
   */
  triggerVariant?: ChatTriggerVariant;
}

export function FloatingChatBot({ triggerVariant = "capsule" }: FloatingChatBotProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [copiedConvId, setCopiedConvId] = useState(false);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    input,
    setInput,
    isLoading,
    conversationId,
    sendMessage,
    sendFeedback,
    stopResponse,
  } = useFloatingChat();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages or during streaming.
  // While streaming, jump instead of smooth-scrolling: every token restarts a
  // smooth scroll, which stutters. Smooth is kept for new messages only.
  // When the user has scrolled up to read earlier messages, pause auto-scroll.
  useEffect(() => {
    if (isOpen && !showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isLoading ? "auto" : "smooth",
      });
    }
  }, [messages, isOpen, isLoading, showScrollBottom]);

  // Focus input when opened (Desktop only >= 768px, avoid aggressive mobile keyboard jump)
  useEffect(() => {
    if (isOpen && typeof window !== "undefined" && window.innerWidth >= 768) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  // Click outside to close options dropdown
  useEffect(() => {
    if (!isOptionsOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        optionsRef.current &&
        !optionsRef.current.contains(event.target as Node)
      ) {
        setIsOptionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOptionsOpen]);

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
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-xs md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="AI Assistant"
        className={cn(
          "pointer-events-none fixed z-[9999] flex flex-col font-sans",
          isOpen
            ? "inset-0 md:inset-auto md:bottom-6 md:right-6 md:items-end"
            : "bottom-4 right-4 items-end md:bottom-6 md:right-6"
        )}
      >
        {/* ── Chat Window Popup / Mobile Fullscreen (100dvh) ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cn(
                "pointer-events-auto relative flex flex-col overflow-hidden bg-background text-foreground shadow-xl",
                // Mobile (< 768px): Fullscreen 100dvh
                "fixed inset-0 h-[100dvh] max-h-[100dvh] w-full rounded-none border-0",
                // Desktop (>= 768px): Compact bottom-right floating window
                "md:static md:inset-auto md:mb-3 md:h-[600px] md:max-h-[80vh] md:w-[400px] md:rounded-2xl md:border md:border-border"
              )}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
                  <div className="relative" ref={optionsRef}>
                    <button
                      type="button"
                      onClick={() => setIsOptionsOpen((prev) => !prev)}
                      title="Tùy chọn"
                      aria-label="Tùy chọn"
                      aria-expanded={isOptionsOpen}
                      className={ICON_BUTTON}
                    >
                      <MoreVerticalIcon className="h-4 w-4" />
                    </button>

                    {isOptionsOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[220px] whitespace-nowrap rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={handleCopyConversationId}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer",
                            copiedConvId
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "text-foreground hover:bg-muted"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {copiedConvId ? (
                              <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <CopyIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span>Conversation ID</span>
                          </span>
                          {copiedConvId && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Đã copy
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

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
                          className="group flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted active:bg-muted/80"
                        >
                          <span className="truncate">{prompt}</span>
                          <ArrowUpIcon className="h-3.5 w-3.5 shrink-0 rotate-45 text-muted-foreground transition-colors group-hover:text-foreground" />
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
                            <div className="max-w-[88%] md:max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] md:text-sm leading-relaxed">
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
                                  label="Thinking..."
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
                                    className="inline-flex min-h-[38px] md:min-h-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 md:px-2.5 md:py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
                            <div className="-ml-1 flex items-center gap-0.5">
                              <button
                                onClick={() => sendFeedback(msg, 1)}
                                className={cn(
                                  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted",
                                  msg.feedback === 1
                                    ? "text-foreground bg-muted/60"
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
                                    ? "text-destructive bg-destructive/10"
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
              {/* While a reply is still generating, the arrow becomes three
                  pulsing dots: new content is arriving below the fold. */}
              <AnimatePresence>
                {showScrollBottom && (
                  <motion.button
                    key="scroll-bottom"
                    type="button"
                    onClick={scrollToBottom}
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute inset-x-0 bottom-20 z-10 mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-muted"
                    aria-label={
                      isLoading
                        ? "Đang trả lời — cuộn xuống để xem"
                        : "Cuộn xuống cuối"
                    }
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1 w-1 rounded-full bg-primary"
                            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                            transition={{
                              duration: 0.9,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: i * 0.15,
                            }}
                          />
                        ))}
                      </span>
                    ) : (
                      <ArrowDownIcon className="h-3.5 w-3.5" />
                    )}
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Composer */}
              <div className="border-t border-border/80 bg-background/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex items-center gap-2 rounded-2xl border border-border/80 bg-muted/30 py-1.5 pl-4 pr-1.5 transition-all duration-150 focus-within:border-primary/50 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Nhập câu hỏi của bạn..."
                    // Matches MAX_MESSAGE_LENGTH in app/api/chat/route.ts
                    maxLength={1000}
                    disabled={isLoading}
                    className="min-w-0 flex-1 bg-transparent py-1 text-[16px] md:text-sm font-normal tracking-[-0.01em] leading-normal text-foreground outline-none placeholder:text-muted-foreground/60 placeholder:font-normal placeholder:text-sm disabled:opacity-50"
                  />

                  {isLoading ? (
                    <button
                      type="button"
                      onClick={stopResponse}
                      title="Dừng phản hồi"
                      aria-label="Dừng phản hồi"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-xs transition-all hover:opacity-90 active:scale-95"
                    >
                      <StopIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      title="Gửi câu hỏi"
                      aria-label="Gửi câu hỏi"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                  )}
                </form>
                <p className="mt-1.5 hidden text-center text-xs text-muted-foreground md:block">
                  AI có thể mắc sai sót. Vui lòng xác thực với Cris khi cần
                  thiết.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Launcher (V1 Capsule default, or V2 Mascot) ── */}
        <ChatTriggerButton
          variant={triggerVariant}
          isOpen={isOpen}
          onToggle={() => setIsOpen(!isOpen)}
          greetingText={triggerVariant === "mascot" ? "Hi there! Cris có thể giúp gì cho bạn? ✨" : undefined}
        />
      </aside>
    </>
  );
}
