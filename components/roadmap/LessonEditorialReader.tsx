"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, Info, ListTree, Trash2 } from "lucide-react";
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
import { useCanWrite } from "@/hooks/use-can-write";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ActionMenu } from "@/components/ui/action-menu";
import { ImagePreview } from "@/components/ui/image-preview";
import { useToast } from "@/components/ui/toast";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { EditItemContentDrawer } from "./EditItemContentDrawer";
import {
  EditItemInfoDrawer,
  type EditItemInfoSubmitOptions,
} from "./EditItemInfoDrawer";
import { LectureShell } from "./LectureShell";
import { LessonStatusPicker } from "./LessonStatus";
import { useTopicOwnerStatuses } from "./useTopicOwnerStatuses";

/** Tailwind `xl`: "On this page" moves to the right rail */
const XL_VIEWPORT_QUERY = "(min-width: 1280px)";

const OWNER_ACTION_CLASS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground cursor-pointer";

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
  const { ownerStatusById, setOptimisticStatus, invalidateStatuses } =
    useTopicOwnerStatuses(topic.slug, canWrite);

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
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", { detail: { skipRefresh: true } })
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

  // Owner controls sit right under "On this page": in the right rail on xl, at the top of the article below it
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

  // In the narrow rail, actions stack as full-width rows and the "…" menu moves to the heading row
  const renderOwnerControls = (inRail: boolean) => (
    <div className={inRail ? "w-full" : "mb-5"}>
      {inRail && (
        <div className="mb-1.5 flex items-center justify-between pl-2.5">
          <p className="text-[0.6875rem] text-muted-foreground">Trạng thái</p>
          {lessonActionMenu}
        </div>
      )}
      <LessonStatusPicker
        value={currentStatus}
        onChange={handleChangeStatus}
        variant={inRail ? "list" : "tabs"}
      />
      <div
        className={cn(
          inRail
            ? "mt-2 flex flex-col gap-0.5 border-t border-border pt-2"
            : "mt-2 flex items-center gap-1"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setDraftSeed(undefined);
            setIsContentOpen(true);
          }}
          className={cn(OWNER_ACTION_CLASS, inRail && "w-full")}
        >
          <Edit3 className="size-4" />
          <span>{rendered.html ? "Nội dung" : "Thêm nội dung"}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsInfoOpen(true)}
          className={cn(OWNER_ACTION_CLASS, inRail && "w-full")}
        >
          <Info className="size-4" />
          <span>Thông tin</span>
        </button>
        {!inRail && <div className="ml-auto">{lessonActionMenu}</div>}
      </div>
    </div>
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
        railFooter={canWrite && isXl ? renderOwnerControls(true) : undefined}
        isTransitioning={isTransitioning}
        articleDataAttributes={{
          "data-roadmap-context": true,
          "data-roadmap-slug": topic.slug,
          "data-lesson-slug": lesson.slug,
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
          {canWrite && !isXl && renderOwnerControls(false)}

          <nav
            aria-label="Breadcrumb"
            className="min-w-0 truncate text-xs text-muted-foreground"
          >
            <Link
              href={topicPath(topic.slug)}
              prefetch={true}
              className="font-medium transition-colors hover:text-[var(--editorial-accent)]"
            >
              {topic.title}
            </Link>
            {lesson.section && (
              <>
                <span
                  className="mx-1.5 text-muted-foreground/50"
                  aria-hidden="true"
                >
                  /
                </span>
                <Link
                  href={`${topicPath(topic.slug)}?section=${encodeURIComponent(lesson.section)}`}
                  prefetch={true}
                  className="transition-colors hover:text-[var(--editorial-accent)]"
                >
                  {lesson.section}
                </Link>
              </>
            )}
          </nav>

          <h1 className="mt-3 font-display text-[2rem] font-normal leading-[1.15] tracking-[-0.02em] text-foreground text-balance sm:text-[2.5rem]">
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
              onClick={handleContentClick}
              className="post-content-view editorial-prose prose dark:prose-invert max-w-none select-text [&_h2]:scroll-mt-16 [&_h3]:scroll-mt-16 [&_h4]:scroll-mt-16"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
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
                    onClick={() => {
                      setDraftSeed(DEFAULT_LESSON_TEMPLATE_HTML);
                      setIsContentOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
                  >
                    <ListTree className="size-4" />
                    <span>Soạn từ mẫu chuẩn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSeed(undefined);
                      setIsContentOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted cursor-pointer"
                  >
                    <Edit3 className="size-4" />
                    <span>Soạn tự do</span>
                  </button>
                </div>
              )}
            </div>
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
