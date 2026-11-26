"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Edit3, FileText, ListTree, MoreHorizontal, Trash2 } from "lucide-react";
import type { ContentHeading } from "@/lib/roadmap/content-utils";
import {
  contentToHtml,
  readingMinutes,
  withHeadingIds,
} from "@/lib/roadmap/content-utils";
import { formatFriendlyTime } from "@/lib/roadmap/date-utils";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import { DEFAULT_LESSON_TEMPLATE_HTML } from "@/lib/roadmap/lesson-template";
import { invalidateCachedOwnerStatuses } from "@/lib/roadmap/owner-status-cache";
import {
  clearPendingLessonWrite,
  markRoadmapRefreshPending,
  peekPendingLessonWrite,
} from "@/lib/roadmap/pending-write";
import {
  DEFAULT_LESSON_STATUS,
  LESSON_STATUS_SAVE_DELAY_MS,
  type LessonStatus,
} from "@/lib/roadmap/status";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import { cn } from "@/lib/utils";
import { useAnimatedPresence } from "@/hooks/use-animated-presence";
import { useCollapseRightRail } from "@/hooks/use-abot-sidebar";
import { useCanWrite } from "@/hooks/use-can-write";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ActionMenu } from "@/components/ui/action-menu";
import { ImagePreview } from "@/components/ui/image-preview";
import { useToast } from "@/components/ui/toast";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import {
  EditItemContentDrawer,
  preloadLessonContentEditor,
} from "./EditItemContentDrawer";
import {
  EditItemInfoDrawer,
  type EditItemInfoSubmitOptions,
} from "./EditItemInfoDrawer";
import { LectureShell } from "./LectureShell";
import { LessonSources } from "./LessonSources";
import { LessonStatusPicker } from "./LessonStatus";
import { ProvenanceChips } from "./ProvenanceChip";
import { RelatedLessons } from "./RelatedLessons";
import { useLessonProvenance } from "./useLessonProvenance";
import { usePendingRoadmapRefresh } from "./usePendingRoadmapRefresh";
import { useTopicOwnerStatuses } from "./useTopicOwnerStatuses";

/** Tailwind `xl`: "On this page" moves to the right rail */
const XL_VIEWPORT_QUERY = "(min-width: 1280px)";

const OWNER_ACTION_CLASS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground active:scale-[0.98] cursor-pointer";

const OWNER_EDITOR_ACTION_CLASS =
  "group inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-2xs transition-[border-color,background-color,transform] duration-150 hover:border-[var(--editorial-accent)]/50 hover:bg-[var(--editorial-sidebar-hover)] active:scale-[0.98] cursor-pointer";

interface LessonControlsPanelProps {
  currentStatus: LessonStatus;
  hasContent: boolean;
  headerAction?: React.ReactNode;
  footerAction?: React.ReactNode;
  onChangeStatus: (status: LessonStatus) => void;
  onOpenInfo: () => void;
  onOpenContent: () => void;
}

/** Vertical status + edit controls block shared between the desktop right rail and the mobile/tablet menu. */
function LessonControlsPanel({
  currentStatus,
  hasContent,
  headerAction,
  footerAction,
  onChangeStatus,
  onOpenInfo,
  onOpenContent,
}: LessonControlsPanelProps) {
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between pl-2.5">
        <p className="text-[0.6875rem] text-muted-foreground">Trạng thái</p>
        {headerAction}
      </div>
      <LessonStatusPicker
        value={currentStatus}
        onChange={onChangeStatus}
        variant="list"
      />
      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5">
        <button
          type="button"
          onClick={onOpenInfo}
          className={cn(OWNER_ACTION_CLASS, "w-full")}
        >
          <Edit3 className="size-4 shrink-0" />
          <span>Sửa bài học</span>
        </button>
        <button
          type="button"
          onMouseEnter={preloadLessonContentEditor}
          onFocus={preloadLessonContentEditor}
          onClick={onOpenContent}
          className={cn(OWNER_EDITOR_ACTION_CLASS, "w-full")}
        >
          <FileText className="size-4 shrink-0 text-[var(--editorial-accent)]" />
          <span>{hasContent ? "Nội dung" : "Thêm nội dung"}</span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-3.5 shrink-0 text-muted-foreground/70 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--editorial-accent)]"
          />
        </button>
      </div>
      {footerAction}
    </div>
  );
}

interface LessonOwnerMenuProps {
  currentStatus: LessonStatus;
  hasContent: boolean;
  onChangeStatus: (status: LessonStatus) => void;
  onOpenInfo: () => void;
  onOpenContent: () => void;
  onDelete: () => void;
  triggerClassName?: string;
}

/** Compact "⋯" menu on <xl viewports opening a popover mirroring the desktop right block. */
function LessonOwnerMenu({
  currentStatus,
  hasContent,
  onChangeStatus,
  onOpenInfo,
  onOpenContent,
  onDelete,
  triggerClassName,
}: LessonOwnerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleAfterClose = useCallback(() => {
    setIsConfirmingDelete(false);
  }, []);

  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 150, handleAfterClose);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) preloadLessonContentEditor();
      return next;
    });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Thao tác bài học"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Thao tác bài học"
        onClick={toggleMenu}
        className={cn(
          "inline-flex touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground active:scale-95 cursor-pointer",
          isOpen && "bg-[var(--editorial-sidebar-hover)] text-foreground",
          triggerClassName
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {shouldRender && (
        <div
          role={isOpen ? "menu" : undefined}
          aria-label={isOpen ? "Thao tác bài học" : undefined}
          aria-hidden={!isOpen || undefined}
          className={cn(
            "absolute right-0 top-full z-50 mt-1.5 w-64 origin-top-right rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
            isVisible
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0 pointer-events-none"
          )}
        >
          <LessonControlsPanel
            currentStatus={currentStatus}
            hasContent={hasContent}
            onChangeStatus={onChangeStatus}
            onOpenInfo={() => {
              setIsOpen(false);
              onOpenInfo();
            }}
            onOpenContent={() => {
              setIsOpen(false);
              onOpenContent();
            }}
            footerAction={
              <div className="mt-2.5 border-t border-border pt-2">
                {isConfirmingDelete ? (
                  <div className="space-y-2 rounded-lg bg-muted/50 p-2">
                    <p className="text-xs font-medium text-foreground">
                      Xoá bài học này?
                    </p>
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Hành động này không thể hoàn tác.
                    </p>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(false)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onDelete();
                        }}
                        className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-white transition-[background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.98] cursor-pointer"
                      >
                        Xoá
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-destructive transition-[background-color,transform] duration-150 hover:bg-destructive/10 active:scale-[0.99] cursor-pointer"
                  >
                    <Trash2 className="size-4 shrink-0" />
                    <span>Xoá bài học</span>
                  </button>
                )}
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

interface EmptyLessonPlaceholderProps {
  canWrite: boolean;
  onStartTemplate: () => void;
  onStartBlank: () => void;
}

function EmptyLessonPlaceholder({
  canWrite,
  onStartTemplate,
  onStartBlank,
}: EmptyLessonPlaceholderProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">
        {canWrite
          ? "Chưa có nội dung chi tiết."
          : "Nội dung cho bài học này đang được cập nhật."}
      </p>
      {canWrite && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onMouseEnter={preloadLessonContentEditor}
            onFocus={preloadLessonContentEditor}
            onClick={onStartTemplate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
          >
            <ListTree className="size-4" />
            <span>Soạn từ mẫu chuẩn</span>
          </button>
          <button
            type="button"
            onMouseEnter={preloadLessonContentEditor}
            onFocus={preloadLessonContentEditor}
            onClick={onStartBlank}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-150 hover:border-foreground/30 hover:bg-muted active:scale-[0.98] cursor-pointer"
          >
            <Edit3 className="size-4" />
            <span>Soạn tự do</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface LessonEditorialReaderProps {
  lesson: ChecklistItem;
  processedHtml: string;
  headings: ContentHeading[];
  topic: RoadmapMeta;
  siblingGroups: SectionGroup[];
  prevLesson?: { id: string; slug: string; title: string };
  nextLesson?: { id: string; slug: string; title: string };
  allTopics: RoadmapMeta[];
}

export function LessonEditorialReader({
  lesson,
  processedHtml,
  headings,
  topic,
  siblingGroups,
  prevLesson,
  nextLesson,
  allTopics,
}: LessonEditorialReaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const isXl = useMediaQuery(XL_VIEWPORT_QUERY);
  const collapseRightRail = useCollapseRightRail();
  const showDesktopRail = isXl && !collapseRightRail;
  usePendingRoadmapRefresh(lessonPath(topic.slug, lesson.slug));
  const { ownerStatusById, setOptimisticStatus, invalidateStatuses } =
    useTopicOwnerStatuses(topic.slug, canWrite, lesson.id);

  const activeSectionKey = lesson.section ?? "__none__";

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [draftSeed, setDraftSeed] = useState<string | undefined>(undefined);
  const [isContentOpen, setIsContentOpen] = useState<boolean>(() =>
    peekPendingLessonWrite(lesson.slug)
  );
  const [pendingNav, setPendingNav] = useState<{
    fromId: string;
    targetId: string;
  } | null>(null);
  const [optimisticContent, setOptimisticContent] = useState<{
    lessonId: string;
    raw: string;
    basedOnUpdatedAt: string;
  } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    clearPendingLessonWrite(lesson.slug);
  }, [lesson.slug]);

  const rendered = useMemo(() => {
    if (
      optimisticContent &&
      optimisticContent.lessonId === lesson.id &&
      optimisticContent.basedOnUpdatedAt === lesson.updatedAt
    ) {
      const rawHtml = optimisticContent.raw
        ? contentToHtml(optimisticContent.raw)
        : "";
      const { html, headings: nextHeadings } = withHeadingIds(rawHtml);
      return {
        html,
        headings: nextHeadings,
        rawContent: optimisticContent.raw,
        readingMinutes: readingMinutes(optimisticContent.raw),
      };
    }
    return {
      html: processedHtml,
      headings,
      rawContent: lesson.content,
      readingMinutes: lesson.readingMinutes ?? readingMinutes(lesson.content),
    };
  }, [
    optimisticContent,
    lesson.id,
    lesson.updatedAt,
    lesson.content,
    lesson.readingMinutes,
    processedHtml,
    headings,
  ]);

  // Provenance chips and sources are Owner-only and fetched on the client (ADR-0017)
  const provenance = useLessonProvenance(lesson.id, canWrite, rendered.rawContent);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);

  const sectionNames = useMemo(
    () =>
      siblingGroups
        .map((g) => g.section)
        .filter((s): s is string => s !== null),
    [siblingGroups]
  );

  const activeItemId =
    pendingNav && pendingNav.fromId === lesson.id
      ? pendingNav.targetId
      : lesson.id;
  const isTransitioning = Boolean(
    pendingNav &&
    pendingNav.fromId === lesson.id &&
    pendingNav.targetId !== lesson.id
  );
  const pendingStatusRef = useRef<{
    lessonId: string;
    status: LessonStatus;
    saved: LessonStatus;
    timer: number;
  } | null>(null);
  const currentStatus: LessonStatus =
    ownerStatusById[lesson.id] ?? DEFAULT_LESSON_STATUS;

  const handleLessonNavigate = (targetId: string) => {
    if (targetId !== lesson.id) {
      setPendingNav({ fromId: lesson.id, targetId });
    }
  };

  // The picker updates at once; the API gets only the last status of a burst of clicks
  const handleChangeStatus = (status: LessonStatus) => {
    const pending = pendingStatusRef.current;
    if (pending) window.clearTimeout(pending.timer);
    const saved =
      pending?.lessonId === lesson.id ? pending.saved : currentStatus;
    const lessonId = lesson.id;
    setOptimisticStatus(lessonId, status);

    const timer = window.setTimeout(async () => {
      pendingStatusRef.current = null;
      if (status === saved) return;
      try {
        await roadmapService.updateItemStatus(lessonId, status);
        toast("Đã cập nhật trạng thái bài học", "success");
      } catch {
        setOptimisticStatus(lessonId, saved);
        toast("Không cập nhật được trạng thái.", "error");
      }
    }, LESSON_STATUS_SAVE_DELAY_MS);
    pendingStatusRef.current = { lessonId, status, saved, timer };
  };

  // Leaving the lesson inside the delay still saves the last status
  useEffect(() => {
    return () => {
      const pending = pendingStatusRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingStatusRef.current = null;
      if (pending.status === pending.saved) return;
      roadmapService
        .updateItemStatus(pending.lessonId, pending.status)
        .catch(() => invalidateCachedOwnerStatuses(topic.slug));
    };
  }, [lesson.id, topic.slug]);

  const handleSaveInfo = async (
    id: string,
    title: string,
    description: string,
    section?: string | null,
    options?: EditItemInfoSubmitOptions
  ) => {
    const { item: updated } = await roadmapService.updateItemInfo({
      id,
      title,
      description,
      section,
      roadmapSlug: options?.roadmapSlug,
      slug: options?.slug,
    });
    if (options?.roadmapSlug && options.roadmapSlug !== topic.slug) {
      invalidateCachedOwnerStatuses(options.roadmapSlug);
    }
    // The URL holds both the Topic and the Lesson slug (ADR-0014), so moving the Lesson changes it too
    const nextSlug = updated?.slug || lesson.slug;
    const nextTopicSlug = options?.roadmapSlug || topic.slug;
    const urlChanged = nextSlug !== lesson.slug || nextTopicSlug !== topic.slug;
    toast("Đã lưu thông tin bài học", "success");
    if (urlChanged) {
      markRoadmapRefreshPending({
        originRouteKey: lessonPath(topic.slug, lesson.slug),
      });
    }
    window.dispatchEvent(
      new CustomEvent("roadmap:updated", {
        detail: { skipRefresh: urlChanged },
      })
    );
    if (urlChanged) {
      router.replace(lessonPath(nextTopicSlug, nextSlug));
    }
  };

  const handleSaveContent = async (id: string, nextContent: string) => {
    await roadmapService.updateItemContent({ id, content: nextContent });
    setOptimisticContent({
      lessonId: id,
      raw: nextContent,
      basedOnUpdatedAt: lesson.updatedAt,
    });
    toast("Đã lưu nội dung bài học", "success");
    window.dispatchEvent(new CustomEvent("roadmap:updated"));
  };

  const handleDeleteLesson = async () => {
    try {
      await roadmapService.deleteItem(lesson.id);
      invalidateStatuses();
      toast(`Đã xoá bài "${lesson.title}"`, "success");
      markRoadmapRefreshPending({
        deletedLessonId: lesson.id,
        originRouteKey: lessonPath(topic.slug, lesson.slug),
      });
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { skipRefresh: true, deletedLessonId: lesson.id },
        })
      );
      router.push(topicPath(topic.slug));
    } catch {
      toast("Không xoá được bài học.", "error");
    }
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest("img");
    if (img && img.src) {
      e.preventDefault();
      const imgs = Array.from(e.currentTarget.querySelectorAll("img"))
        .map((el) => el.src)
        .filter(Boolean);
      const clickedIndex = imgs.indexOf(img.src);
      setAllImages(imgs.length > 0 ? imgs : [img.src]);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setPreviewVisible(true);
    }
  };

  const openContentEditor = () => {
    setDraftSeed(undefined);
    setIsContentOpen(true);
  };

  // Owner controls sit right under "On this page" in the xl right rail; on <xl they live in the "⋯" menu
  const lessonActionMenu = (
    <ActionMenu
      label="Thao tác bài học"
      items={[
        {
          label: "Xoá bài học",
          icon: Trash2,
          danger: true,
          confirm: {
            title: "Xoá bài học này?",
            description: "Hành động này không thể hoàn tác.",
            confirmLabel: "Xoá",
          },
          onSelect: handleDeleteLesson,
        },
      ]}
    />
  );

  const desktopRailControls = (
    <LessonControlsPanel
      currentStatus={currentStatus}
      hasContent={Boolean(rendered.html)}
      headerAction={lessonActionMenu}
      onChangeStatus={handleChangeStatus}
      onOpenInfo={() => setIsInfoOpen(true)}
      onOpenContent={openContentEditor}
    />
  );

  const renderCompactOwnerMenu = (triggerClassName: string) => (
    <LessonOwnerMenu
      currentStatus={currentStatus}
      hasContent={Boolean(rendered.html)}
      onChangeStatus={handleChangeStatus}
      onOpenInfo={() => setIsInfoOpen(true)}
      onOpenContent={openContentEditor}
      onDelete={handleDeleteLesson}
      triggerClassName={triggerClassName}
    />
  );

  return (
    <>
      <LectureShell
        topic={topic}
        siblingGroups={siblingGroups}
        activeView="lesson"
        activeLessonId={activeItemId}
        defaultOpenSectionKey={activeSectionKey}
        canWrite={canWrite}
        ownerStatusById={ownerStatusById}
        headings={rendered.headings}
        railFooter={canWrite && showDesktopRail ? desktopRailControls : undefined}
        collapseRightRail={collapseRightRail}
        sidebarHeaderAction={
          canWrite && !showDesktopRail
            ? renderCompactOwnerMenu("size-9 border border-border/70 bg-card")
            : undefined
        }
        isTransitioning={isTransitioning}
        articleDataAttributes={{
          "data-roadmap-context": true,
          "data-roadmap-slug": topic.slug,
          "data-roadmap-title": topic.title,
          "data-lesson-slug": lesson.slug,
          "data-lesson-title": lesson.title,
          "data-section": lesson.section ?? "",
        }}
        onLessonNavigate={handleLessonNavigate}
        prevLink={
          prevLesson
            ? {
                href: lessonPath(topic.slug, prevLesson.slug || prevLesson.id),
                label: "Trang trước",
                title: prevLesson.title,
                onClick: () => handleLessonNavigate(prevLesson.id),
              }
            : {
                href: topicPath(topic.slug),
                label: "Trang trước",
                title: "Tổng quan",
              }
        }
        nextLink={
          nextLesson
            ? {
                href: lessonPath(topic.slug, nextLesson.slug || nextLesson.id),
                label: "Trang sau",
                title: nextLesson.title,
                onClick: () => handleLessonNavigate(nextLesson.id),
              }
            : undefined
        }
      >
        <header>
          <div className="hidden lg:flex items-center justify-between gap-3">
            <nav
              aria-label="Breadcrumb"
              className="min-w-0 flex items-center gap-1.5 truncate text-xs text-muted-foreground"
            >
              <Link
                href="/"
                prefetch={true}
                className="inline-flex shrink-0 items-center gap-1 font-medium transition-colors hover:text-[var(--editorial-accent)]"
              >
                <span>Topics</span>
              </Link>
              <span
                className="shrink-0 text-muted-foreground/50"
                aria-hidden="true"
              >
                /
              </span>
              <Link
                href={topicPath(topic.slug)}
                prefetch={true}
                className="shrink-0 font-medium transition-colors hover:text-[var(--editorial-accent)]"
              >
                {topic.title}
              </Link>
              {lesson.section && (
                <>
                  <span
                    className="shrink-0 text-muted-foreground/50"
                    aria-hidden="true"
                  >
                    /
                  </span>
                  <Link
                    href={`${topicPath(topic.slug)}?section=${encodeURIComponent(lesson.section)}`}
                    prefetch={true}
                    className="min-w-0 truncate transition-colors hover:text-[var(--editorial-accent)]"
                  >
                    {lesson.section}
                  </Link>
                </>
              )}
            </nav>

            {canWrite && !showDesktopRail && (
              <div className={collapseRightRail ? undefined : "xl:hidden"}>
                {renderCompactOwnerMenu("size-8")}
              </div>
            )}
          </div>

          <h1 className="font-display text-[2rem] font-normal leading-[1.15] tracking-[-0.02em] text-foreground text-balance sm:text-[2.5rem] lg:mt-3">
            {lesson.title}
          </h1>

          <p className="mt-2.5 text-xs tabular-nums text-muted-foreground">
            {rendered.readingMinutes && rendered.readingMinutes > 0
              ? `${rendered.readingMinutes} phút · `
              : ""}
            {formatFriendlyTime(lesson.updatedAt)}
          </p>

          {lesson.description && (
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted-foreground">
              {lesson.description}
            </p>
          )}
        </header>

        <div className="mt-7">
          {rendered.html ? (
            <div
              ref={setContentElement}
              onClick={handleContentClick}
              className="post-content-view editorial-prose prose dark:prose-invert max-w-none select-text [&_h2]:scroll-mt-16 [&_h3]:scroll-mt-16 [&_h4]:scroll-mt-16"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
            <EmptyLessonPlaceholder
              canWrite={canWrite}
              onStartTemplate={() => {
                setDraftSeed(DEFAULT_LESSON_TEMPLATE_HTML);
                setIsContentOpen(true);
              }}
              onStartBlank={() => {
                setDraftSeed(undefined);
                setIsContentOpen(true);
              }}
            />
          )}
          {canWrite && (
            <>
              <ProvenanceChips
                container={contentElement}
                provenances={provenance.provenances}
              />
              <RelatedLessons relations={provenance.relations ?? []} />
              <LessonSources sources={provenance.orphans} />
            </>
          )}
        </div>
      </LectureShell>

      <EditItemInfoDrawer
        isOpen={isInfoOpen}
        item={lesson}
        sections={sectionNames}
        topics={allTopics}
        currentTopicSlug={topic.slug}
        onClose={() => setIsInfoOpen(false)}
        onSubmit={handleSaveInfo}
      />

      <EditItemContentDrawer
        isOpen={isContentOpen}
        item={{ ...lesson, content: rendered.rawContent }}
        initialDraftContent={draftSeed}
        onClose={() => {
          setIsContentOpen(false);
          setDraftSeed(undefined);
        }}
        onSubmit={handleSaveContent}
      />

      <ImagePreview
        src={allImages[currentImageIndex] || ""}
        alt={lesson.title}
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        images={allImages.map((src) => ({ src, alt: lesson.title }))}
        currentIndex={currentImageIndex}
        onIndexChange={setCurrentImageIndex}
      />
    </>
  );
}
