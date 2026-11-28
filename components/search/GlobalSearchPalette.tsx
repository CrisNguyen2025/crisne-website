"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CornerDownLeft,
  FolderKanban,
  Loader2,
  Newspaper,
  Search,
  X,
} from "lucide-react";
import { useAnimatedPresence } from "@/hooks/use-animated-presence";
import { useBottomSheetDrag } from "@/hooks/use-bottom-sheet-drag";
import { useCanWrite } from "@/hooks/use-can-write";
import { Button } from "@/components/ui/button";
import { useMounted, useOverlay } from "@/components/ui/dialog";
import { LessonStatusBadge } from "@/components/roadmap/LessonStatus";
import { cn } from "@/lib/utils";
import {
  clearGlobalSearchCache,
  closeGlobalSearch,
  getCachedSearchResult,
  getGlobalSearchSnapshot,
  setCachedSearchResult,
  subscribeGlobalSearch,
  toggleGlobalSearch,
  useGlobalSearchOpen,
} from "@/lib/search/search-controller";
import {
  fetchGlobalSearch,
  type GlobalSearchResponseDto,
  type SearchScope,
  type SearchSnippet,
} from "@/logic/search/searchService";

const PALETTE_EXIT_MS = 160;
const SEARCH_DEBOUNCE_MS = 150;

const SCOPE_OPTIONS: { id: SearchScope; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "lessons", label: "Bài học" },
  { id: "news", label: "News" },
];

type FlatResultItem =
  | { kind: "topic"; key: string; href: string }
  | { kind: "lesson"; key: string; href: string }
  | { kind: "news"; key: string; href: string };

function isPaletteAllowedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/share")
  ) {
    return false;
  }
  return true;
}

function SnippetLine({ snippet }: { snippet: SearchSnippet | null }) {
  if (!snippet?.text) return null;
  const { text, highlightStart, highlightEnd } = snippet;
  if (highlightEnd <= highlightStart || highlightStart < 0 || highlightEnd > text.length) {
    return (
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{text}</p>
    );
  }
  return (
    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
      {text.slice(0, highlightStart)}
      <mark className="rounded bg-[var(--editorial-accent-soft)] px-0.5 font-medium text-[var(--editorial-accent)]">
        {text.slice(highlightStart, highlightEnd)}
      </mark>
      {text.slice(highlightEnd)}
    </p>
  );
}

export function GlobalSearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const canWrite = useCanWrite();
  const isMounted = useMounted();
  const isOpen = useGlobalSearchOpen();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [data, setData] = useState<GlobalSearchResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allowedOnPath = isPaletteAllowedPath(pathname);
  const effectiveOpen = canWrite && allowedOnPath && isOpen;

  const handleAfterClose = useCallback(() => {
    setQuery("");
    setScope("all");
    setError(null);
    setActiveIndex(0);
  }, []);

  const { shouldRender, isVisible } = useAnimatedPresence(
    effectiveOpen,
    PALETTE_EXIT_MS,
    handleAfterClose
  );

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    closeGlobalSearch();
  }, []);

  const { isExpanded, sheetRef, backdropRef, sheetTouchHandlers } = useBottomSheetDrag({
    open: effectiveOpen,
    onClose: handleClose,
  });

  useOverlay(effectiveOpen, handleClose);

  const runSearch = useCallback(
    async (nextQuery: string, nextScope: SearchScope) => {
      abortRef.current?.abort();
      const cached = getCachedSearchResult(nextQuery, nextScope);
      if (cached) {
        setData(cached);
        setIsLoading(false);
        setError(null);
        setActiveIndex(0);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetchGlobalSearch({
          q: nextQuery,
          scope: nextScope,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCachedSearchResult(nextQuery, nextScope, res);
        setData(res);
        setActiveIndex(0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Không thể tìm kiếm.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const scheduleSearch = useCallback(
    (nextQuery: string, nextScope: SearchScope, immediate = false) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (immediate || !nextQuery.trim()) {
        void runSearch(nextQuery, nextScope);
        return;
      }
      const cached = getCachedSearchResult(nextQuery, nextScope);
      if (cached) {
        setData(cached);
        setIsLoading(false);
        setError(null);
        setActiveIndex(0);
        return;
      }
      setIsLoading(true);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void runSearch(nextQuery, nextScope);
      }, SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  useEffect(() => {
    const handleUpdated = () => {
      clearGlobalSearchCache();
    };
    window.addEventListener("roadmap:updated", handleUpdated);
    return () => window.removeEventListener("roadmap:updated", handleUpdated);
  }, []);

  useEffect(() => {
    if (!canWrite || !allowedOnPath) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      toggleGlobalSearch();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowedOnPath, canWrite]);

  useEffect(() => {
    if (!canWrite || !allowedOnPath) return;
    return subscribeGlobalSearch(() => {
      if (!getGlobalSearchSnapshot()) return;
      setQuery("");
      setScope("all");
      setError(null);
      setActiveIndex(0);
      scheduleSearch("", "all", true);
    });
  }, [allowedOnPath, canWrite, scheduleSearch]);

  useEffect(() => {
    if (!effectiveOpen) return;
    if (window.matchMedia?.("(max-width: 639px)").matches) return;
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [effectiveOpen]);

  const flatItems = useMemo<FlatResultItem[]>(() => {
    if (!data) return [];
    const items: FlatResultItem[] = [];
    for (const topic of data.topics) {
      items.push({ kind: "topic", key: `topic:${topic.id}`, href: topic.href });
    }
    for (const lesson of data.lessons) {
      items.push({ kind: "lesson", key: `lesson:${lesson.id}`, href: lesson.href });
    }
    for (const news of data.news) {
      items.push({ kind: "news", key: `news:${news.id}`, href: news.href });
    }
    return items;
  }, [data]);

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, index) => map.set(item.key, index));
    return map;
  }, [flatItems]);

  const navigateTo = useCallback(
    (href: string, newTab = false) => {
      handleClose();
      if (newTab) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(href);
    },
    [handleClose, router]
  );

  useEffect(() => {
    if (!effectiveOpen || flatItems.length === 0) return;
    const active = flatItems[activeIndex];
    if (!active) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-search-key="${active.key}"]`
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, effectiveOpen, flatItems]);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    scheduleSearch(next, scope, false);
  };

  const handleScopeChange = (nextScope: SearchScope) => {
    setScope(nextScope);
    scheduleSearch(query, nextScope, true);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      return;
    }
    if (e.key === "Enter") {
      const target = flatItems[activeIndex] ?? flatItems[0];
      if (!target) return;
      e.preventDefault();
      navigateTo(target.href, e.metaKey || e.ctrlKey);
    }
  };

  if (!canWrite || !allowedOnPath || !shouldRender || !isMounted) {
    return null;
  }

  const hasResults = flatItems.length > 0;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-100 flex items-end justify-center sm:items-start sm:p-4 sm:pt-20",
        !effectiveOpen && "pointer-events-none"
      )}
      aria-hidden={!effectiveOpen || undefined}
    >
      <div
        ref={backdropRef}
        className={cn(
          "absolute inset-0 bg-foreground/40 sm:backdrop-blur-xs transition-opacity ease-out motion-reduce:transition-none",
          isVisible ? "opacity-100 duration-250" : "opacity-0 duration-200"
        )}
        onClick={effectiveOpen ? handleClose : undefined}
      />

      <div
        ref={sheetRef}
        role={effectiveOpen ? "dialog" : undefined}
        aria-modal={effectiveOpen ? "true" : undefined}
        aria-label="Tìm kiếm nhanh toàn workspace"
        {...sheetTouchHandlers}
        className={cn(
          "roadmap-theme relative flex w-full flex-col overflow-hidden border border-border bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground shadow-xl transition-[transform,opacity,height,max-height,border-radius] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:h-auto sm:max-h-128 sm:max-w-2xl sm:rounded-2xl sm:border sm:pt-0 sm:pb-0",
          isExpanded
            ? "h-dvh max-h-dvh rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)]"
            : "h-[82dvh] max-h-[90dvh] rounded-t-2xl",
          isVisible
            ? "translate-y-0 opacity-100 duration-300 sm:scale-100"
            : "translate-y-full opacity-0 duration-200 sm:translate-y-1 sm:scale-95"
        )}
      >
        <div
          data-sheet-handle
          className="shrink-0 touch-none select-none border-b border-border sm:hidden"
        >
          <div className="flex justify-center pt-2 pb-0.5" aria-hidden="true">
            <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Đóng"
              className="size-10 shrink-0 rounded-full text-muted-foreground"
              onClick={handleClose}
            >
              <X className="size-5" />
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-foreground">
              Tìm kiếm
            </h2>
            <span aria-hidden="true" className="size-10 shrink-0" />
          </div>
        </div>

        <div className="px-4 pt-3 pb-2 sm:p-0">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring sm:h-auto sm:rounded-none sm:border-0 sm:border-b sm:border-border sm:bg-transparent sm:px-4 sm:py-3 sm:focus-within:ring-0">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Tìm Topic, bài học, mục nội dung hoặc News…"
              aria-label="Tìm kiếm Topic, Bài học và News"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-sm"
            />
            {isLoading && (
              <Loader2
                className="size-4 shrink-0 animate-spin text-muted-foreground"
                aria-label="Đang tìm kiếm"
              />
            )}
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Xoá từ khoá"
                className="size-8 sm:size-6"
                onClick={() => {
                  handleQueryChange("");
                  inputRef.current?.focus();
                }}
              >
                <X className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Đóng tìm kiếm"
              className="hidden size-6 sm:inline-flex"
              onClick={handleClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div
          role="group"
          aria-label="Phạm vi tìm kiếm"
          className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2 sm:gap-1"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const isSelected = scope === opt.id;
            return (
              <Button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                variant={isSelected ? "secondary" : "ghost"}
                size="xs"
                className="h-8 px-2.5 sm:h-6 sm:px-2"
                onClick={() => handleScopeChange(opt.id)}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain px-2 py-2"
        >
          {error && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void runSearch(query, scope)}
              >
                Thử lại
              </Button>
            </div>
          )}

          {!error && data && !hasResults && !isLoading && (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                Không tìm thấy kết quả phù hợp
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Thử từ khoá khác, tìm không dấu hoặc đổi sang tab Tất cả.
              </p>
            </div>
          )}

          {!error && data && hasResults && (
            <div className="space-y-3">
              {data.topics.length > 0 && (
                <section aria-label="Topics">
                  <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Topics
                  </h3>
                  <ul className="space-y-0.5">
                    {data.topics.map((topic) => {
                      const key = `topic:${topic.id}`;
                      const idx = itemIndexMap.get(key) ?? -1;
                      const isActive = idx === activeIndex;
                      return (
                        <li key={topic.id}>
                          <Link
                            href={topic.href}
                            data-search-key={key}
                            data-active={isActive ? "true" : undefined}
                            onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                                handleClose();
                                return;
                              }
                              e.preventDefault();
                              navigateTo(topic.href);
                            }}
                            className={cn(
                              "flex min-h-11 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors sm:min-h-0 sm:py-2",
                              isActive
                                ? "bg-[var(--editorial-sidebar-active)]"
                                : "hover:bg-[var(--editorial-sidebar-hover)]"
                            )}
                          >
                            <FolderKanban
                              className="mt-0.5 size-4 shrink-0 text-[var(--editorial-accent)]"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {topic.title}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {topic.lessonCount} bài
                                </span>
                              </div>
                              <SnippetLine snippet={topic.snippet} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {data.lessons.length > 0 && (
                <section aria-label="Bài học">
                  <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {data.isZeroQuery ? "Đang theo dõi" : "Bài học"}
                  </h3>
                  <ul className="space-y-0.5">
                    {data.lessons.map((lesson) => {
                      const key = `lesson:${lesson.id}`;
                      const idx = itemIndexMap.get(key) ?? -1;
                      const isActive = idx === activeIndex;
                      return (
                        <li key={lesson.id}>
                          <Link
                            href={lesson.href}
                            data-search-key={key}
                            data-active={isActive ? "true" : undefined}
                            onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                                handleClose();
                                return;
                              }
                              e.preventDefault();
                              navigateTo(lesson.href);
                            }}
                            className={cn(
                              "flex min-h-11 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors sm:min-h-0 sm:py-2",
                              isActive
                                ? "bg-[var(--editorial-sidebar-active)]"
                                : "hover:bg-[var(--editorial-sidebar-hover)]"
                            )}
                          >
                            <BookOpen
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                  {lesson.title}
                                </span>
                                <LessonStatusBadge status={lesson.status} />
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {lesson.topicTitle}
                                {lesson.section ? ` › ${lesson.section}` : ""}
                                {lesson.matchedHeading ? ` · #${lesson.matchedHeading}` : ""}
                              </p>
                              <SnippetLine snippet={lesson.snippet} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {data.news.length > 0 && (
                <section aria-label="News">
                  <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    News
                  </h3>
                  <ul className="space-y-0.5">
                    {data.news.map((news) => {
                      const key = `news:${news.id}`;
                      const idx = itemIndexMap.get(key) ?? -1;
                      const isActive = idx === activeIndex;
                      return (
                        <li key={news.id}>
                          <Link
                            href={news.href}
                            data-search-key={key}
                            data-active={isActive ? "true" : undefined}
                            onMouseEnter={() => idx >= 0 && setActiveIndex(idx)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                                handleClose();
                                return;
                              }
                              e.preventDefault();
                              navigateTo(news.href);
                            }}
                            className={cn(
                              "flex min-h-11 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors sm:min-h-0 sm:py-2",
                              isActive
                                ? "bg-[var(--editorial-sidebar-active)]"
                                : "hover:bg-[var(--editorial-sidebar-hover)]"
                            )}
                          >
                            <Newspaper
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                  {news.title}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {news.domain}
                                </span>
                              </div>
                              <SnippetLine snippet={news.snippet} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="hidden items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:flex">
          <span>↑↓ di chuyển · Enter mở · ⌘Enter tab mới</span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" aria-hidden="true" />
            <span>Esc đóng</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
