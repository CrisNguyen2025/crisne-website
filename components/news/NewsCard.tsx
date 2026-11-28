"use client";

import React from "react";
import {
  BookmarkCheck,
  CircleAlert,
  Clapperboard,
  Globe,
  Loader2,
  Rss,
  Youtube,
} from "lucide-react";
import { formatNewsContentType } from "@/lib/news/content-type";
import type { NewsItemDto, NewsPlatform } from "@/lib/news/schemas";
import { formatFriendlyTime } from "@/lib/roadmap/date-utils";
import { isNewsItemDone } from "./NewsDecisionBar";

interface NewsCardProps {
  item: NewsItemDto;
  isSelected?: boolean;
  onSelect: (item: NewsItemDto) => void;
}

export function PlatformIcon({ platform }: { platform: NewsPlatform }) {
  if (platform === "youtube") return <Youtube className="size-3.5 shrink-0" aria-hidden="true" />;
  if (platform === "tiktok") return <Clapperboard className="size-3.5 shrink-0" aria-hidden="true" />;
  return <Globe className="size-3.5 shrink-0" aria-hidden="true" />;
}

export function isPendingIngest(item: NewsItemDto): boolean {
  return (
    item.ingestStatus === "queued" ||
    item.ingestStatus === "processing" ||
    item.ingestStatus === "failed"
  );
}

/** Pending items have no real title yet, so show the URL without the scheme. */
export function formatNewsTitle(item: NewsItemDto): string {
  return isPendingIngest(item) ? item.title.replace(/^https?:\/\//, "") : item.title;
}

const BADGE = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium";

function renderStatusBadge(item: NewsItemDto): React.ReactNode {
  if (item.ingestStatus === "queued" || item.ingestStatus === "processing") {
    return (
      <span className={`${BADGE} bg-[var(--status-learning-bg)] text-[var(--status-learning)]`}>
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        {item.ingestStatus === "processing" ? "Đang tóm tắt" : "Trong hàng đợi"}
      </span>
    );
  }
  if (item.ingestStatus === "failed") {
    return (
      <span className={`${BADGE} bg-[var(--editorial-accent-soft)] text-destructive`}>
        <CircleAlert className="size-3" aria-hidden="true" />
        Lỗi
      </span>
    );
  }
  if (item.ingestStatus === "partial") {
    return <span className={`${BADGE} bg-muted text-muted-foreground`}>Chỉ có tiêu đề</span>;
  }
  if (item.reviewStatus === "dismissed") {
    return <span className={`${BADGE} bg-muted text-muted-foreground`}>Đã bỏ qua</span>;
  }
  if (item.isSaved) {
    return (
      <span className={`${BADGE} bg-[var(--status-known-bg)] text-[var(--status-known)]`}>
        <BookmarkCheck className="size-3" aria-hidden="true" />
        Đã lưu
      </span>
    );
  }
  if (item.origin === "cron") {
    return (
      <span className={`${BADGE} bg-muted text-muted-foreground`}>
        <Rss className="size-3" aria-hidden="true" />
        RSS
      </span>
    );
  }
  return null;
}

/** One row of the News list: meta, title, TL;DR and status; the whole row opens the item. */
export const NewsCard = React.memo(function NewsCard({
  item,
  isSelected = false,
  onSelect,
}: NewsCardProps) {
  const isPending = isPendingIngest(item);
  const isUnread = item.readState === "unread" && !isPending;
  const isDone = isNewsItemDone(item);
  const badge = renderStatusBadge(item);
  const contentTypeLabel = isPending ? null : formatNewsContentType(item.tags);

  return (
    <article
      data-news-card-id={item.id}
      className={`group relative cursor-pointer overflow-hidden border-b border-border px-4 py-4 [contain:layout_style] transition-[background-color,box-shadow,opacity] duration-150 ease-out sm:px-5 ${
        isSelected
          ? "editorial-nav-active bg-card"
          : "hover:bg-[var(--editorial-sidebar-hover)] active:bg-[var(--editorial-sidebar-active)]"
      } ${isDone ? "opacity-75" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {isUnread && (
          <span
            aria-label="Chưa đọc"
            title="Chưa đọc"
            className="size-1.5 shrink-0 rounded-full bg-[var(--editorial-accent-rail)]"
          />
        )}
        <PlatformIcon platform={item.platform} />
        <span className="truncate">
          {item.domain}
          {item.author ? ` · ${item.author}` : ""}
        </span>
        <span className="shrink-0">· {formatFriendlyTime(item.publishedAt ?? item.createdAt)}</span>
      </div>

      <h2 className="mt-1.5 min-w-0">
        <button
          type="button"
          onClick={() => onSelect(item)}
          aria-current={isSelected ? "true" : undefined}
          className={`block w-full min-w-0 touch-manipulation text-left decoration-1 underline-offset-4 transition-colors duration-150 group-hover:underline cursor-pointer after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring ${
            isPending
              ? "line-clamp-2 break-all font-mono text-sm text-muted-foreground"
              : "line-clamp-2 [overflow-wrap:anywhere] font-sans text-base font-semibold leading-snug text-foreground"
          }`}
        >
          {formatNewsTitle(item)}
        </button>
      </h2>

      {item.tldr && (
        <p className="mt-1 line-clamp-2 [overflow-wrap:anywhere] text-sm leading-relaxed text-muted-foreground">{item.tldr}</p>
      )}
      {!item.tldr && item.extractionError && (
        <p className="mt-1 line-clamp-2 [overflow-wrap:anywhere] text-sm text-muted-foreground">{item.extractionError}</p>
      )}

      {(badge || contentTypeLabel) && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          {badge}
          {contentTypeLabel && (
            <span className={`${BADGE} bg-muted text-muted-foreground`}>{contentTypeLabel}</span>
          )}
        </div>
      )}
    </article>
  );
});
