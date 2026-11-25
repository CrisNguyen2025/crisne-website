"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { debounce, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Activity,
  ArrowLeft,
  ArrowUpDown,
  CircleAlert,
  Inbox,
  Loader2,
  Plus,
  RotateCcw,
  Rss,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { NEWS_CONTENT_TYPE_TAGS } from "@/lib/news/content-type";
import type {
  NewsContentTypeTag,
  NewsFeedQueryParams,
  NewsFeedResponseDto,
  NewsFeedSort,
  NewsFeedView,
  NewsItemDto,
  NewsOrigin,
  NewsSourceDto,
  NewsWorkerHealthDto,
  ReadState,
} from "@/lib/news/schemas";
import * as newsService from "@/logic/news/newsService";
import { useToast } from "@/components/ui/toast";
import { MobileNewsDrawer } from "./MobileNewsDrawer";
import { NewsCard } from "./NewsCard";
import { NewsReaderPanel, NewsReaderSkeleton } from "./NewsReaderPanel";
import { QuickPasteDialog } from "./QuickPasteDialog";
import { SourcesManagerSheet } from "./SourcesManagerSheet";

interface NewsFeedClientProps {
  initialData: NewsFeedResponseDto;
  initialParams: {
    view: NewsFeedView;
    origin?: NewsOrigin;
    tag?: string;
    contentType?: NewsContentTypeTag;
    readState?: ReadState;
    q?: string;
    sort: NewsFeedSort;
  };
  initialSources?: NewsSourceDto[];
  initialSourcesOpen?: boolean;
  initialWorkerHealth?: NewsWorkerHealthDto;
  workerConfigured?: boolean;
}

const DEFAULT_PAGE_LIMIT = 60;
const VIEW_VALUES = ["inbox", "saved", "dismissed", "all", "done", "unread", "draft", "queue"] as const;
const SORT_VALUES = ["latest", "curated_first"] as const;
const ORIGIN_OPTIONS: { value: "" | NewsOrigin; label: string }[] = [
  { value: "", label: "Tất cả nguồn" },
  { value: "share", label: "Share" },
  { value: "manual", label: "Manual" },
  { value: "cron", label: "RSS" },
];

/** Views shown as tabs; legacy views (done/unread/draft/queue) stay reachable by URL. */
const TAB_VIEWS: { id: NewsFeedView; label: string; countKey: keyof NewsFeedResponseDto["counts"] }[] = [
  { id: "inbox", label: "Chờ xử lý", countKey: "inbox" },
  { id: "saved", label: "Đã lưu", countKey: "saved" },
  { id: "dismissed", label: "Đã bỏ qua", countKey: "dismissed" },
  { id: "all", label: "Tất cả", countKey: "total" },
];

const EXTRA_VIEW_LABELS: Partial<Record<NewsFeedView, string>> = {
  queue: "Hàng đợi",
  unread: "Chưa đọc",
  done: "Đã xử lý",
  draft: "Bài từ RSS",
};

const EMPTY_MESSAGES: Partial<Record<NewsFeedView, { title: string; hint: string }>> = {
  inbox: {
    title: "Hộp đã trống",
    hint: "Không còn bài nào chờ xử lý. Share link từ điện thoại hoặc dán link để thêm.",
  },
  saved: {
    title: "Chưa lưu bài nào",
    hint: "Bấm Lưu ở bài viết để giữ lại đọc sau hoặc tham khảo lâu dài.",
  },
  dismissed: {
    title: "Chưa bỏ qua bài nào",
    hint: "Các bài đã bỏ qua vẫn giữ URL chống trùng và có thể đưa lại Chờ xử lý tại đây.",
  },
  queue: { title: "Hàng đợi đang trống", hint: "Mọi link đã được xử lý xong." },
};

const WIDE_QUERY = "(min-width: 1280px)";

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True from the xl breakpoint, where list and reader sit side by side. */
function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}

function serializeParams(params: NewsFeedQueryParams): string {
  return [
    params.view ?? "inbox",
    params.origin ?? "",
    params.tag ?? "",
    params.contentType ?? "",
    params.readState ?? "",
    params.q ?? "",
    params.sort ?? "latest",
    String(params.limit ?? DEFAULT_PAGE_LIMIT),
  ].join("|");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

type WorkerStatusKey = "ok" | "offline" | "unconfigured" | "unknown";

const WORKER_STATUS_META: Record<
  WorkerStatusKey,
  { label: string; shortLabel: string; dotClass: string }
> = {
  ok: { label: "Worker OK", shortLabel: "OK", dotClass: "bg-emerald-500" },
  offline: { label: "Worker offline", shortLabel: "Offline", dotClass: "bg-destructive" },
  unconfigured: {
    label: "Chưa gắn worker",
    shortLabel: "Chưa gắn",
    dotClass: "bg-muted-foreground/50",
  },
  unknown: { label: "Worker", shortLabel: "Worker", dotClass: "bg-muted-foreground/50" },
};

function getWorkerStatusMeta(health: NewsWorkerHealthDto | null) {
  const status = health?.status;
  if (status === "ok" || status === "offline" || status === "unconfigured") {
    return WORKER_STATUS_META[status];
  }
  return WORKER_STATUS_META.unknown;
}

function resolveScrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "smooth";
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function parseValidOrigin(origin: string): NewsOrigin | undefined {
  if (origin === "cron" || origin === "share" || origin === "manual") return origin;
  return undefined;
}

function resolveEmptyMessage(
  view: NewsFeedView,
  hasSearchOrFilter: boolean
): { title: string; hint: string } {
  if (hasSearchOrFilter) {
    return { title: "Không tìm thấy bài nào khớp bộ lọc", hint: "Đổi từ khoá hoặc xoá bộ lọc." };
  }
  return EMPTY_MESSAGES[view] ?? { title: "Chưa có bài nào ở đây", hint: "Đổi tab để xem bài khác." };
}

function buildToggleSaveAction(item: NewsItemDto): {
  patch: Parameters<typeof newsService.updateNewsItem>[1];
  message: string;
} {
  const nextSaved = !(item.isSaved && item.reviewStatus !== "dismissed");
  const patch =
    nextSaved && item.reviewStatus === "dismissed"
      ? { isSaved: true, reviewStatus: "published" as const }
      : { isSaved: nextSaved };
  return { patch, message: nextSaved ? "Đã lưu bài" : "Đã bỏ lưu bài" };
}

function findNeighbourItem(items: NewsItemDto[], itemId: string): NewsItemDto | null {
  const index = items.findIndex((row) => row.id === itemId);
  return items[index + 1] ?? items[index - 1] ?? null;
}

function chipClass(isSelected: boolean): string {
  return `inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] cursor-pointer ${
    isSelected
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
  }`;
}

function useFilterBarDismiss(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, isOpen, onClose]);
}

function useFeedKeyboardShortcuts({
  isModalOpen,
  selectedItem,
  busyItemId,
  onOpenPaste,
  onNavigate,
  onToggleSave,
}: {
  isModalOpen: boolean;
  selectedItem: NewsItemDto | null;
  busyItemId: string | null;
  onOpenPaste: () => void;
  onNavigate: (offset: 1 | -1) => void;
  onToggleSave: (item: NewsItemDto) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen) return;
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        onOpenPaste();
        return;
      }
      if (key === "j" || key === "k") {
        e.preventDefault();
        onNavigate(key === "j" ? 1 : -1);
        return;
      }
      if (key === "s" && selectedItem && busyItemId !== selectedItem.id) {
        e.preventDefault();
        onToggleSave(selectedItem);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busyItemId, isModalOpen, onNavigate, onOpenPaste, onToggleSave, selectedItem]);
}

function NewsFeedHeader({
  isInert,
  workerStatus,
  isCheckingWorker,
  q,
  onCheckWorkerHealth,
  onSearchChange,
  onOpenMobileSearch,
  onOpenSources,
  onOpenPaste,
}: {
  isInert: boolean;
  workerStatus: { label: string; shortLabel: string; dotClass: string };
  isCheckingWorker: boolean;
  q: string;
  onCheckWorkerHealth: () => void;
  onSearchChange: (next: string) => void;
  onOpenMobileSearch: () => void;
  onOpenSources: () => void;
  onOpenPaste: () => void;
}) {
  return (
    <header
      inert={isInert || undefined}
      aria-hidden={isInert || undefined}
      className="shrink-0 border-b border-border bg-background"
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Link
          href="/"
          prefetch={true}
          aria-label="Về Crisne"
          className="inline-flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="font-display text-2xl font-semibold leading-none text-foreground">News</h1>

        <button
          type="button"
          onClick={onCheckWorkerHealth}
          disabled={isCheckingWorker}
          aria-label={`Kiểm tra trạng thái worker: ${workerStatus.label}`}
          title={`Kiểm tra trạng thái worker tóm tắt (${workerStatus.label})`}
          className="inline-flex h-7 shrink-0 touch-manipulation items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:pointer-events-none cursor-pointer"
        >
          <span className={`size-1.5 shrink-0 rounded-full transition-colors duration-150 ${workerStatus.dotClass}`} />
          {isCheckingWorker ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            <Activity className="size-3 shrink-0" />
          )}
          <span className="hidden sm:inline">{workerStatus.label}</span>
          <span className="sm:hidden">{workerStatus.shortLabel}</span>
        </button>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <label className="relative hidden w-64 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm tiêu đề, tag, domain"
              aria-label="Tìm kiếm bài tin"
              className={cn(
                "h-9 w-full rounded-lg border border-input bg-card pl-9 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring",
                q ? "pr-8" : "pr-3"
              )}
            />
            {q && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Xoá từ khoá"
                className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={onOpenMobileSearch}
            aria-label="Tìm"
            title="Tìm"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-95 md:hidden cursor-pointer"
          >
            <Search className="size-4" />
          </button>
          <button
            type="button"
            onClick={onOpenSources}
            aria-label="Nguồn RSS"
            title="Nguồn RSS"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-95 cursor-pointer"
          >
            <Rss className="size-4" />
          </button>
          <button
            type="button"
            onClick={onOpenPaste}
            aria-label="Thêm link"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Thêm link</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function NewsFilterToolbar({
  filterBarRef,
  mobileSearchInputRef,
  view,
  counts,
  isFilterOpen,
  activeFilterCount,
  q,
  origin,
  validReadState,
  sort,
  validContentType,
  tag,
  tags,
  onSelectView,
  onToggleFilterOpen,
  onSearchChange,
  onSelectOrigin,
  onToggleUnreadFilter,
  onToggleSort,
  onSelectContentType,
  onSelectTag,
  onClearFilters,
}: {
  filterBarRef: React.RefObject<HTMLDivElement | null>;
  mobileSearchInputRef: React.RefObject<HTMLInputElement | null>;
  view: NewsFeedView;
  counts: NewsFeedResponseDto["counts"];
  isFilterOpen: boolean;
  activeFilterCount: number;
  q: string;
  origin: string;
  validReadState: ReadState | undefined;
  sort: NewsFeedSort;
  validContentType: NewsContentTypeTag | undefined;
  tag: string;
  tags: NewsFeedResponseDto["tags"];
  onSelectView: (view: NewsFeedView) => void;
  onToggleFilterOpen: () => void;
  onSearchChange: (next: string) => void;
  onSelectOrigin: (next: "" | NewsOrigin) => void;
  onToggleUnreadFilter: () => void;
  onToggleSort: () => void;
  onSelectContentType: (ct: string) => void;
  onSelectTag: (tag: string) => void;
  onClearFilters: () => void;
}) {
  return (
    <div ref={filterBarRef} className="relative z-20 shrink-0 border-b border-border px-4 sm:px-5">
      <div className="flex items-center gap-2">
        <nav className="flex min-w-0 flex-1 gap-4 overflow-x-auto [scrollbar-width:none]" aria-label="Chế độ xem">
          {TAB_VIEWS.map((tab) => {
            const isActive = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectView(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 shrink-0 touch-manipulation items-center gap-1.5 px-1 text-sm font-medium transition-colors duration-150 cursor-pointer",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:bg-foreground after:transition-[transform,opacity] after:duration-200 after:ease-out motion-reduce:after:transition-none",
                  isActive
                    ? "text-foreground after:scale-x-100 after:opacity-100"
                    : "text-muted-foreground hover:text-foreground after:scale-x-0 after:opacity-0"
                )}
              >
                {tab.label}
                <span
                  className={`text-xs tabular-nums transition-colors duration-150 ${
                    isActive ? "text-[var(--editorial-accent)]" : "text-muted-foreground"
                  }`}
                >
                  {counts[tab.countKey]}
                </span>
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onToggleFilterOpen}
          aria-expanded={isFilterOpen}
          aria-label="Lọc"
          title="Lọc theo nguồn, loại, tag, thứ tự"
          className={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-95 cursor-pointer ${
            isFilterOpen || activeFilterCount > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <SlidersHorizontal className="size-4" />
          {activeFilterCount > 0 && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--editorial-accent)]" />
          )}
        </button>
      </div>

      {/* Overlays the list instead of pushing it down, so cards keep their position */}
      <div
        inert={!isFilterOpen || undefined}
        aria-hidden={!isFilterOpen || undefined}
        className={cn(
          "absolute inset-x-0 top-full origin-top border-b border-border bg-background shadow-lg transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          isFilterOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        )}
      >
        <div className="max-h-[60dvh] overflow-auto overscroll-contain px-4 sm:px-5">
          <div className="flex flex-col gap-2.5 py-3">
            <label className="relative block md:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={q}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Tìm tiêu đề, tag, domain"
                aria-label="Tìm kiếm bài tin trên di động"
                className={cn(
                  "h-9 w-full rounded-lg border border-input bg-card pl-9 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-ring",
                  q ? "pr-8" : "pr-3"
                )}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Xoá từ khoá trên di động"
                  className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ORIGIN_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onSelectOrigin(opt.value)}
                  className={chipClass(origin === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onToggleUnreadFilter}
                className={chipClass(validReadState === "unread")}
              >
                Chưa đọc
              </button>
              <button
                type="button"
                onClick={onToggleSort}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] cursor-pointer"
              >
                <ArrowUpDown className="size-3.5" />
                {sort === "curated_first" ? "Ưu tiên tự chọn" : "Mới nhất"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NEWS_CONTENT_TYPE_TAGS.map((ct) => (
                <button
                  key={ct.tag}
                  type="button"
                  onClick={() => onSelectContentType(ct.tag)}
                  className={chipClass(validContentType === ct.tag)}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => onSelectTag(item.tag)}
                    className={chipClass(tag === item.tag)}
                  >
                    #{item.tag}
                    <span className="tabular-nums opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex h-7 w-fit items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] cursor-pointer"
              >
                <X className="size-3.5" />
                Xoá lọc
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsFeedCardsSection({
  items,
  hasMore,
  isPanelVisible,
  selectedItemId,
  isLoadingMore,
  onSelectItem,
  onLoadMore,
}: {
  items: NewsItemDto[];
  hasMore: boolean;
  isPanelVisible: boolean;
  selectedItemId: string | undefined;
  isLoadingMore: boolean;
  onSelectItem: (item: NewsItemDto) => void;
  onLoadMore: () => void;
}) {
  return (
    <>
      {items.map((item) => (
        <NewsCard
          key={item.id}
          item={item}
          isSelected={isPanelVisible && selectedItemId === item.id}
          onSelect={onSelectItem}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center border-b border-border py-4">
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
            Tải thêm
          </button>
        </div>
      )}
    </>
  );
}

function NewsFeedMainState({
  loadError,
  isLoading,
  isSwitchingView,
  isLoadingMore,
  displayData,
  emptyMessage,
  hasClearableFilters,
  isPanelVisible,
  selectedItemId,
  onRetry,
  onResetFilters,
  onOpenPaste,
  onSelectItem,
  onLoadMore,
}: {
  loadError: string | null;
  isLoading: boolean;
  isSwitchingView: boolean;
  isLoadingMore: boolean;
  displayData: NewsFeedResponseDto;
  emptyMessage: { title: string; hint: string };
  hasClearableFilters: boolean;
  isPanelVisible: boolean;
  selectedItemId: string | undefined;
  onRetry: () => void;
  onResetFilters: () => void;
  onOpenPaste: () => void;
  onSelectItem: (item: NewsItemDto) => void;
  onLoadMore: () => void;
}) {
  if (loadError) {
    return (
      <div
        className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-border bg-card p-4 sm:mx-5 motion-safe:animate-in motion-safe:fade-in duration-150"
        role="alert"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Không tải được danh sách tin</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.97] cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          Thử lại
        </button>
      </div>
    );
  }

  if (isLoading || (isSwitchingView && !isLoadingMore)) {
    return (
      <div className="px-4 sm:px-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="space-y-2.5 border-b border-border py-5">
            <div className="h-3 w-40 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-5 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-3.5 w-full rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (isSwitchingView) return null;

  if (displayData.items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in duration-150">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="size-5" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{emptyMessage.title}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{emptyMessage.hint}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasClearableFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.98] cursor-pointer"
            >
              <X className="size-4" />
              Xoá bộ lọc
            </button>
          )}
          <button
            type="button"
            onClick={onOpenPaste}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="size-4" />
            Thêm link
          </button>
        </div>
      </div>
    );
  }

  return (
    <NewsFeedCardsSection
      items={displayData.items}
      hasMore={Boolean(displayData.hasMore)}
      isPanelVisible={isPanelVisible}
      selectedItemId={selectedItemId}
      isLoadingMore={isLoadingMore}
      onSelectItem={onSelectItem}
      onLoadMore={onLoadMore}
    />
  );
}

function NewsReaderSlot({
  isWide,
  isSwitchingView,
  selectedItem,
  hasItems,
  hasLoadError,
  isLoading,
  renderReaderPanel,
}: {
  isWide: boolean;
  isSwitchingView: boolean;
  selectedItem: NewsItemDto | null;
  hasItems: boolean;
  hasLoadError: boolean;
  isLoading: boolean;
  renderReaderPanel: (item: NewsItemDto) => React.ReactNode;
}) {
  if (isWide && !isSwitchingView && selectedItem) {
    return renderReaderPanel(selectedItem);
  }
  const isSettling =
    (!isSwitchingView && hasItems) || (!hasLoadError && (isSwitchingView || isLoading));
  if (isSettling) {
    return <NewsReaderSkeleton />;
  }
  return <div className="hidden flex-1 bg-card xl:block" />;
}

export function NewsFeedClient({
  initialData,
  initialParams,
  initialSources = [],
  initialSourcesOpen = false,
  initialWorkerHealth,
  workerConfigured = false,
}: NewsFeedClientProps) {
  const { toast } = useToast();

  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(VIEW_VALUES).withDefault(initialParams.view)
  );
  const [origin, setOrigin] = useQueryState(
    "origin",
    parseAsString.withDefault(initialParams.origin ?? "")
  );
  const [tag, setTag] = useQueryState(
    "tag",
    parseAsString.withDefault(initialParams.tag ?? "")
  );
  const [contentType, setContentType] = useQueryState(
    "contentType",
    parseAsString.withDefault(initialParams.contentType ?? "")
  );
  const [readState, setReadState] = useQueryState(
    "readState",
    parseAsString.withDefault(initialParams.readState ?? "")
  );
  const [q, setQ] = useQueryState(
    "q",
    parseAsString
      .withDefault(initialParams.q ?? "")
      .withOptions({ shallow: true, limitUrlUpdates: debounce(250) })
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(SORT_VALUES).withDefault(initialParams.sort)
  );

  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const initialFilterKey = serializeParams({ ...initialParams, limit: DEFAULT_PAGE_LIMIT });
  const [data, setData] = useState<NewsFeedResponseDto>(initialData);
  // Filter key the current `data` belongs to; differs from `filterKey` while a tab switch loads
  const [dataKey, setDataKey] = useState<string>(initialFilterKey);
  // Client-side stale-while-revalidate cache so revisiting a tab/filter renders instantaneously
  const [feedCache, setFeedCache] = useState<Record<string, NewsFeedResponseDto>>(() => ({
    [initialFilterKey]: initialData,
  }));
  const cacheVersionRef = useRef(0);
  const [sources, setSources] = useState<NewsSourceDto[]>(initialSources);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(initialSourcesOpen);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isPanelOpenOnNarrow, setIsPanelOpenOnNarrow] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [workerHealth, setWorkerHealth] = useState<NewsWorkerHealthDto | null>(() =>
    initialWorkerHealth ??
    (workerConfigured ? null : { configured: false, status: "unconfigured" })
  );
  const [isCheckingWorker, setIsCheckingWorker] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);
  const filterBarRef = useRef<HTMLDivElement>(null);

  // The filter panel overlays the list, so a click outside it or Escape closes it
  const handleCloseFilter = useCallback(() => setIsFilterOpen(false), []);
  useFilterBarDismiss(isFilterOpen, filterBarRef, handleCloseFilter);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const pendingScrollItemIdRef = useRef<string | null>(null);

  const validContentType = useMemo<NewsContentTypeTag | undefined>(() => {
    return NEWS_CONTENT_TYPE_TAGS.some((item) => item.tag === contentType)
      ? (contentType as NewsContentTypeTag)
      : undefined;
  }, [contentType]);

  const validReadState = readState === "unread" || readState === "read" ? readState : undefined;

  const currentQueryParams = useMemo<NewsFeedQueryParams>(
    () => ({
      view,
      origin: parseValidOrigin(origin),
      tag: tag.trim().toLowerCase() || undefined,
      contentType: validContentType,
      readState: validReadState,
      q: q.trim() || undefined,
      sort,
      limit,
    }),
    [view, origin, tag, validContentType, validReadState, q, sort, limit]
  );

  const filterKey = serializeParams(currentQueryParams);
  const cachedForKey = feedCache[filterKey];
  const displayData = dataKey === filterKey ? data : (cachedForKey ?? data);
  const isSwitchingView = dataKey !== filterKey && !cachedForKey;

  const invalidateFeedCache = useCallback(() => {
    cacheVersionRef.current += 1;
    setFeedCache({});
  }, []);

  // Polling, post-update refreshes and tab switches all fetch with the filters they started with.
  // A slow response for an old tab must never overwrite the list of the tab now on screen.
  const latestFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    latestFilterKeyRef.current = filterKey;
  });

  const loadFeed = useCallback(async (params: NewsFeedQueryParams): Promise<void> => {
    const key = serializeParams(params);
    const version = cacheVersionRef.current;
    const next = await newsService.fetchNewsFeed(params);
    if (version === cacheVersionRef.current) {
      setFeedCache((prev) => ({ ...prev, [key]: next }));
    }
    if (key !== latestFilterKeyRef.current) return;
    setData(next);
    setDataKey(key);
    setLoadError(null);
  }, []);

  const refreshFeed = useCallback(
    async (options: { showLoading?: boolean; invalidateCache?: boolean } = {}) => {
      if (options.invalidateCache) invalidateFeedCache();
      if (options.showLoading) setIsLoading(true);
      try {
        await loadFeed(currentQueryParams);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Không thể tải danh sách tin."
        );
      } finally {
        if (options.showLoading) setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [currentQueryParams, invalidateFeedCache, loadFeed]
  );

  // Fetch when URL filter parameters or page limit diverge from the data on screen
  const hasCachedForKey = Boolean(cachedForKey);
  useEffect(() => {
    if (filterKey === dataKey) return;
    loadFeed(currentQueryParams)
      .catch((error: unknown) => {
        if (serializeParams(currentQueryParams) !== latestFilterKeyRef.current || hasCachedForKey) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Không thể tải danh sách tin."
        );
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [currentQueryParams, dataKey, filterKey, hasCachedForKey, loadFeed]);

  const activeJobsCount = displayData.counts.queued + displayData.counts.processing;
  useEffect(() => {
    if (activeJobsCount === 0) return;
    const timer = window.setInterval(() => {
      loadFeed(currentQueryParams).catch(() => {
        // Keep UI stable on transient polling failure
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeJobsCount, currentQueryParams, loadFeed]);

  const isWide = useIsWide();

  const selectedItem = useMemo<NewsItemDto | null>(() => {
    const picked = displayData.items.find((item) => item.id === selectedItemId);
    if (picked) return picked;
    // Wide screens always show a reader, so fall back to the first item in the list
    return isWide ? (displayData.items[0] ?? null) : null;
  }, [displayData.items, isWide, selectedItemId]);

  const isNarrowDrawerOpen =
    !isWide && !isSwitchingView && Boolean(selectedItem) && isPanelOpenOnNarrow;
  const isPanelVisible =
    isNarrowDrawerOpen || (isWide && !isSwitchingView && Boolean(selectedItem));

  useLayoutEffect(() => {
    if (isWide || isPanelVisible) return;
    const el = listScrollRef.current;
    if (el && listScrollTopRef.current > 0 && el.scrollTop !== listScrollTopRef.current) {
      el.scrollTop = listScrollTopRef.current;
    }
  }, [isPanelVisible, isWide]);

  useEffect(() => {
    const targetId = pendingScrollItemIdRef.current;
    if (!targetId || selectedItem?.id !== targetId) return;
    pendingScrollItemIdRef.current = null;
    const cardEl = listScrollRef.current?.querySelector<HTMLElement>(
      `[data-news-card-id="${targetId}"]`
    );
    cardEl?.scrollIntoView?.({ block: "nearest", behavior: resolveScrollBehavior() });
  }, [selectedItem?.id]);

  const selectByOffset = useCallback(
    (offset: 1 | -1) => {
      if (displayData.items.length === 0) return;
      const index = selectedItem
        ? displayData.items.findIndex((item) => item.id === selectedItem.id)
        : -1;
      const nextIndex = Math.min(Math.max(index + offset, 0), displayData.items.length - 1);
      const nextId = displayData.items[nextIndex].id;
      pendingScrollItemIdRef.current = nextId;
      setSelectedItemId(nextId);
    },
    [displayData.items, selectedItem]
  );

  const applyItemUpdate = useCallback(
    async (
      id: string,
      patch: Parameters<typeof newsService.updateNewsItem>[1],
      successMessage?: string,
      { isBackground = false }: { isBackground?: boolean } = {}
    ): Promise<boolean> => {
      // Background updates (auto-read) must not lock the decision buttons
      if (!isBackground) setBusyItemId(id);
      try {
        await newsService.updateNewsItem(id, patch);
        await refreshFeed({ invalidateCache: true });
        if (successMessage) toast(successMessage, "success");
        return true;
      } catch (error) {
        toast(
          error instanceof Error ? error.message : "Không thể cập nhật bài tin.",
          "error"
        );
        return false;
      } finally {
        if (!isBackground) setBusyItemId(null);
      }
    },
    [refreshFeed, toast]
  );

  const handleCloseNarrowDrawer = useCallback(() => {
    setIsPanelOpenOnNarrow(false);
  }, []);

  const handleSelectItem = useCallback((item: NewsItemDto) => {
    if (listScrollRef.current) {
      listScrollTopRef.current = listScrollRef.current.scrollTop;
    }
    setSelectedItemId(item.id);
    setIsPanelOpenOnNarrow(true);
  }, []);

  const handleToggleRead = useCallback(
    (item: NewsItemDto, nextState: "read" | "unread") => {
      if (nextState === item.readState) return;
      void applyItemUpdate(item.id, { readState: nextState }, undefined, { isBackground: true });
    },
    [applyItemUpdate]
  );

  /** Apply a decision, then move the reader to the neighbouring item. */
  const decide = useCallback(
    async (
      item: NewsItemDto,
      patch: Parameters<typeof newsService.updateNewsItem>[1],
      successMessage: string
    ) => {
      const neighbour = findNeighbourItem(displayData.items, item.id);
      const wasSelected = selectedItem?.id === item.id;
      const isDone = await applyItemUpdate(item.id, patch, successMessage);
      if (!isDone || !wasSelected) return;
      pendingScrollItemIdRef.current = neighbour?.id ?? null;
      setSelectedItemId(neighbour?.id ?? null);
      if (!neighbour) setIsPanelOpenOnNarrow(false);
    },
    [applyItemUpdate, displayData.items, selectedItem]
  );

  const handleToggleSave = useCallback(
    (item: NewsItemDto) => {
      const { patch, message } = buildToggleSaveAction(item);
      if (view === "all") {
        void applyItemUpdate(item.id, patch, message);
        return;
      }
      void decide(item, patch, message);
    },
    [applyItemUpdate, decide, view]
  );

  const handleDismiss = useCallback(
    (item: NewsItemDto) =>
      void decide(item, { reviewStatus: "dismissed", isSaved: false }, "Đã bỏ qua bài"),
    [decide]
  );

  const handleReopen = useCallback(
    (item: NewsItemDto) => {
      const patch =
        item.reviewStatus === "dismissed"
          ? { isSaved: false, reviewStatus: "published" as const }
          : { isSaved: false };
      void decide(item, patch, "Đã đưa lại Chờ xử lý");
    },
    [decide]
  );

  const handleDelete = useCallback(
    async (item: NewsItemDto) => {
      const neighbour = findNeighbourItem(displayData.items, item.id);
      const wasSelected = selectedItem?.id === item.id;
      setDeletingId(item.id);
      try {
        await newsService.deleteNewsItem(item.id);
        await refreshFeed({ invalidateCache: true });
        toast("Đã xoá bài", "success");
        if (wasSelected) {
          pendingScrollItemIdRef.current = neighbour?.id ?? null;
          setSelectedItemId(neighbour?.id ?? null);
          if (!neighbour) setIsPanelOpenOnNarrow(false);
        }
      } catch (error) {
        toast(
          error instanceof Error ? error.message : "Không thể xoá bài tin.",
          "error"
        );
      } finally {
        setDeletingId(null);
      }
    },
    [displayData.items, refreshFeed, selectedItem, toast]
  );

  const handleOpenPaste = useCallback(() => setIsPasteOpen(true), []);
  // Keyboard shortcuts: 'N' quick paste, 'J'/'K' navigate, 'S' toggle save
  useFeedKeyboardShortcuts({
    isModalOpen: isPasteOpen || isSourcesOpen,
    selectedItem,
    busyItemId,
    onOpenPaste: handleOpenPaste,
    onNavigate: selectByOffset,
    onToggleSave: handleToggleSave,
  });

  const handleUpdateTags = useCallback(
    async (item: NewsItemDto, nextTags: string[]) => {
      await applyItemUpdate(item.id, { tags: nextTags }, "Đã cập nhật tag");
    },
    [applyItemUpdate]
  );

  const handleOpenExternal = useCallback(
    (item: NewsItemDto) => {
      if (item.reviewStatus !== "dismissed" && item.readState === "unread") {
        void applyItemUpdate(item.id, { readState: "read" }, undefined, { isBackground: true });
      }
    },
    [applyItemUpdate]
  );

  const handleSearchChange = useCallback(
    (next: string) => {
      setLimit(DEFAULT_PAGE_LIMIT);
      void setQ(next);
    },
    [setQ]
  );

  const handleSelectView = useCallback(
    (nextView: NewsFeedView) => {
      setLoadError(null);
      setLimit(DEFAULT_PAGE_LIMIT);
      void setView(nextView);
    },
    [setView]
  );

  const handleSelectTag = useCallback(
    (clickedTag: string) => {
      setLimit(DEFAULT_PAGE_LIMIT);
      void setTag(tag === clickedTag ? "" : clickedTag);
    },
    [setTag, tag]
  );

  const handleSelectContentType = useCallback(
    (clickedType: string) => {
      setLimit(DEFAULT_PAGE_LIMIT);
      void setContentType(contentType === clickedType ? "" : clickedType);
    },
    [contentType, setContentType]
  );

  const handleToggleUnreadFilter = useCallback(() => {
    setLimit(DEFAULT_PAGE_LIMIT);
    void setReadState(validReadState === "unread" ? "" : "unread");
  }, [setReadState, validReadState]);

  const handleCheckWorkerHealth = useCallback(async () => {
    setIsCheckingWorker(true);
    try {
      const health = await newsService.fetchNewsWorkerHealth();
      setWorkerHealth(health);
    } finally {
      setIsCheckingWorker(false);
    }
  }, []);

  const handleOpenSources = useCallback(() => {
    setIsSourcesOpen(true);
    void newsService
      .fetchNewsSources()
      .then((res) => setSources(res.sources))
      .catch(() => {
        // Keep current sources snapshot if background refresh fails
      });
  }, []);

  const activeFilterCount = [
    origin,
    tag,
    validContentType ?? "",
    validReadState ?? "",
    sort !== "latest" ? sort : "",
  ].filter(Boolean).length;

  const isTabView = TAB_VIEWS.some((tab) => tab.id === view);
  const emptyMessage = resolveEmptyMessage(view, Boolean(q || activeFilterCount > 0));

  const clearFilters = useCallback(() => {
    setLimit(DEFAULT_PAGE_LIMIT);
    void setOrigin("");
    void setTag("");
    void setContentType("");
    void setReadState("");
    void setSort("latest");
  }, [setContentType, setOrigin, setReadState, setSort, setTag]);

  const resetAllFiltersAndSearch = useCallback(() => {
    setLimit(DEFAULT_PAGE_LIMIT);
    void setQ("");
    clearFilters();
  }, [clearFilters, setQ]);

  /** Opens another item (e.g. a possible duplicate) in the reader, widening the list when it is filtered out. */
  const handleOpenItem = useCallback(
    (itemId: string) => {
      pendingScrollItemIdRef.current = itemId;
      setSelectedItemId(itemId);
      setIsPanelOpenOnNarrow(true);
      if (displayData.items.some((row) => row.id === itemId)) return;
      clearFilters();
      void setQ("");
      handleSelectView("all");
    },
    [clearFilters, displayData.items, handleSelectView, setQ]
  );

  const workerStatus = getWorkerStatusMeta(workerHealth);

  const renderReaderPanel = useCallback(
    (item: NewsItemDto, animateMount = true) => (
      <NewsReaderPanel
        key={item.id}
        animateMount={animateMount}
        item={item}
        duplicateTitle={
          item.possibleDuplicateOfId
            ? displayData.duplicateTitles[item.possibleDuplicateOfId]
            : undefined
        }
        isUpdating={busyItemId === item.id}
        isDeleting={deletingId === item.id}
        onToggleRead={handleToggleRead}
        onToggleSave={handleToggleSave}
        onDismiss={handleDismiss}
        onReopen={handleReopen}
        onDelete={handleDelete}
        onUpdateTags={handleUpdateTags}
        onOpenExternal={handleOpenExternal}
        onOpenItem={handleOpenItem}
      />
    ),
    [
      busyItemId,
      deletingId,
      displayData.duplicateTitles,
      handleDelete,
      handleDismiss,
      handleOpenExternal,
      handleOpenItem,
      handleReopen,
      handleToggleRead,
      handleToggleSave,
      handleUpdateTags,
    ]
  );

  const renderDrawerReader = useCallback(
    (item: NewsItemDto) => renderReaderPanel(item, false),
    [renderReaderPanel]
  );

  const getItemLabel = useCallback((item: NewsItemDto) => item.title, []);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-x-hidden">
      <NewsFeedHeader
        isInert={isNarrowDrawerOpen}
        workerStatus={workerStatus}
        isCheckingWorker={isCheckingWorker}
        q={q}
        onCheckWorkerHealth={() => void handleCheckWorkerHealth()}
        onSearchChange={handleSearchChange}
        onOpenMobileSearch={() => {
          setIsFilterOpen(true);
          window.requestAnimationFrame(() => {
            mobileSearchInputRef.current?.focus({ preventScroll: true });
          });
        }}
        onOpenSources={handleOpenSources}
        onOpenPaste={handleOpenPaste}
      />

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Danh sách tin"
          inert={isNarrowDrawerOpen || undefined}
          aria-hidden={isNarrowDrawerOpen || undefined}
          className="flex w-full min-w-0 flex-col border-r border-border xl:w-[520px] xl:shrink-0"
        >
          <NewsFilterToolbar
            filterBarRef={filterBarRef}
            mobileSearchInputRef={mobileSearchInputRef}
            view={view}
            counts={displayData.counts}
            isFilterOpen={isFilterOpen}
            activeFilterCount={activeFilterCount}
            q={q}
            origin={origin}
            validReadState={validReadState}
            sort={sort}
            validContentType={validContentType}
            tag={tag}
            tags={displayData.tags}
            onSelectView={handleSelectView}
            onToggleFilterOpen={() => setIsFilterOpen((open) => !open)}
            onSearchChange={handleSearchChange}
            onSelectOrigin={(val) => {
              setLimit(DEFAULT_PAGE_LIMIT);
              void setOrigin(val);
            }}
            onToggleUnreadFilter={handleToggleUnreadFilter}
            onToggleSort={() => void setSort(sort === "latest" ? "curated_first" : "latest")}
            onSelectContentType={handleSelectContentType}
            onSelectTag={handleSelectTag}
            onClearFilters={clearFilters}
          />

          <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!isTabView && (
              <div className="flex items-center justify-between gap-2 px-4 pt-3 text-sm sm:px-5">
                <span className="font-medium text-foreground">{EXTRA_VIEW_LABELS[view] ?? view}</span>
                <button
                  type="button"
                  onClick={() => handleSelectView("inbox")}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] cursor-pointer"
                >
                  <Inbox className="size-3.5" />
                  Về Chờ xử lý
                </button>
              </div>
            )}

            {activeJobsCount > 0 && view !== "queue" && (
              <div className="px-4 pt-3 sm:px-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 rounded-lg bg-[var(--status-learning-bg)] px-3 py-2 text-xs text-[var(--status-learning)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{activeJobsCount} link đang được tóm tắt</span>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => handleSelectView("queue")}
                    className="font-medium underline-offset-2 hover:underline cursor-pointer"
                  >
                    Xem hàng đợi
                  </button>
                </div>
              </div>
            )}

            <NewsFeedMainState
              loadError={loadError}
              isLoading={isLoading}
              isSwitchingView={isSwitchingView}
              isLoadingMore={isLoadingMore}
              displayData={displayData}
              emptyMessage={emptyMessage}
              hasClearableFilters={Boolean(q || activeFilterCount > 0)}
              isPanelVisible={isPanelVisible}
              selectedItemId={selectedItem?.id}
              onRetry={() => void refreshFeed({ showLoading: true })}
              onResetFilters={resetAllFiltersAndSearch}
              onOpenPaste={handleOpenPaste}
              onSelectItem={handleSelectItem}
              onLoadMore={() => {
                setIsLoadingMore(true);
                setLimit((prev) => Math.min(prev + DEFAULT_PAGE_LIMIT, 300));
              }}
            />
          </div>
        </section>

        <NewsReaderSlot
          isWide={isWide}
          isSwitchingView={isSwitchingView}
          selectedItem={selectedItem}
          hasItems={displayData.items.length > 0}
          hasLoadError={Boolean(loadError)}
          isLoading={isLoading}
          renderReaderPanel={renderReaderPanel}
        />
      </div>

      <MobileNewsDrawer
        open={isNarrowDrawerOpen}
        item={selectedItem}
        label={getItemLabel}
        onClose={handleCloseNarrowDrawer}
      >
        {renderDrawerReader}
      </MobileNewsDrawer>

      <QuickPasteDialog
        open={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        onIngested={() => void refreshFeed({ invalidateCache: true })}
      />

      <SourcesManagerSheet
        open={isSourcesOpen}
        initialSources={sources}
        onClose={() => setIsSourcesOpen(false)}
        onChanged={() => void refreshFeed({ invalidateCache: true })}
      />
    </div>
  );
}
