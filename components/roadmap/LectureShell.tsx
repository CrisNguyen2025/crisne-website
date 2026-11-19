"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, List, X } from "lucide-react";
import type { ContentHeading } from "@/lib/roadmap/content-utils";
import { splitSectionLabel } from "@/lib/roadmap/section-label";
import type { LessonStatus } from "@/lib/roadmap/status";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import {
  DesktopTocRail,
  MobileTocDropdown,
  TabletInlineToc,
  useActiveHeading,
} from "./LectureToc";

const STATUS_DOT: Record<LessonStatus, string> = {
  target: "bg-[var(--status-target)]",
  learning: "bg-[var(--status-learning)]",
  known: "",
};

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
          className="group flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-[var(--editorial-accent)]"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {prev.label}
          </span>
          <span className="mt-0.5 truncate text-sm font-medium text-[var(--editorial-accent)]">
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
          className="group flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 text-right transition-colors duration-150 hover:border-[var(--editorial-accent)]"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {next.label}
          </span>
          <span className="mt-0.5 truncate text-sm font-medium text-[var(--editorial-accent)]">
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
  /** Right rail on xl screens in place of "On this page", e.g. a Topic's lessons in focus */
  rail?: React.ReactNode;
  /** Shown under "On this page" in the xl right rail, e.g. a Lesson's Owner controls */
  railFooter?: React.ReactNode;
  sidebarHeaderAction?: React.ReactNode;
  isTransitioning?: boolean;
  articleDataAttributes?: {
    "data-roadmap-context"?: boolean;
    "data-roadmap-slug"?: string;
    "data-lesson-slug"?: string;
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
  railFooter,
  sidebarHeaderAction,
  isTransitioning = false,
  articleDataAttributes,
  onLessonNavigate,
  prevLink,
  nextLink,
  children,
}: LectureShellProps) {
  const scrollStorageKey = `roadmap:syllabus-scroll:${topic.slug}`;
  const syllabusAsideRef = useRef<HTMLElement>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sectionOverrides, setSectionOverrides] = useState<
    Record<string, SectionOverride>
  >({});
  const { activeHeadingId, jumpToHeading } = useActiveHeading(headings);

  useLayoutEffect(() => {
    const aside = syllabusAsideRef.current;
    if (!aside) return;
    try {
      const savedScroll = window.sessionStorage.getItem(scrollStorageKey);
      if (savedScroll !== null) {
        const parsed = Number(savedScroll);
        if (Number.isFinite(parsed) && parsed >= 0) {
          aside.scrollTop = parsed;
        }
      }
    } catch {}

    const targetSelector = activeLessonId
      ? `[data-lesson-nav-id="${activeLessonId}"]`
      : null;
    const activeEl = targetSelector
      ? aside.querySelector<HTMLElement>(targetSelector)
      : null;
    if (activeEl) {
      const asideRect = aside.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      if (
        itemRect.top < asideRect.top + 24 ||
        itemRect.bottom > asideRect.bottom - 24
      ) {
        activeEl.scrollIntoView({ block: "nearest" });
        try {
          window.sessionStorage.setItem(
            scrollStorageKey,
            String(aside.scrollTop)
          );
        } catch {}
      }
    }
  }, [activeView, activeLessonId, scrollStorageKey]);

  const persistSyllabusScroll = () => {
    const aside = syllabusAsideRef.current;
    if (!aside) return;
    try {
      window.sessionStorage.setItem(scrollStorageKey, String(aside.scrollTop));
    } catch {}
  };

  const handleToggleSection = (groupKey: string, buttonEl: HTMLElement) => {
    const willOpen = !isSectionExpanded(
      sectionOverrides,
      groupKey,
      defaultOpenSectionKey
    );
    setSectionOverrides((prev) =>
      toggleSectionOverride(prev, groupKey, defaultOpenSectionKey)
    );
    if (willOpen) {
      window.setTimeout(() => {
        const aside = syllabusAsideRef.current;
        if (!aside || !aside.contains(buttonEl)) {
          buttonEl.scrollIntoView({ block: "nearest" });
          return;
        }
        const asideRect = aside.getBoundingClientRect();
        const btnRect = buttonEl.getBoundingClientRect();
        if (
          btnRect.top < asideRect.top + 8 ||
          btnRect.bottom > asideRect.bottom - 8
        ) {
          buttonEl.scrollIntoView({ block: "nearest" });
        }
      }, 210);
    }
  };

  const handleSelectLesson = (
    lessonId: string,
    sectionKey: string,
    closeDrawer?: () => void
  ) => {
    persistSyllabusScroll();
    setSectionOverrides((prev) => {
      if (prev[sectionKey]?.open === false) {
        const next = { ...prev };
        delete next[sectionKey];
        return next;
      }
      return prev;
    });
    onLessonNavigate?.(lessonId);
    closeDrawer?.();
  };

  const isSingleUnscopedGroup =
    siblingGroups.length === 1 && siblingGroups[0].section === null;

  const renderLessonItems = (
    items: ChecklistItem[],
    sectionKey: string,
    closeDrawer?: () => void
  ) => (
    <ul className="space-y-0.5">
      {items.map((sib) => {
        const isActive = activeView === "lesson" && sib.id === activeLessonId;
        const sibStatus = canWrite ? ownerStatusById[sib.id] : undefined;
        const dotClass =
          sibStatus && sibStatus !== "known" ? STATUS_DOT[sibStatus] : "";
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
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.84375rem] leading-snug transition-colors duration-150 lg:py-1.5",
                isActive
                  ? "bg-[var(--editorial-sidebar-active)] font-semibold text-[var(--editorial-accent)]"
                  : "text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-[var(--editorial-accent)]"
              )}
            >
              {dotClass && (
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
                />
              )}
              <span className="line-clamp-2 flex-1">{sib.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const renderSidebarNavigation = (closeDrawer?: () => void) => (
    <nav aria-label="Bài học trong topic" className="space-y-1">
      {siblingGroups.length > 0 &&
        (isSingleUnscopedGroup ? (
          renderLessonItems(siblingGroups[0].items, "__none__", closeDrawer)
        ) : (
          <div className="space-y-1">
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
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={(e) =>
                      handleToggleSection(groupKey, e.currentTarget)
                    }
                    className="flex w-full items-start gap-1.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-[var(--editorial-sidebar-hover)] cursor-pointer lg:py-1.5"
                  >
                    <ChevronRight
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-90 text-foreground"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[0.8125rem] font-semibold leading-snug text-foreground/90">
                        {primary}
                      </span>
                      {sub && (
                        <span className="mt-0.5 block text-[0.6875rem] font-normal text-muted-foreground">
                          {sub}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                      {!isOpen && isCurrentSection && (
                        <span
                          aria-label="Mục đang đọc"
                          className="size-1.5 rounded-full bg-[var(--editorial-accent)]"
                        />
                      )}
                      <span className="text-[0.6875rem] font-normal tabular-nums text-muted-foreground/75">
                        {group.items.length}
                      </span>
                    </span>
                  </button>

                  <div
                    inert={!isOpen || undefined}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="mt-0.5 ml-2.5 border-l border-border/80 pl-2 pb-1.5">
                        {renderLessonItems(
                          group.items,
                          groupKey,
                          closeDrawer
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

  const renderSidebarHeader = (onClose?: () => void) => (
    <div className="shrink-0 border-b border-border/80 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        {onClose ? (
          <>
            <Link
              href="/"
              prefetch={true}
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--editorial-accent)]"
            >
              ← Topics
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle className="size-8 rounded-lg border border-border/70 bg-background/50 hover:bg-[var(--editorial-sidebar-hover)] [&_svg]:size-4" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng danh sách bài học"
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <Link
              href={topicPath(topic.slug)}
              prefetch={true}
              className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              title={topic.title}
            >
              {topic.title}
            </Link>
            <span className="text-[0.6875rem] tabular-nums text-muted-foreground/75 font-medium shrink-0">
              {siblingGroups.reduce((acc, g) => acc + g.items.length, 0)} bài
            </span>
          </>
        )}
      </div>

      {onClose && (
        <div className="mt-3 flex items-start justify-between gap-2">
          <Link
            href={topicPath(topic.slug)}
            prefetch={true}
            onClick={onClose}
            className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground transition-colors hover:text-[var(--editorial-accent)]"
          >
            {topic.title}
          </Link>
          {sidebarHeaderAction}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[90.5rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Mở danh sách bài học"
              className="inline-flex lg:hidden min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)] hover:text-[var(--editorial-accent)] cursor-pointer"
            >
              <List className="size-3.5" />
              <span>Bài học</span>
            </button>

            <nav aria-label="Topic navigation" className="flex items-center gap-2 min-w-0 text-xs sm:text-sm">
              <Link
                href="/"
                prefetch={true}
                className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-[var(--editorial-accent)]"
              >
                ← Topics
              </Link>
              <span className="text-muted-foreground/40" aria-hidden="true">
                /
              </span>
              <Link
                href={topicPath(topic.slug)}
                prefetch={true}
                className="truncate font-semibold tracking-tight text-foreground transition-colors hover:text-[var(--editorial-accent)]"
              >
                {topic.title}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="lg:hidden">
              <MobileTocDropdown
                headings={headings}
                activeHeadingId={activeHeadingId}
                onJump={jumpToHeading}
              />
            </div>
            {sidebarHeaderAction}
            <ThemeToggle className="size-8 rounded-lg border border-border/70 bg-background/50 hover:bg-[var(--editorial-sidebar-hover)] [&_svg]:size-4" />
          </div>
        </div>
      </header>

      <div className="w-full flex-1">
        <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[90.5rem]">
          <aside
            ref={syllabusAsideRef}
            onScroll={persistSyllabusScroll}
            className="hidden lg:flex lg:w-[18.75rem] shrink-0 sticky top-14 h-[calc(100dvh-3.5rem)] flex-col border-r border-border bg-[var(--editorial-sidebar)]"
          >
            {renderSidebarHeader()}
            <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3.5">
              {renderSidebarNavigation()}
            </div>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col">
            <main
              id="main-content"
              className="flex w-full flex-1 justify-center xl:justify-between gap-8 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 xl:gap-12 xl:px-12"
            >
              <article
                {...articleDataAttributes}
                className={cn(
                  "min-w-0 w-full max-w-[48rem] xl:max-w-[50rem] transition-opacity duration-150",
                  isTransitioning ? "opacity-65" : "opacity-100"
                )}
              >
                <TabletInlineToc
                  headings={headings}
                  activeHeadingId={activeHeadingId}
                  onJump={jumpToHeading}
                />

                {children}

                <LecturePager prev={prevLink} next={nextLink} />
              </article>

              {rail ? (
                <aside className="hidden xl:block w-[15.75rem] shrink-0">
                  <div className="sticky top-20 max-h-[calc(100dvh-6.5rem)] overflow-y-auto no-scrollbar">
                    {rail}
                  </div>
                </aside>
              ) : (
                <DesktopTocRail
                  headings={headings}
                  activeHeadingId={activeHeadingId}
                  onJump={jumpToHeading}
                  footer={railFooter}
                />
              )}
            </main>
          </div>
        </div>
      </div>

      <Sheet
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        side="left"
        label={topic.title}
        className="roadmap-theme max-w-[20rem] bg-[var(--editorial-sidebar)] p-0"
      >
        {renderSidebarHeader(() => setIsDrawerOpen(false))}
        <div className="flex-1 overflow-y-auto px-3 py-3.5">
          {renderSidebarNavigation(() => setIsDrawerOpen(false))}
        </div>
      </Sheet>
    </div>
  );
}
