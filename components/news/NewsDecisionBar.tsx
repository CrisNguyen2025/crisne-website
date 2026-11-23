"use client";

import React, { useState } from "react";
import { Bookmark, BookmarkCheck, Inbox, Loader2, X } from "lucide-react";
import type { NewsItemDto } from "@/lib/news/schemas";

interface NewsDecisionBarProps {
  item: NewsItemDto;
  isBusy?: boolean;
  onToggleSave: (item: NewsItemDto) => void;
  onDismiss: (item: NewsItemDto) => void;
  onReopen: (item: NewsItemDto) => void;
}

const OUTLINE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const SAVED_BTN =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--status-known-border)] bg-[var(--status-known-bg)] px-3 text-sm font-medium text-[var(--status-known)] transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

/** True once the item has left the inbox: saved by the Owner or dismissed. */
export function isNewsItemDone(item: NewsItemDto): boolean {
  return item.isSaved || item.reviewStatus === "dismissed";
}

/** Decision bar pinned to the bottom of the reader panel. */
export function NewsDecisionBar({
  item,
  isBusy = false,
  onToggleSave,
  onDismiss,
  onReopen,
}: NewsDecisionBarProps) {
  const [activeAction, setActiveAction] = useState<"save" | "dismiss" | "reopen" | null>(null);
  const currentAction = isBusy ? activeAction : null;
  const isDismissed = item.reviewStatus === "dismissed";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => {
          setActiveAction("save");
          onToggleSave(item);
        }}
        className={item.isSaved && !isDismissed ? SAVED_BTN : OUTLINE}
      >
        {currentAction === "save" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : item.isSaved && !isDismissed ? (
          <BookmarkCheck className="size-4" aria-hidden="true" />
        ) : (
          <Bookmark className="size-4" aria-hidden="true" />
        )}
        {item.isSaved && !isDismissed ? "Đã lưu" : "Lưu"}
      </button>

      {isDismissed ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            setActiveAction("reopen");
            onReopen(item);
          }}
          className={OUTLINE}
        >
          {currentAction === "reopen" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Inbox className="size-4" aria-hidden="true" />
          )}
          Đưa lại Chờ xử lý
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setActiveAction("dismiss");
              onDismiss(item);
            }}
            className={OUTLINE}
          >
            {currentAction === "dismiss" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <X className="size-4" aria-hidden="true" />
            )}
            Bỏ qua
          </button>
          {item.isSaved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setActiveAction("reopen");
                onReopen(item);
              }}
              className={OUTLINE}
            >
              {currentAction === "reopen" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Inbox className="size-4" aria-hidden="true" />
              )}
              Đưa lại Chờ xử lý
            </button>
          )}
        </>
      )}

      <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
        <kbd className="font-mono">S</kbd> lưu · <kbd className="font-mono">J</kbd>/
        <kbd className="font-mono">K</kbd> chuyển bài
      </span>
    </div>
  );
}
