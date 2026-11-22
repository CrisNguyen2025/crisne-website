"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { debounce, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
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
import type {
  NewsFeedQueryParams,
  NewsFeedResponseDto,
  NewsFeedSort,
  NewsFeedView,
  NewsItemDto,
  NewsOrigin,
  NewsSourceDto,
} from "@/lib/news/schemas";
import * as newsService from "@/logic/news/newsService";
import { useToast } from "@/components/ui/toast";
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
    q?: string;
    sort: NewsFeedSort;
  };
  initialSources?: NewsSourceDto[];
  initialSourcesOpen?: boolean;
}

const VIEW_VALUES = ["inbox", "done", "all", "unread", "saved", "draft", "queue"] as const;
const SORT_VALUES = ["latest", "curated_first"] as const;
const ORIGIN_OPTIONS: { value: "" | NewsOrigin; label: string }[] = [
  { value: "", label: "Tất cả nguồn" },
  { value: "share", label: "Share" },
  { value: "manual", label: "Manual" },
  { value: "cron", label: "RSS" },
];

/** Views shown as tabs; the rest stay reachable by URL (e.g. the queue link). */
const TAB_VIEWS: { id: NewsFeedView; label: string; countKey: keyof NewsFeedResponseDto["counts"] }[] = [
  { id: "all", label: "Tất cả", countKey: "total" },
  { id: "inbox", label: "Chờ xử lý", countKey: "inbox" },
  { id: "done", label: "Đã xử lý", countKey: "done" },
];

const EXTRA_VIEW_LABELS: Partial<Record<NewsFeedView, string>> = {
  queue: "Hàng đợi",
  unread: "Chưa đọc",
  saved: "Đã xử lý (không gồm bài bỏ qua)",
  draft: "Bài RSS chờ duyệt",
};

const EMPTY_MESSAGES: Partial<Record<NewsFeedView, { title: string; hint: string }>> = {
  inbox: {
    title: "Hộp đã trống",
    hint: "Không còn bài nào chờ xử lý. Share link từ điện thoại hoặc dán link để thêm.",
  },
  done: {
    title: "Chưa xử lý bài nào",
    hint: "Bài đã nạp vào roadmap hoặc đã bỏ qua sẽ nằm ở đây, đưa lại Chờ xử lý được.",
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
    params.q ?? "",
    params.sort ?? "latest",
  ].join("|");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function NewsFeedClient({
  initialData,
  initialParams,
  initialSources = [],
  initialSourcesOpen = false,
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

  const [data, setData] = useState<NewsFeedResponseDto>(initialData);
  // Filter key the current `data` belongs to; differs from `filterKey` while a tab switch loads
  const [dataKey, setDataKey] = useState<string>(() => serializeParams(initialParams));
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(initialSourcesOpen);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isPanelOpenOnNarrow, setIsPanelOpenOnNarrow] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [reingestingId, setReingestingId] = useState<string | null>(null);

  const currentQueryParams = useMemo<NewsFeedQueryParams>(
    () => ({
      view,
      origin:
        origin === "cron" || origin === "share" || origin === "manual"
          ? origin
          : undefined,
      tag: tag.trim().toLowerCase() || undefined,
      q: q.trim() || undefined,
      sort,
      limit: 60,
    }),
    [view, origin, tag, q, sort]
  );

  const filterKey = serializeParams(currentQueryParams);
  const isSwitchingView = dataKey !== filterKey;

  // Polling, post-update refreshes and tab switches all fetch with the filters they started with.
  // A slow response for an old tab must never overwrite the list of the tab now on screen.
  const latestFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    latestFilterKeyRef.current = filterKey;
  });

  const loadFeed = useCallback(
    async (params: NewsFeedQueryParams): Promise<void> => {
      const key = serializeParams(params);
      const next = await newsService.fetchNewsFeed(params);
      if (key !== latestFilterKeyRef.current) return;
      setData(next);
      setDataKey(key);
      setLoadError(null);
    },
    []
  );

  const refreshFeed = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      if (options.showLoading) setIsLoading(true);
      try {
        await loadFeed(currentQueryParams);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Không thể tải danh sách tin."
        );
      } finally {
        if (options.showLoading) setIsLoading(false);
      }
    },
    [currentQueryParams, loadFeed]
  );

  // Fetch when URL filter parameters diverge from the data on screen
  useEffect(() => {
    if (filterKey === dataKey) return;
    loadFeed(currentQueryParams).catch((error: unknown) => {
      if (serializeParams(currentQueryParams) !== latestFilterKeyRef.current) return;
      setLoadError(
        error instanceof Error ? error.message : "Không thể tải danh sách tin."
      );
    });
  }, [currentQueryParams, dataKey, filterKey, loadFeed]);

  const activeJobsCount = data.counts.queued + data.counts.processing;
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
    const picked = data.items.find((item) => item.id === selectedItemId);
    if (picked) return picked;
    // Wide screens always show a reader, so fall back to the first item in the list
    return isWide ? (data.items[0] ?? null) : null;
  }, [data.items, isWide, selectedItemId]);

  const isPanelVisible =
    !isSwitchingView && Boolean(selectedItem) && (isWide || isPanelOpenOnNarrow);

  const selectByOffset = useCallback(
    (offset: 1 | -1) => {
      if (data.items.length === 0) return;
      const index = selectedItem ? data.items.findIndex((item) => item.id === selectedItem.id) : -1;
      const nextIndex = Math.min(Math.max(index + offset, 0), data.items.length - 1);
      setSelectedItemId(data.items[nextIndex].id);
    },
    [data.items, selectedItem]
  );

  // Keyboard shortcuts: 'N' opens quick paste, 'J'/'K' move through the list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isPasteOpen || isSourcesOpen) return;
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        setIsPasteOpen(true);
      } else if (key === "j" || key === "k") {
        e.preventDefault();
        selectByOffset(key === "j" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPasteOpen, isSourcesOpen, selectByOffset]);

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
        await refreshFeed();
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

  const handleSelectItem = useCallback((item: NewsItemDto) => {
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
      const index = data.items.findIndex((row) => row.id === item.id);
      const neighbour = data.items[index + 1] ?? data.items[index - 1] ?? null;
      const wasSelected = selectedItem?.id === item.id;
      const isDone = await applyItemUpdate(item.id, patch, successMessage);
      if (!isDone || !wasSelected) return;
      setSelectedItemId(neighbour?.id ?? null);
      if (!neighbour) setIsPanelOpenOnNarrow(false);
    },
    [applyItemUpdate, data.items, selectedItem]
  );

  const handleDismiss = useCallback(
    (item: NewsItemDto) => void decide(item, { reviewStatus: "dismissed" }, "Đã bỏ qua bài"),
    [decide]
  );

  const handleReopen = useCallback(
    (item: NewsItemDto) =>
      void decide(
        item,
        item.reviewStatus === "dismissed"
          ? { isSaved: false, reviewStatus: "published" }
          : { isSaved: false },
        "Đã đưa lại Chờ xử lý"
      ),
    [decide]
  );

  const handleUpdateTags = useCallback(
    async (item: NewsItemDto, tags: string[]) => {
      await applyItemUpdate(item.id, { tags }, "Đã cập nhật tag");
    },
    [applyItemUpdate]
  );

  const handleSaveNote = useCallback(
    async (item: NewsItemDto, personalNote: string | null) => {
      await applyItemUpdate(item.id, { personalNote }, "Đã lưu ghi chú");
    },
    [applyItemUpdate]
  );

  const handleReingest = useCallback(
    async (item: NewsItemDto) => {
      setReingestingId(item.id);
      try {
        await newsService.reingestNewsItem(item.id, true);
        await refreshFeed();
        toast("Đã xếp hàng phân tích sâu lại", "success");
      } catch (error) {
        toast(
          error instanceof Error ? error.message : "Không thể xếp hàng phân tích lại.",
          "error"
        );
      } finally {
        setReingestingId(null);
      }
    },
    [refreshFeed, toast]
  );

  const handleOpenExternal = useCallback(
    (item: NewsItemDto) => {
      if (item.reviewStatus !== "dismissed" && item.readState === "unread") {
        void applyItemUpdate(item.id, { readState: "read" }, undefined, { isBackground: true });
      }
    },
    [applyItemUpdate]
  );

  const handleSelectTag = useCallback(
    (clickedTag: string) => {
      void setTag(tag === clickedTag ? "" : clickedTag);
    },
    [setTag, tag]
  );

  const activeFilterCount = [origin, tag, sort !== "latest" ? sort : ""].filter(Boolean).length;
  const isTabView = TAB_VIEWS.some((tab) => tab.id === view);
  const emptyMessage =
    q || activeFilterCount > 0
      ? { title: "Không tìm thấy bài nào khớp bộ lọc", hint: "Đổi từ khoá hoặc xoá bộ lọc." }
      : (EMPTY_MESSAGES[view] ?? { title: "Chưa có bài nào ở đây", hint: "Đổi tab để xem bài khác." });

  const clearFilters = () => {
    void setOrigin("");
    void setTag("");
    void setSort("latest");
  };

  const chip = (isSelected: boolean) =>
    `inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer ${
      isSelected
        ? "bg-primary text-primary-foreground"
        : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className={`${isPanelVisible ? "hidden xl:block" : ""} shrink-0 border-b border-border bg-background`}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Link
            href="/"
            aria-label="Về Crisne"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="font-display text-2xl font-semibold leading-none text-foreground">News</h1>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <label className="relative hidden w-64 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => void setQ(e.target.value)}
                placeholder="Tìm tiêu đề, tag, domain"
                aria-label="Tìm kiếm bài tin"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              aria-label="Tìm"
              title="Tìm"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground md:hidden cursor-pointer"
            >
              <Search className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsSourcesOpen(true)}
              aria-label="Nguồn RSS"
              title="Nguồn RSS"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <Rss className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsPasteOpen(true)}
              aria-label="Thêm link"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Thêm link</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Danh sách tin"
          className={`${isPanelVisible ? "hidden xl:flex" : "flex"} w-full min-w-0 flex-col border-r border-border xl:w-[520px] xl:shrink-0`}
        >
          <div className="shrink-0 border-b border-border px-4 sm:px-5">
            <div className="flex items-center gap-3">
              <nav className="flex min-w-0 flex-1 gap-5 overflow-x-auto [scrollbar-width:none]" aria-label="Chế độ xem">
                {TAB_VIEWS.map((tab) => {
                  const isActive = view === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => void setView(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`relative inline-flex h-10 shrink-0 items-center gap-1.5 px-1 text-sm cursor-pointer ${
                        isActive
                          ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`text-xs tabular-nums ${
                          isActive ? "text-[var(--editorial-accent)]" : "text-muted-foreground"
                        }`}
                      >
                        {data.counts[tab.countKey]}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={() => setIsFilterOpen((open) => !open)}
                aria-expanded={isFilterOpen}
                aria-label="Lọc"
                title="Lọc theo nguồn, tag, thứ tự"
                className={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent hover:text-foreground cursor-pointer ${
                  isFilterOpen || activeFilterCount > 0 ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <SlidersHorizontal className="size-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--editorial-accent)]" />
                )}
              </button>
            </div>

            {isFilterOpen && (
              <div className="flex flex-col gap-2.5 border-t border-border py-3">
                <label className="relative block md:hidden">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => void setQ(e.target.value)}
                    placeholder="Tìm tiêu đề, tag, domain"
                    aria-label="Tìm kiếm bài tin trên di động"
                    className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ORIGIN_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => void setOrigin(opt.value)}
                      className={chip(origin === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void setSort(sort === "latest" ? "curated_first" : "latest")}
                    className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <ArrowUpDown className="size-3.5" />
                    {sort === "curated_first" ? "Ưu tiên tự chọn" : "Mới nhất"}
                  </button>
                </div>
                {data.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.tags.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => handleSelectTag(item.tag)}
                        className={chip(tag === item.tag)}
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
                    onClick={clearFilters}
                    className="inline-flex h-7 w-fit items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <X className="size-3.5" />
                    Xoá lọc
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!isTabView && (
              <div className="flex items-center justify-between gap-2 px-4 pt-3 text-sm sm:px-5">
                <span className="font-medium text-foreground">{EXTRA_VIEW_LABELS[view] ?? view}</span>
                <button
                  type="button"
                  onClick={() => void setView("inbox")}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Inbox className="size-3.5" />
                  Về Chờ xử lý
                </button>
              </div>
            )}

            {activeJobsCount > 0 && view !== "queue" && (
              <div className="px-4 pt-3 sm:px-5">
                <div className="flex items-center gap-2 rounded-lg bg-[var(--status-learning-bg)] px-3 py-2 text-xs text-[var(--status-learning)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{activeJobsCount} link đang được tóm tắt</span>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => void setView("queue")}
                    className="font-medium underline-offset-2 hover:underline cursor-pointer"
                  >
                    Xem hàng đợi
                  </button>
                </div>
              </div>
            )}

            {loadError && (
              <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-border bg-card p-4 sm:mx-5" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Không tải được danh sách tin</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{loadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshFeed({ showLoading: true })}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-accent cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  Thử lại
                </button>
              </div>
            )}

            {isLoading || isSwitchingView ? (
              <div className="px-4 sm:px-5">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="space-y-2.5 border-b border-border py-5">
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : data.items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-5" />
                </div>
                <h2 className="text-base font-semibold text-foreground">{emptyMessage.title}</h2>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">{emptyMessage.hint}</p>
                <button
                  type="button"
                  onClick={() => setIsPasteOpen(true)}
                  className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Thêm link
                </button>
              </div>
            ) : (
              data.items.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  isSelected={isPanelVisible && selectedItem?.id === item.id}
                  onSelect={handleSelectItem}
                />
              ))
            )}
          </div>
        </section>

        {isPanelVisible && selectedItem ? (
          <NewsReaderPanel
            key={selectedItem.id}
            item={selectedItem}
            duplicateTitle={
              selectedItem.possibleDuplicateOfId
                ? data.duplicateTitles[selectedItem.possibleDuplicateOfId]
                : undefined
            }
            isUpdating={busyItemId === selectedItem.id}
            isReingesting={reingestingId === selectedItem.id}
            onBack={() => setIsPanelOpenOnNarrow(false)}
            onToggleRead={handleToggleRead}
            onDismiss={handleDismiss}
            onReopen={handleReopen}
            onUpdateTags={handleUpdateTags}
            onSaveNote={handleSaveNote}
            onReingest={handleReingest}
            onOpenExternal={handleOpenExternal}
          />
        ) : data.items.length > 0 || isSwitchingView || isLoading ? (
          // Shown while the list or the wide-screen check is still settling, so the panel fades in
          <NewsReaderSkeleton />
        ) : (
          <div className="hidden flex-1 bg-card xl:block" />
        )}
      </div>

      <QuickPasteDialog
        open={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        onIngested={() => void refreshFeed()}
      />

      <SourcesManagerSheet
        open={isSourcesOpen}
        initialSources={initialSources}
        onClose={() => setIsSourcesOpen(false)}
        onChanged={() => void refreshFeed()}
      />
    </div>
  );
}
