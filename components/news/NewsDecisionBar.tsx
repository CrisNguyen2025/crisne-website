"use client";

import React from "react";
import { Inbox, X } from "lucide-react";
import type { NewsItemDto } from "@/lib/news/schemas";

interface NewsDecisionBarProps {
  item: NewsItemDto;
  isBusy?: boolean;
  onDismiss: (item: NewsItemDto) => void;
  onReopen: (item: NewsItemDto) => void;
}

const OUTLINE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50 cursor-pointer";

/**
 * True once the item has left the inbox: dismissed by the Owner, or processed into the roadmap.
 * Processing is a background status (phase 2); `isSaved` holds it until a dedicated field exists.
 */
export function isNewsItemDone(item: NewsItemDto): boolean {
  return item.isSaved || item.reviewStatus === "dismissed";
}

/** Decision bar pinned to the bottom of the reader panel. */
export function NewsDecisionBar({
  item,
  isBusy = false,
  onDismiss,
  onReopen,
}: NewsDecisionBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
      {isNewsItemDone(item) ? (
        <button type="button" disabled={isBusy} onClick={() => onReopen(item)} className={OUTLINE}>
          <Inbox className="size-4" />
          Đưa lại Chờ xử lý
        </button>
      ) : (
        <button type="button" disabled={isBusy} onClick={() => onDismiss(item)} className={OUTLINE}>
          <X className="size-4" />
          Bỏ qua
        </button>
      )}
      <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
        Xong tự sang bài kế · <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd>
      </span>
    </div>
  );
}
