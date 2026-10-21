"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Share2, Trash2, Check } from "lucide-react";
import type { UseFloatingChatReturn } from "@/hooks/use-floating-chat";
import { cn } from "@/lib/utils";
import {
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
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/icons";
import { chipHref, QUICK_PROMPTS, ICON_BUTTON } from "./FloatingChatPopup";
import { useAssistantViewport } from "@/hooks/use-assistant-viewport";

export interface FloatingChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chat: UseFloatingChatReturn;
}

export function FloatingChatDrawer({
  isOpen,
  onClose,
  chat,
}: FloatingChatDrawerProps) {
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    sendFeedback,
    resetChat,
    stopResponse,
    retry,
  } = chat;

  const [shared, setShared] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const viewport = useAssistantViewport(isOpen);

  // Auto-scroll to bottom on new messages or during streaming
  useEffect(() => {
    if (isOpen && !showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isLoading ? "auto" : "smooth",
      });
    }
  }, [messages, isOpen, isLoading, showScrollBottom]);

  // Focus textarea when drawer opens (Desktop >= 768px)
  useEffect(() => {
    if (isOpen && typeof window !== "undefined" && window.innerWidth >= 768) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${newHeight}px`;
  }, [input]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 80);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleShare = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      },
      () => {}
    );
  };

  const handleChipClick = (
    chip: ChatActionChip,
    link: { href: string; external: boolean } | null
  ) => {
    if (chip.type === "project") {
      window.dispatchEvent(
        new CustomEvent("project:open-modal", { detail: { projectId: chip.id } })
      );
    } else if (chip.type === "roadmap") {
      window.dispatchEvent(
        new CustomEvent("roadmap:select-layer", { detail: { layerId: chip.id } })
      );
    }

    if (link && !link.external) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        sendMessage();
      }
    }
  };

  const lastId = messages[messages.length - 1]?.id;
  const hasAssistantMessage = messages.some((m) => m.role === "assistant");

  return (
    <>
      {/* ── Backdrop Blur (Click to dismiss) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-xs"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ── Full-Height Right Drawer (100dvh) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            aria-label="Cris AI Assistant Drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className={cn(
              "fixed inset-y-0 right-0 z-[9999] flex h-[100dvh] w-full flex-col justify-between overflow-hidden border-l border-border bg-background text-foreground shadow-2xl font-sans",
              "sm:max-w-md md:max-w-lg lg:max-w-[480px]"
            )}
          >
            {/* ── Utility Toolbar Header ── */}
            <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <SparklesIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold leading-tight">
                    Cris Assistant
                  </h3>
                  <p className="truncate text-xs leading-tight text-muted-foreground">
                    {isLoading ? "Đang trả lời…" : "Digital Twin của Cris Nguyen"}
                  </p>
                </div>
              </div>

              {/* Utility actions */}
              <div className="flex shrink-0 items-center gap-1">
                {/* Retry Button */}
                <button
                  type="button"
                  onClick={() => retry()}
                  disabled={isLoading || !hasAssistantMessage}
                  title="Thử lại câu trả lời"
                  aria-label="Thử lại câu trả lời"
                  className={cn(
                    ICON_BUTTON,
                    "disabled:opacity-30 disabled:cursor-not-allowed"
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                {/* Share Button */}
                <button
                  type="button"
                  onClick={handleShare}
                  title={shared ? "Đã copy link!" : "Chia sẻ liên kết"}
                  aria-label="Chia sẻ liên kết"
                  className={ICON_BUTTON}
                >
                  {shared ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                </button>

                {/* Clear Chat Button */}
                <button
                  type="button"
                  onClick={resetChat}
                  title="Xóa lịch sử trò chuyện"
                  aria-label="Xóa lịch sử trò chuyện"
                  className={ICON_BUTTON}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  title="Đóng bảng trò chuyện"
                  aria-label="Đóng bảng trò chuyện"
                  className={ICON_BUTTON}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* ── Messages Container ── */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col justify-center space-y-6 px-1">
                  <div className="space-y-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <SparklesIcon className="h-5 w-5" />
                    </div>
                    <p className="text-lg font-bold tracking-tight text-foreground">
                      Xin chào! 👋
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Tôi là Digital Twin của{" "}
                      <strong className="font-semibold text-foreground">
                        Cris Nguyen
                      </strong>
                      . Hãy hỏi tôi về kinh nghiệm chuyên môn, các dự án thực tế, kiến trúc hệ thống hoặc cơ hội hợp tác!
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Gợi ý câu hỏi
                    </p>
                    <div className="flex flex-col gap-2">
                      {QUICK_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(prompt)}
                          className="group flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-left text-sm text-foreground transition-all hover:border-primary/40 hover:bg-muted active:bg-muted/80 shadow-xs"
                        >
                          <span className="truncate">{prompt}</span>
                          <ArrowUpIcon className="h-3.5 w-3.5 shrink-0 rotate-45 text-muted-foreground transition-colors group-hover:text-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    if (msg.role === "user") {
                      return (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-[15px] md:text-sm leading-relaxed">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }

                    const isLive = isLoading && msg.id === lastId;
                    const { cleanContent, actionChips } =
                      parseMessageContentAndActions(msg.content);
                    // Hide incomplete streamed marker
                    const visibleContent = cleanContent
                      .replace(/\[\[[^\]]*$/, "")
                      .trim();

                    return (
                      <div key={msg.id} className="flex flex-col gap-2 pr-2">
                        {msg.content ? (
                          <ChatMarkdown
                            content={visibleContent}
                            streaming={isLive}
                          />
                        ) : (
                          isLive && (
                            <div className="-mx-1.5">
                              <ToolStepRow label="Thinking..." running />
                            </div>
                          )
                        )}

                        {/* Action Chips */}
                        {!isLive && actionChips.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
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
                                  onClick={() => handleChipClick(chip, link)}
                                  className="inline-flex min-h-[38px] md:min-h-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 md:px-2.5 md:py-1 text-xs font-medium text-foreground transition-all hover:bg-muted hover:border-primary/30"
                                >
                                  {chip.label}
                                  <ArrowUpIcon className="h-3 w-3 rotate-45 text-muted-foreground" />
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Feedback */}
                        {msg.traceId && msg.content && !isLive && (
                          <div className="-ml-1 flex items-center gap-0.5 pt-1">
                            <button
                              type="button"
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
                              type="button"
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

            {/* Scroll-to-bottom indicator */}
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
                  className="absolute inset-x-0 bottom-24 z-10 mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-muted"
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

            {/* ── Composer with Auto-height Textarea & Viewport Ergonomics ── */}
            <div
              style={viewport.composerStyle}
              className="border-t border-border/80 bg-background/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!isLoading && input.trim()) {
                    sendMessage();
                  }
                }}
                className="flex items-end gap-2 rounded-2xl border border-border/80 bg-muted/30 p-2 pl-3.5 transition-all duration-150 focus-within:border-primary/50 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Hỏi Cris AI... (Enter để gửi)"
                  rows={1}
                  maxLength={1000}
                  disabled={isLoading}
                  className="min-h-[28px] max-h-[120px] min-w-0 flex-1 resize-none bg-transparent py-1 text-[16px] md:text-sm font-normal tracking-[-0.01em] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                />

                {/* Send / Stop Action Button */}
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stopResponse}
                    title="Dừng phản hồi"
                    aria-label="Dừng phản hồi"
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-xs transition-all hover:opacity-90 active:scale-95 mb-0.5"
                  >
                    <StopIcon className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    title="Gửi câu hỏi"
                    aria-label="Gửi câu hỏi"
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 mb-0.5"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                )}
              </form>
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                AI có thể mắc sai sót. Vui lòng xác thực với Cris khi cần thiết.
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
