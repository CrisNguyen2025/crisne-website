"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  ListTree,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
  LESSON_STATUS_LABEL,
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
import { useCanWrite } from "@/hooks/use-can-write";
import { Button } from "@/components/ui/button";
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
import {
  LessonStatusPicker,
  STATUS_ICON,
  STATUS_TRIGGER_TONE,
} from "./LessonStatus";
import { ProvenanceChips } from "./ProvenanceChip";
import { RelatedLessons } from "./RelatedLessons";
import { useLessonProvenance } from "./useLessonProvenance";
import { usePendingRoadmapRefresh } from "./usePendingRoadmapRefresh";
import { useTopicOwnerStatuses } from "./useTopicOwnerStatuses";

interface LessonStatusMenuProps {
  currentStatus: LessonStatus;
  onChangeStatus: (status: LessonStatus) => void;
}

/** Inline status trigger in the Lesson meta row opening the 3-status picker popover. */
function LessonStatusMenu({
  currentStatus,
  onChangeStatus,
}: LessonStatusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 150);

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

  const StatusIcon = STATUS_ICON[currentStatus];
  const label = LESSON_STATUS_LABEL[currentStatus];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Trạng thái: ${label}. Đổi trạng thái`}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "-ml-1.5 h-7 gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium cursor-pointer",
          STATUS_TRIGGER_TONE[currentStatus]
        )}
      >
        <StatusIcon className="size-3.5 shrink-0" aria-hidden={true} />
        <span>{label}</span>
        <ChevronDown className="size-3 opacity-70" aria-hidden="true" />
      </Button>

      {shouldRender && (
        <div
          aria-hidden={!isOpen || undefined}
          className={cn(
            "absolute left-0 top-full z-50 mt-1.5 w-52 origin-top-left rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
            isVisible
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0 pointer-events-none"
          )}
        >
          <LessonStatusPicker
            value={currentStatus}
            onChange={(next) => {
              onChangeStatus(next);
              setIsOpen(false);
            }}
            variant="list"
          />
        </div>
      )}
    </div>
  );
}

interface LessonMoreMenuProps {
  onOpenInfo: () => void;
  onDelete: () => void;
}

/** Compact "⋯" menu in the Lesson meta row for editing metadata or deleting the lesson. */
function LessonMoreMenu({ onOpenInfo, onDelete }: LessonMoreMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleAfterClose = useCallback(() => {
    setIsConfirmingDelete(false);
  }, []);

  const { shouldRender, isVisible } = useAnimatedPresence(
    isOpen,
    150,
    handleAfterClose
  );

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

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Thao tác bài học"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Thao tác bài học"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "cursor-pointer text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground",
          isOpen && "bg-[var(--editorial-sidebar-hover)] text-foreground"
        )}
      >
        <MoreHorizontal className="size-4" />
      </Button>

      {shouldRender && (
        <div
          role={isOpen ? "menu" : undefined}
          aria-label={isOpen ? "Thao tác bài học" : undefined}
          aria-hidden={!isOpen || undefined}
          className={cn(
            "absolute right-0 top-full z-50 mt-1.5 w-56 origin-top-right rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
            isVisible
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0 pointer-events-none"
          )}
        >
          <div className="flex flex-col gap-0.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
                onOpenInfo();
              }}
              className="h-auto min-h-9 w-full justify-start gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-[var(--editorial-sidebar-hover)] cursor-pointer"
            >
              <Edit3 className="size-4 shrink-0 text-muted-foreground" />
              <span>Sửa bài học</span>
            </Button>

            {isConfirmingDelete ? (
              <div className="mt-1 space-y-2 rounded-lg bg-muted p-2">
                <p className="text-xs font-medium text-foreground">
                  Xoá bài học này?
                </p>
                <p className="text-xs text-muted-foreground">
                  Hành động này không thể hoàn tác.
                </p>
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="cursor-pointer text-muted-foreground"
                  >
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      setIsOpen(false);
                      onDelete();
                    }}
                    className="cursor-pointer bg-destructive text-primary-foreground hover:bg-destructive/90"
                  >
                    Xoá
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsConfirmingDelete(true)}
                className="h-auto min-h-9 w-full justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              >
                <Trash2 className="size-4 shrink-0" />
                <span>Xoá bài học</span>
              </Button>
            )}
          </div>
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
          <Button
            type="button"
            size="lg"
            onMouseEnter={preloadLessonContentEditor}
            onFocus={preloadLessonContentEditor}
            onClick={onStartTemplate}
            className="cursor-pointer px-3"
          >
            <ListTree className="size-4" />
            <span>Soạn từ mẫu chuẩn</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onMouseEnter={preloadLessonContentEditor}
            onFocus={preloadLessonContentEditor}
            onClick={onStartBlank}
            className="cursor-pointer bg-card px-3"
          >
            <Edit3 className="size-4" />
            <span>Soạn tự do</span>
          </Button>
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

  const hasContent = Boolean(rendered.html);
  const contentActionLabel = hasContent ? "Sửa nội dung" : "Thêm nội dung";

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
                label: "Trước",
                title: prevLesson.title,
                onClick: () => handleLessonNavigate(prevLesson.id),
              }
            : {
                href: topicPath(topic.slug),
                label: "Trước",
                title: "Tổng quan",
              }
        }
        nextLink={
          nextLesson
            ? {
                href: lessonPath(topic.slug, nextLesson.slug || nextLesson.id),
                label: "Sau",
                title: nextLesson.title,
                onClick: () => handleLessonNavigate(nextLesson.id),
              }
            : undefined
        }
      >
        <header>
          <nav
            aria-label="Breadcrumb"
            className="mb-3 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            <Link
              href={topicPath(topic.slug)}
              prefetch={true}
              className="shrink-0 font-medium transition-colors hover:text-[var(--editorial-accent)]"
            >
              {topic.title}
            </Link>
            {lesson.section && (
              <>
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
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

          <h1 className="font-sans text-3xl font-semibold leading-tight tracking-tight text-foreground text-balance lg:text-4xl">
            {lesson.title}
          </h1>

          {lesson.description && (
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              {lesson.description}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border pb-5 text-xs text-muted-foreground">
            {canWrite && (
              <>
                <LessonStatusMenu
                  currentStatus={currentStatus}
                  onChangeStatus={handleChangeStatus}
                />
                <span aria-hidden="true">·</span>
              </>
            )}

            <span className="tabular-nums">
              {rendered.readingMinutes && rendered.readingMinutes > 0
                ? `${rendered.readingMinutes} phút đọc, cập nhật ${formatFriendlyTime(lesson.updatedAt)}`
                : `Cập nhật ${formatFriendlyTime(lesson.updatedAt)}`}
            </span>

            {canWrite && (
              <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onMouseEnter={preloadLessonContentEditor}
                  onFocus={preloadLessonContentEditor}
                  onClick={openContentEditor}
                  aria-label={contentActionLabel}
                  title={contentActionLabel}
                  className="cursor-pointer text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </Button>
                <LessonMoreMenu
                  onOpenInfo={() => setIsInfoOpen(true)}
                  onDelete={handleDeleteLesson}
                />
              </div>
            )}
          </div>
        </header>

        <div className="mt-7">
          {rendered.html ? (
            <div
              ref={setContentElement}
              onClick={handleContentClick}
              className="post-content-view editorial-prose prose dark:prose-invert max-w-none select-text [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20 [&_h4]:scroll-mt-20"
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
              <RelatedLessons
                relations={provenance.relations ?? []}
                isLoading={provenance.isLoading}
              />
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
