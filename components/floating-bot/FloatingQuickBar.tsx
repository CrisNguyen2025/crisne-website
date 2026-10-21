"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { SparklesIcon, ArrowUpIcon } from "@/roadmap-rag-assistant/sdk/typescript/src/react/icons";
import { useQuickBarShortcut } from "@/hooks/use-quickbar-shortcut";
import { useAssistantViewport } from "@/hooks/use-assistant-viewport";

export interface FloatingQuickBarProps {
  isVisible?: boolean;
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: (val: string) => void;
  onOpenDrawer?: () => void;
  hasMessages?: boolean;
  className?: string;
}

export function FloatingQuickBar({
  isVisible = true,
  input,
  onInputChange,
  onSubmit,
  onOpenDrawer,
  hasMessages = false,
  className,
}: FloatingQuickBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewport = useAssistantViewport(isVisible);

  useQuickBarShortcut({
    inputRef,
    isEnabled: isVisible,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) {
      onOpenDrawer?.();
      return;
    }
    onSubmit(query);
  };

  const hasContent = Boolean(input.trim());
  const hasExistingChat = Boolean(hasMessages && !hasContent);
  const isClickable = hasContent || hasExistingChat;

  const handleActionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (hasExistingChat) {
      e.preventDefault();
      onOpenDrawer?.();
    }
  };

  return (
    <aside
      aria-label="Cris AI Quick Bar"
      style={viewport.quickBarStyle}
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] flex w-[92vw] max-w-lg items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-1.5 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out",
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-16 opacity-0 pointer-events-none",
        className
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="h-3.5 w-3.5" />
      </div>

      <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Hỏi Cris AI..."
          className="min-w-0 flex-1 bg-transparent py-1 text-[16px] md:text-sm font-normal tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground/70"
        />

        {/* Desktop Shortcut Badge */}
        <kbd
          className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground bg-muted border border-border rounded select-none"
          title="Nhấn 'A' để nhập nhanh"
        >
          A
        </kbd>

        {/* Action Button */}
        <button
          type={hasExistingChat ? "button" : "submit"}
          onClick={handleActionClick}
          aria-label={
            hasContent
              ? "Gửi câu hỏi"
              : hasExistingChat
                ? "Mở cuộc trò chuyện"
                : "Gửi câu hỏi"
          }
          title={
            hasContent
              ? "Gửi câu hỏi"
              : hasExistingChat
                ? "Mở cuộc trò chuyện"
                : undefined
          }
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-all duration-200",
            hasContent && "opacity-100 cursor-pointer hover:bg-primary/90 hover:scale-105 active:scale-95",
            hasExistingChat && "opacity-85 cursor-pointer ring-1 ring-primary/30 hover:opacity-100 hover:bg-primary/90 hover:shadow-md hover:ring-2 hover:ring-primary/50 hover:scale-105 active:scale-95",
            !isClickable && "opacity-40 cursor-not-allowed select-none"
          )}
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}
