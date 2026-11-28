"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  List,
  Newspaper,
  Search,
  X,
} from "lucide-react";
import type { ContentHeading } from "@/lib/roadmap/content-utils";
import { splitSectionLabel } from "@/lib/roadmap/section-label";
import {
  DEFAULT_LESSON_STATUS,
  LESSON_STATUS_LABEL,
  type LessonStatus,
} from "@/lib/roadmap/status";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { DesignMenu } from "@/components/design-menu";
import { useCollapseLeftNav, useIsAbotSidebarOpen } from "@/hooks/use-abot-sidebar";
import { NEWS_PATH } from "@/lib/news/paths";
import { openGlobalSearch } from "@/lib/search/search-controller";
import { cn, getScrollBehavior } from "@/lib/utils";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import { SidebarLessonToc, useActiveHeading } from "./LectureToc";
import { STATUS_ICON, STATUS_ICON_TONE } from "./LessonStatus";

export interface SectionOverride {
  open: boolean;
  whenDefaultWas: string | null;
}

export function isSectionExpanded(
  overrides: Record<string, boolean | SectionOverride>,
  groupKey: string,
  defaultOpenKey: string | null
): boolean {
  if (groupKey in overrides) {
    const entry = overrides[groupKey];
    if (typeof entry === "boolean") {
      return entry;
    }
    if (
      !entry.open &&
      defaultOpenKey !== null &&
      groupKey === defaultOpenKey &&
      entry.whenDefaultWas !== defaultOpenKey
    ) {
      return true;
    }
    return entry.open;
  }
  return defaultOpenKey !== null && groupKey === defaultOpenKey;
}

export function toggleSectionOverride(
  overrides: Record<string, boolean | SectionOverride>,
  groupKey: string,
  defaultOpenKey: string | null
): Record<string, SectionOverride> {
  const currentlyOpen = isSectionExpanded(overrides, groupKey, defaultOpenKey);
  const normalized: Record<string, SectionOverride> = {};
  for (const [k, v] of Object.entries(overrides)) {
    normalized[k] =
      typeof v === "boolean" ? { open: v, whenDefaultWas: defaultOpenKey } : v;
  }
  normalized[groupKey] = {
    open: !currentlyOpen,
    whenDefaultWas: defaultOpenKey,
  };
  return normalized;
}

export function preserveOpenSectionOverride(
  overrides: Record<string, SectionOverride>,
  defaultOpenKey: string | null
): Record<string, SectionOverride> {
  if (defaultOpenKey === null || defaultOpenKey in overrides) {
    return overrides;
  }
  return {
    ...overrides,
    [defaultOpenKey]: { open: true, whenDefaultWas: defaultOpenKey },
  };
}

const EMPTY_SECTION_OVERRIDES: Record<string, SectionOverride> = {};
const sectionOverridesCache = new Map<
  string,
  Record<string, SectionOverride>
>();
const sectionOverrideListeners = new Set<() => void>();

function subscribeSectionOverrides(listener: () => void) {
  sectionOverrideListeners.add(listener);
  return () => {
    sectionOverrideListeners.delete(listener);
  };
}

function getSectionOverridesSnapshot(
  storageKey: string
): Record<string, SectionOverride> {
  if (typeof window === "undefined") return EMPTY_SECTION_OVERRIDES;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      sectionOverridesCache.delete(storageKey);
      return EMPTY_SECTION_OVERRIDES;
    }
    const cached = sectionOverridesCache.get(storageKey);
    if (cached && JSON.stringify(cached) === raw) {
      return cached;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_SECTION_OVERRIDES;
    const next = parsed as Record<string, SectionOverride>;
    sectionOverridesCache.set(storageKey, next);
    return next;
  } catch {
    return EMPTY_SECTION_OVERRIDES;
  }
}

function setPersistedSectionOverrides(
  storageKey: string,
  next: Record<string, SectionOverride>
) {
  sectionOverridesCache.set(storageKey, next);
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
  for (const listener of sectionOverrideListeners) {
    listener();
  }
}

export interface LecturePagerLink {
  href: string;
  label: string;
  title: string;
  onClick?: () => void;
}

export function LecturePager({
  prev,
  next,
}: {
  prev?: LecturePagerLink;
  next?: LecturePagerLink;
}) {
  if (!prev && !next) return null;

  return (
    <footer className="mt-12 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-2 sm:gap-4">
      {prev ? (
        <Link
          href={prev.href}
          prefetch={true}
          onClick={prev.onClick}
          className="group flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card/60 px-3.5 py-3 text-left transition-colors hover:border-foreground/20 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-1"
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{prev.label}</span>
          </span>
          <span className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          prefetch={true}
          onClick={next.onClick}
          className="group flex min-w-0 flex-col items-start gap-1 rounded-xl border border-border bg-card/60 px-3.5 py-3 transition-colors hover:border-foreground/20 sm:items-end sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-1 sm:text-right"
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span>{next.label}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </span>
          <span className="max-w-full truncate text-sm font-medium text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
            {next.title}
          </span>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </footer>
  );
}

interface LectureShellProps {
  topic: RoadmapMeta;
  siblingGroups: SectionGroup[];
  activeView: "summary" | "lesson";
  activeLessonId?: string;
  defaultOpenSectionKey: string | null;
  canWrite: boolean;
  ownerStatusById: Record<string, LessonStatus>;
  headings: ContentHeading[];
  /** Right rail on xl screens for Topic summary view (e.g. Topic's lessons in focus) */
  rail?: React.ReactNode;
  collapseRightRail?: boolean;
  sidebarHeaderAction?: React.ReactNode;
  isTransitioning?: boolean;
  articleDataAttributes?: {
    "data-roadmap-context"?: boolean;
    "data-roadmap-slug"?: string;
    "data-roadmap-title"?: string;
    "data-lesson-slug"?: string;
    "data-lesson-title"?: string;
    "data-section"?: string;
  };
  onLessonNavigate?: (lessonId: string) => void;
  prevLink?: LecturePagerLink;
  nextLink?: LecturePagerLink;
  children: React.ReactNode;
}

export function LectureShell({
  topic,
  siblingGroups,
  activeView,
  activeLessonId,
  defaultOpenSectionKey,
  canWrite,
  ownerStatusById,
  headings,
  rail,
  collapseRightRail = false,
  sidebarHeaderAction,
  isTransitioning = false,
  articleDataAttributes,
  onLessonNavigate,
  prevLink,
  nextLink,
  children,
}: LectureShellProps) {
  const scrollStorageKey = `roadmap:syllabus-scroll:${topic.slug}`;
  const sectionsStorageKey = `roadmap:syllabus-sections:${topic.slug}`;
  const syllabusScrollRef = useRef<HTMLDivElement>(null);
  const drawerScrollRef = useRef<HTMLDivElement>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isAbotSidebarOpen = useIsAbotSidebarOpen();
  const collapseLeftNav = useCollapseLeftNav();
  const sectionOverrides = useSyncExternalStore(
    subscribeSectionOverrides,
    () => getSectionOverridesSnapshot(sectionsStorageKey),
    () => EMPTY_SECTION_OVERRIDES
  );
  const { activeHeadingId, jumpToHeading } = useActiveHeading(headings);

  useLayoutEffect(() => {
    const scrollEl = syllabusScrollRef.current;
    if (!scrollEl) return;
    try {
      const savedScroll = window.sessionStorage.getItem(scrollStorageKey);
      if (savedScroll !== null) {
        const parsed = Number(savedScroll);
        if (Number.isFinite(parsed) && parsed >= 0) {
          scrollEl.scrollTop = parsed;
        }
      }
    } catch {}

    const targetSelector = activeLessonId
      ? `[data-lesson-nav-id="${activeLessonId}"]`
      : null;
    const activeEl = targetSelector
      ? scrollEl.querySelector<HTMLElement>(targetSelector)
      : null;
    if (activeEl) {
      const containerRect = scrollEl.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      if (
        itemRect.top < containerRect.top + 24 ||
        itemRect.bottom > containerRect.bottom - 24
      ) {
        activeEl.scrollIntoView({ block: "nearest" });
        try {
          window.sessionStorage.setItem(
            scrollStorageKey,
            String(scrollEl.scrollTop)
          );
        } catch {}
      }
    }
  }, [activeView, activeLessonId, scrollStorageKey]);

  const persistSyllabusScroll = () => {
    const scrollEl = syllabusScrollRef.current;
    if (!scrollEl) return;
    try {
      window.sessionStorage.setItem(
        scrollStorageKey,
        String(scrollEl.scrollTop)
      );
    } catch {}
  };

  const persistSidebarState = () => {
    persistSyllabusScroll();
    const preserved = preserveOpenSectionOverride(
      sectionOverrides,
      defaultOpenSectionKey
    );
    if (preserved !== sectionOverrides) {
      setPersistedSectionOverrides(sectionsStorageKey, preserved);
    }
  };

  const handleToggleSection = (groupKey: string, buttonEl: HTMLElement) => {
    const willOpen = !isSectionExpanded(
      sectionOverrides,
      groupKey,
      defaultOpenSectionKey
    );
    const base = preserveOpenSectionOverride(
      sectionOverrides,
      defaultOpenSectionKey
    );
    const next = toggleSectionOverride(base, groupKey, defaultOpenSectionKey);
    setPersistedSectionOverrides(sectionsStorageKey, next);
    if (willOpen) {
      window.setTimeout(() => {
        const behavior = getScrollBehavior();
        const scrollEl = syllabusScrollRef.current;
        if (!scrollEl || !scrollEl.contains(buttonEl)) {
          buttonEl.scrollIntoView({ block: "nearest", behavior });
          return;
        }
        const containerRect = scrollEl.getBoundingClientRect();
        const btnRect = buttonEl.getBoundingClientRect();
        if (
          btnRect.top < containerRect.top + 8 ||
          btnRect.bottom > containerRect.bottom - 8
        ) {
          buttonEl.scrollIntoView({ block: "nearest", behavior });
        }
      }, 210);
    }
  };

  useEffect(() => {
    if (!isDrawerOpen || !activeLessonId) return;
    const rafId = window.requestAnimationFrame(() => {
      const container = drawerScrollRef.current;
      const activeEl = container?.querySelector<HTMLElement>(
        `[data-lesson-nav-id="${activeLessonId}"]`
      );
      activeEl?.scrollIntoView?.({ block: "center" });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isDrawerOpen, activeLessonId]);

  const handleSelectLesson = (
    lessonId: string,
    sectionKey: string,
    closeDrawer?: () => void
  ) => {
    persistSyllabusScroll();
    const base = preserveOpenSectionOverride(
      sectionOverrides,
      defaultOpenSectionKey
    );
    let next = base;
    if (next[sectionKey]?.open === false) {
      next = { ...next };
      delete next[sectionKey];
    }
    if (next !== sectionOverrides) {
      setPersistedSectionOverrides(sectionsStorageKey, next);
    }
    onLessonNavigate?.(lessonId);
    closeDrawer?.();
  };

  const isSingleUnscopedGroup =
    siblingGroups.length === 1 && siblingGroups[0].section === null;

  const renderLessonItems = (
    items: ChecklistItem[],
    sectionKey: string,
    closeDrawer?: () => void,
    density: "default" | "comfortable" = "default"
  ) => (
    <ul className="space-y-0.5">
      {items.map((sib) => {
        const isActive = activeView === "lesson" && sib.id === activeLessonId;
        const sibStatus = ownerStatusById[sib.id] ?? DEFAULT_LESSON_STATUS;
        const StatusIcon = STATUS_ICON[sibStatus];
        return (
          <li key={sib.id}>
            <Link
              href={lessonPath(topic.slug, sib.slug || sib.id)}
              prefetch={true}
              data-lesson-nav-id={sib.id}
              onClick={() =>
                handleSelectLesson(sib.id, sectionKey, closeDrawer)
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 text-sm font-medium leading-snug transition-colors duration-150 active:bg-[var(--editorial-sidebar-active)]",
                density === "comfortable"
                  ? "min-h-10 py-2"
                  : "min-h-8 py-1.5",
                isActive
                  ? "text-[var(--editorial-accent)]"
                  : "text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground"
              )}
            >
              {canWrite && (
                <StatusIcon
                  role="img"
                  aria-label={LESSON_STATUS_LABEL[sibStatus]}
                  className={cn(
                    "size-3.5 shrink-0",
                    STATUS_ICON_TONE[sibStatus]
                  )}
                />
              )}
              <span className="line-clamp-2 min-w-0 flex-1">{sib.title}</span>
            </Link>
            {isActive && (
              <SidebarLessonToc
                headings={headings}
                activeHeadingId={activeHeadingId}
                onJump={jumpToHeading}
                onAfterJump={closeDrawer}
                density={density}
              />
            )}
          </li>
        );
      })}
    </ul>
  );

  const totalLessonsCount = siblingGroups.reduce(
    (acc, g) => acc + g.items.length,
    0
  );
  const namedSectionsCount = siblingGroups.filter(
    (g) => g.section !== null
  ).length;

  const renderSidebarNavigation = (
    closeDrawer?: () => void,
    density: "default" | "comfortable" = "default"
  ) => (
    <nav aria-label="Bài học trong topic" className="space-y-2">
      {totalLessonsCount > 0 && (
        <p className="px-2 text-xs tabular-nums text-muted-foreground">
          {totalLessonsCount} bài
          {namedSectionsCount > 0 ? ` · ${namedSectionsCount} mục` : ""}
        </p>
      )}
      {totalLessonsCount === 0 && (
        <div className="px-2 py-8 text-center">
          <BookOpen
            aria-hidden="true"
            className="mx-auto mb-3 size-5 text-muted-foreground/60"
          />
          <p className="text-sm font-medium text-foreground/90">
            Chưa có bài học nào
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bài học của topic này sẽ hiện ở đây.
          </p>
        </div>
      )}
      {totalLessonsCount > 0 &&
        (isSingleUnscopedGroup ? (
          renderLessonItems(
            siblingGroups[0].items,
            "__none__",
            closeDrawer,
            density
          )
        ) : (
          <div className="space-y-3">
            {siblingGroups.map((group) => {
              const groupKey = group.section ?? "__none__";
              const isOpen = isSectionExpanded(
                sectionOverrides,
                groupKey,
                defaultOpenSectionKey
              );
              const isCurrentSection =
                activeView === "lesson" &&
                defaultOpenSectionKey !== null &&
                groupKey === defaultOpenSectionKey;
              const { primary, sub } = splitSectionLabel(group.section);

              return (
                <div key={groupKey}>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-expanded={isOpen}
                    onClick={(e) =>
                      handleToggleSection(groupKey, e.currentTarget)
                    }
                    className={cn(
                      "h-auto w-full items-start justify-start gap-1.5 rounded-lg px-2 text-left whitespace-normal hover:bg-[var(--editorial-sidebar-hover)] cursor-pointer",
                      density === "comfortable"
                        ? "min-h-10 py-2"
                        : "min-h-8 py-1.5"
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                        isOpen && "rotate-90 text-foreground"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-semibold leading-snug text-foreground">
                        {primary}
                      </span>
                      {sub && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {sub}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                      <span
                        aria-label={
                          !isOpen && isCurrentSection
                            ? "Mục đang đọc"
                            : undefined
                        }
                        aria-hidden={isOpen || !isCurrentSection || undefined}
                        className={cn(
                          "size-1.5 rounded-full transition-opacity duration-150",
                          !isOpen && isCurrentSection
                            ? "bg-[var(--editorial-accent)] opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">
                        {group.items.length}
                      </span>
                    </span>
                  </Button>

                  <div
                    inert={!isOpen || undefined}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="mt-0.5 pl-1 pb-1">
                        {renderLessonItems(
                          group.items,
                          groupKey,
                          closeDrawer,
                          density
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </nav>
  );

  const renderDrawerHeader = (onClose: () => void) => (
    <div className="shrink-0 border-b border-border px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={topicPath(topic.slug)}
          prefetch={true}
          onClick={onClose}
          className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:text-[var(--editorial-accent)]"
          title={topic.title}
        >
          {topic.title}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Đóng danh sách bài học"
          className="size-9 text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground cursor-pointer sm:size-7"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="sticky top-0 z-30 h-14 w-full border-b border-border bg-background">
        <div
          className={cn(
            "mx-auto flex h-full w-full items-center gap-2.5 px-4 sm:gap-3 sm:px-6",
            !isAbotSidebarOpen && "lg:px-8"
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Mở danh sách bài học"
            className={cn(
              "size-9 shrink-0 cursor-pointer sm:size-7",
              !collapseLeftNav && "lg:hidden"
            )}
          >
            <List className="size-4" />
          </Button>

          <Link
            href="/"
            prefetch={true}
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-[var(--editorial-accent)]"
          >
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
            >
              C
            </span>
            <span className="hidden sm:inline">Crisne</span>
          </Link>

          <span
            aria-hidden="true"
            className="hidden h-5 w-px shrink-0 bg-border sm:inline"
          />

          <Link
            href={topicPath(topic.slug)}
            prefetch={true}
            className="min-w-0 truncate text-sm font-medium text-foreground transition-colors hover:text-[var(--editorial-accent)]"
          >
            {topic.title}
          </Link>

          {canWrite && (
            <Button
              type="button"
              variant="outline"
              onClick={openGlobalSearch}
              aria-label="Tìm kiếm nhanh (Cmd+K)"
              className="ml-auto size-9 shrink-0 cursor-pointer justify-center bg-card px-0 text-sm font-normal text-muted-foreground sm:mx-auto sm:h-9 sm:w-full sm:max-w-sm sm:justify-start sm:px-3"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden truncate sm:inline">
                Tìm Lesson, News…
              </span>
              <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </Button>
          )}

          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5",
              !canWrite && "ml-auto"
            )}
          >
            <nav
              aria-label="Khu vực"
              className="hidden items-center gap-1 lg:flex"
            >
              <Link
                href="/"
                prefetch={true}
                aria-current="page"
                className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Topics
              </Link>
              <Link
                href={NEWS_PATH}
                prefetch={true}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Newspaper className="size-3.5" aria-hidden="true" />
                <span>News</span>
              </Link>
            </nav>
            <DesignMenu />
            {sidebarHeaderAction}
          </div>
        </div>
      </header>

      <div className="w-full flex-1 overflow-x-clip">
        <div className="flex min-h-[calc(100dvh-3.5rem)] w-full">
          {!collapseLeftNav && (
            <aside className="hidden lg:flex lg:w-66 shrink-0 sticky top-14 h-[calc(100dvh-3.5rem)] flex-col border-r border-border bg-[var(--editorial-sidebar)]">
              <div
                ref={syllabusScrollRef}
                onScroll={persistSyllabusScroll}
                className="flex-1 overflow-y-auto no-scrollbar px-3 py-6"
              >
                {renderSidebarNavigation()}
              </div>
            </aside>
          )}

          <div className="relative flex min-w-0 flex-1 flex-col">
            <main
              id="main-content"
              className={cn(
                "flex w-full flex-1 justify-center gap-10 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] xl:gap-12",
                isAbotSidebarOpen
                  ? "px-4 sm:px-6 lg:px-8"
                  : "px-4 sm:px-6 lg:px-10"
              )}
            >
              <article
                {...articleDataAttributes}
                aria-busy={isTransitioning || undefined}
                className={cn(
                  "min-w-0 w-full transition-opacity duration-200 ease-out motion-reduce:transition-none",
                  isAbotSidebarOpen ? "max-w-none" : "max-w-180",
                  isTransitioning ? "opacity-65" : "opacity-100"
                )}
              >
                {children}

                <LecturePager
                  prev={
                    prevLink
                      ? {
                          ...prevLink,
                          onClick: () => {
                            persistSidebarState();
                            prevLink.onClick?.();
                          },
                        }
                      : undefined
                  }
                  next={
                    nextLink
                      ? {
                          ...nextLink,
                          onClick: () => {
                            persistSidebarState();
                            nextLink.onClick?.();
                          },
                        }
                      : undefined
                  }
                />
              </article>

              {!collapseRightRail && rail && (
                <aside className="hidden xl:block w-64 shrink-0">
                  <div className="sticky top-20 max-h-[calc(100dvh-6.5rem)] overflow-y-auto no-scrollbar">
                    {rail}
                  </div>
                </aside>
              )}
            </main>
          </div>
        </div>
      </div>

      <Sheet
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        side="left"
        swipeToClose
        label={topic.title}
        className="roadmap-theme max-w-xs bg-[var(--editorial-sidebar)] p-0"
      >
        {renderDrawerHeader(() => setIsDrawerOpen(false))}
        <div
          ref={drawerScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
        >
          {renderSidebarNavigation(() => setIsDrawerOpen(false), "comfortable")}
        </div>
        <div className="shrink-0 border-t border-border px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            <Link
              href="/"
              prefetch={true}
              onClick={() => setIsDrawerOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)]"
            >
              Topics
            </Link>
            <Link
              href={NEWS_PATH}
              prefetch={true}
              onClick={() => setIsDrawerOpen(false)}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground"
            >
              <Newspaper className="size-4" aria-hidden="true" />
              <span>News</span>
            </Link>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
