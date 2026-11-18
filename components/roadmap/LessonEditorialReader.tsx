'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Edit3, List, Pencil, Trash2, X } from 'lucide-react';
import type { ContentHeading } from '@/lib/roadmap/content-utils';
import { contentToHtml, withHeadingIds } from '@/lib/roadmap/content-utils';
import { formatFriendlyTime } from '@/lib/roadmap/date-utils';
import { DEFAULT_LESSON_STATUS, type LessonStatus } from '@/lib/roadmap/status';
import type { ChecklistItem, RoadmapMeta, SectionGroup } from '@/lib/roadmap/types';
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  patchCachedOwnerStatus,
  setCachedOwnerStatuses,
} from '@/lib/roadmap/owner-status-cache';
import { clearPendingLessonWrite, peekPendingLessonWrite } from '@/lib/roadmap/pending-write';
import { splitSectionLabel } from '@/lib/roadmap/section-label';
import { useCanWrite } from '@/hooks/use-can-write';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/action-menu';
import { ImagePreview } from '@/components/ui/image-preview';
import { Sheet } from '@/components/ui/sheet';
import * as roadmapService from '@/logic/roadmap/roadmapService';
import { cn } from '@/lib/utils';
import { LessonStatusPicker } from './LessonStatus';
import { EditItemInfoDrawer, type EditItemInfoSubmitOptions } from './EditItemInfoDrawer';
import { EditItemContentDrawer } from './EditItemContentDrawer';

const STATUS_DOT: Record<LessonStatus, string> = {
  target: 'bg-[var(--status-target)]',
  learning: 'bg-[var(--status-learning)]',
  known: '',
};

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

  const scrollStorageKey = `roadmap:syllabus-scroll:${topic.slug}`;
  const activeSectionKey = lesson.section ?? '__none__';

  const syllabusAsideRef = useRef<HTMLElement>(null);
  const mobileTocRef = useRef<HTMLDetailsElement>(null);

  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [isSyllabusOpen, setIsSyllabusOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isContentOpen, setIsContentOpen] = useState<boolean>(() =>
    peekPendingLessonWrite(lesson.slug)
  );
  const [sectionOverride, setSectionOverride] = useState<{
    forLessonId: string;
    openKey: string | null;
  } | null>(null);
  const [pendingNav, setPendingNav] = useState<{ fromId: string; targetId: string } | null>(null);
  const [ownerStatusById, setOwnerStatusById] = useState<Record<string, LessonStatus>>(
    () => getCachedOwnerStatuses(topic.slug) ?? {}
  );
  const [optimisticContent, setOptimisticContent] = useState<{
    lessonId: string;
    raw: string;
  } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openSectionKey =
    sectionOverride && sectionOverride.forLessonId === lesson.id
      ? sectionOverride.openKey
      : activeSectionKey;

  useEffect(() => {
    clearPendingLessonWrite(lesson.slug);
  }, [lesson.slug]);

  const loadOwnerStatuses = useCallback(() => {
    if (!canWrite) return;
    roadmapService
      .fetchRoadmapBySlug(topic.slug, { mode: 'outline' })
      .then((data) => {
        const next: Record<string, LessonStatus> = {};
        for (const it of data.items) {
          if (it.status) next[it.id] = it.status;
        }
        setCachedOwnerStatuses(topic.slug, next);
        setOwnerStatusById(next);
      })
      .catch(() => {});
  }, [canWrite, topic.slug]);

  useEffect(() => {
    loadOwnerStatuses();
  }, [loadOwnerStatuses]);

  useEffect(() => {
    const handleUpdate = () => {
      invalidateCachedOwnerStatuses(topic.slug);
      router.refresh();
      loadOwnerStatuses();
    };
    window.addEventListener('roadmap:updated', handleUpdate);
    return () => window.removeEventListener('roadmap:updated', handleUpdate);
  }, [router, loadOwnerStatuses, topic.slug]);

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

    const activeEl = aside.querySelector<HTMLElement>(
      `[data-lesson-nav-id="${lesson.id}"]`
    );
    if (activeEl) {
      const asideRect = aside.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      if (itemRect.top < asideRect.top + 24 || itemRect.bottom > asideRect.bottom - 24) {
        activeEl.scrollIntoView({ block: 'nearest' });
        try {
          window.sessionStorage.setItem(scrollStorageKey, String(aside.scrollTop));
        } catch {}
      }
    }
  }, [lesson.id, scrollStorageKey]);

  const persistSyllabusScroll = () => {
    const aside = syllabusAsideRef.current;
    if (!aside) return;
    try {
      window.sessionStorage.setItem(scrollStorageKey, String(aside.scrollTop));
    } catch {}
  };

  const rendered = useMemo(() => {
    if (optimisticContent && optimisticContent.lessonId === lesson.id) {
      const rawHtml = optimisticContent.raw ? contentToHtml(optimisticContent.raw) : '';
      const { html, headings: nextHeadings } = withHeadingIds(rawHtml);
      return { html, headings: nextHeadings, rawContent: optimisticContent.raw };
    }
    return { html: processedHtml, headings, rawContent: lesson.content };
  }, [optimisticContent, lesson.id, lesson.content, processedHtml, headings]);

  useEffect(() => {
    if (rendered.headings.length === 0) return;
    const elements = rendered.headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveHeadingId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: 0.1 }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [rendered.headings]);

  const sectionNames = useMemo(
    () =>
      siblingGroups
        .map((g) => g.section)
        .filter((s): s is string => s !== null),
    [siblingGroups]
  );

  const activeItemId =
    pendingNav && pendingNav.fromId === lesson.id ? pendingNav.targetId : lesson.id;
  const isTransitioning = Boolean(
    pendingNav && pendingNav.fromId === lesson.id && pendingNav.targetId !== lesson.id
  );
  const currentStatus: LessonStatus = ownerStatusById[lesson.id] ?? DEFAULT_LESSON_STATUS;

  const handleToggleSection = (groupKey: string, buttonEl: HTMLElement) => {
    const nextKey = openSectionKey === groupKey ? null : groupKey;
    setSectionOverride({ forLessonId: lesson.id, openKey: nextKey });
    if (nextKey !== null) {
      window.setTimeout(() => {
        const aside = syllabusAsideRef.current;
        if (!aside || !aside.contains(buttonEl)) {
          buttonEl.scrollIntoView({ block: 'nearest' });
          return;
        }
        const asideRect = aside.getBoundingClientRect();
        const btnRect = buttonEl.getBoundingClientRect();
        if (btnRect.top < asideRect.top + 8 || btnRect.bottom > asideRect.bottom - 8) {
          buttonEl.scrollIntoView({ block: 'nearest' });
        }
      }, 210);
    }
  };

  const handleLessonNavigate = (targetId: string, onNavigate?: () => void) => {
    persistSyllabusScroll();
    if (targetId !== lesson.id) {
      setPendingNav({ fromId: lesson.id, targetId });
    }
    onNavigate?.();
  };

  const handleJumpHeading = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
      setActiveHeadingId(id);
    }
  };

  const handleChangeStatus = async (status: LessonStatus) => {
    const previous = currentStatus;
    setOwnerStatusById((prev) => ({ ...prev, [lesson.id]: status }));
    patchCachedOwnerStatus(topic.slug, lesson.id, status);
    try {
      await roadmapService.updateItemStatus(lesson.id, status);
      toast('Đã cập nhật trạng thái bài học', 'success');
    } catch {
      setOwnerStatusById((prev) => ({ ...prev, [lesson.id]: previous }));
      patchCachedOwnerStatus(topic.slug, lesson.id, previous);
      toast('Không cập nhật được trạng thái.', 'error');
    }
  };

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
    toast('Đã lưu thông tin bài học', 'success');
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
    if (updated?.slug && updated.slug !== lesson.slug) {
      router.replace(`/lessons/${updated.slug}`);
    } else {
      router.refresh();
    }
  };

  const handleSaveContent = async (id: string, nextContent: string) => {
    await roadmapService.updateItemContent({ id, content: nextContent });
    setOptimisticContent({ lessonId: id, raw: nextContent });
    toast('Đã lưu nội dung bài học', 'success');
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
    router.refresh();
  };

  const handleDeleteLesson = async () => {
    try {
      await roadmapService.deleteItem(lesson.id);
      invalidateCachedOwnerStatuses(topic.slug);
      toast(`Đã xoá bài "${lesson.title}"`, 'success');
      window.dispatchEvent(new CustomEvent('roadmap:updated'));
      router.push(`/topic/${topic.slug}`);
      router.refresh();
    } catch {
      toast('Không xoá được bài học.', 'error');
    }
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (img && img.src) {
      e.preventDefault();
      const imgs = Array.from(e.currentTarget.querySelectorAll('img'))
        .map((el) => el.src)
        .filter(Boolean);
      const clickedIndex = imgs.indexOf(img.src);
      setAllImages(imgs.length > 0 ? imgs : [img.src]);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setPreviewVisible(true);
    }
  };

  const renderLessonItems = (items: ChecklistItem[], onNavigate?: () => void) => (
    <ul className="space-y-0.5 border-l border-border/80 pl-2.5">
      {items.map((sib) => {
        const isActive = sib.id === activeItemId;
        const sibStatus = canWrite ? ownerStatusById[sib.id] : undefined;
        const dotClass = sibStatus && sibStatus !== 'known' ? STATUS_DOT[sibStatus] : '';
        return (
          <li key={sib.id}>
            <Link
              href={`/lessons/${sib.slug || sib.id}`}
              prefetch={true}
              data-lesson-nav-id={sib.id}
              onClick={() => handleLessonNavigate(sib.id, onNavigate)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-ml-[0.6875rem] flex items-center gap-2 border-l-2 py-1 pl-2.5 text-xs transition-colors duration-150',
                isActive
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              {dotClass && <span className={cn('size-1.5 shrink-0 rounded-full', dotClass)} />}
              <span className="line-clamp-2 flex-1">{sib.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const isSingleUnscopedGroup =
    siblingGroups.length === 1 && siblingGroups[0].section === null;

  const renderSyllabus = (onNavigate?: () => void) => {
    if (isSingleUnscopedGroup) {
      return (
        <div className="pl-1.5">
          {renderLessonItems(siblingGroups[0].items, onNavigate)}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {siblingGroups.map((group) => {
          const groupKey = group.section ?? '__none__';
          const isOpen = groupKey === openSectionKey;
          const isCurrentSection = groupKey === activeSectionKey;
          const { primary, sub } = splitSectionLabel(group.section);

          return (
            <div key={groupKey}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={(e) => handleToggleSection(groupKey, e.currentTarget)}
                className={cn(
                  'flex w-full items-start gap-1.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 cursor-pointer',
                  isOpen
                    ? 'bg-muted/65 font-medium text-foreground'
                    : isCurrentSection
                      ? 'bg-muted/35 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <ChevronRight
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                    isOpen && 'rotate-90 text-foreground'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-xs leading-snug">{primary}</span>
                  {sub && (
                    <span className="mt-0.5 block text-[0.6875rem] font-normal text-muted-foreground">
                      {sub}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  {!isOpen && isCurrentSection && (
                    <span aria-label="Mục đang học" className="size-1.5 rounded-full bg-foreground/75" />
                  )}
                  <span className="text-[0.6875rem] font-normal tabular-nums text-muted-foreground/75">
                    {group.items.length}
                  </span>
                </span>
              </button>

              <div
                inert={!isOpen || undefined}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                )}
              >
                <div className="overflow-hidden">
                  <div className="mt-1 ml-2.5 pb-1.5">
                    {renderLessonItems(group.items, onNavigate)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16 lg:pt-10"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)_12.5rem] items-start">
          <aside
            ref={syllabusAsideRef}
            onScroll={persistSyllabusScroll}
            className="hidden lg:block sticky top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar pr-2"
          >
            {renderSyllabus()}
          </aside>

          <article
            data-roadmap-context
            data-roadmap-slug={topic.slug}
            data-lesson-slug={lesson.slug}
            data-section={lesson.section ?? ''}
            className={cn(
              'min-w-0 w-full max-w-[65ch] transition-opacity duration-150',
              isTransitioning ? 'opacity-65' : 'opacity-100'
            )}
          >
            <header>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSyllabusOpen(true)}
                  aria-label="Mở danh sách bài học"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/90 bg-card px-2.5 py-1 text-xs font-medium text-foreground lg:hidden cursor-pointer"
                >
                  <List className="size-3.5" />
                  <span>Bài học</span>
                </button>

                <nav aria-label="Breadcrumb" className="min-w-0 truncate text-xs text-muted-foreground">
                  <Link
                    href={`/topic/${topic.slug}`}
                    prefetch={true}
                    className="font-medium transition-colors hover:text-foreground"
                  >
                    ← {topic.title}
                  </Link>
                  {lesson.section && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/50" aria-hidden="true">
                        /
                      </span>
                      <Link
                        href={`/topic/${topic.slug}?section=${encodeURIComponent(lesson.section)}`}
                        prefetch={true}
                        className="transition-colors hover:text-foreground"
                      >
                        {lesson.section}
                      </Link>
                    </>
                  )}
                </nav>
              </div>

              <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground leading-snug text-balance sm:text-3xl">
                {lesson.title}
              </h1>

              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                {lesson.readingMinutes && lesson.readingMinutes > 0
                  ? `${lesson.readingMinutes} phút · `
                  : ''}
                {formatFriendlyTime(lesson.updatedAt)}
              </p>

              {canWrite && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y border-border/80 py-2.5">
                  <LessonStatusPicker value={currentStatus} onChange={handleChangeStatus} />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsInfoOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/90 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground cursor-pointer"
                    >
                      <Pencil className="size-3" />
                      <span>Sửa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsContentOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
                    >
                      <Edit3 className="size-3" />
                      <span>{rendered.html ? 'Nội dung' : 'Thêm nội dung'}</span>
                    </button>
                    <ActionMenu
                      label="Thao tác bài học"
                      items={[
                        {
                          label: 'Xoá bài học',
                          icon: Trash2,
                          danger: true,
                          confirm: {
                            title: 'Xoá bài học này?',
                            description: 'Hành động này không thể hoàn tác.',
                            confirmLabel: 'Xoá',
                          },
                          onSelect: handleDeleteLesson,
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              {lesson.description && (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {lesson.description}
                </p>
              )}

              {rendered.headings.length >= 2 && (
                <details
                  ref={mobileTocRef}
                  className="xl:hidden group mt-5 rounded-xl border border-border/80 bg-muted/35 px-3.5 py-2.5 text-xs"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-foreground select-none [&::-webkit-details-marker]:hidden">
                    <span>Mục lục</span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
                      <span>{rendered.headings.length}</span>
                      <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
                    </span>
                  </summary>
                  <ul className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
                    {rendered.headings.map((h) => (
                      <li key={h.id} className={h.level === 3 ? 'pl-3' : ''}>
                        <a
                          href={`#${h.id}`}
                          onClick={(e) => {
                            handleJumpHeading(e, h.id);
                            if (mobileTocRef.current) mobileTocRef.current.open = false;
                          }}
                          className={cn(
                            'block py-0.5 leading-snug transition-colors',
                            activeHeadingId === h.id
                              ? 'font-medium text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </header>

            <div className="mt-6">
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
                      ? 'Chưa có nội dung chi tiết.'
                      : 'Nội dung cho bài học này đang được cập nhật.'}
                  </p>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setIsContentOpen(true)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
                    >
                      <Edit3 className="size-3.5" />
                      <span>Soạn nội dung</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {(prevLesson || nextLesson) && (
              <footer className="mt-12 grid grid-cols-2 gap-6 border-t border-border/80 pt-6 text-sm">
                {prevLesson ? (
                  <Link
                    href={`/lessons/${prevLesson.slug || prevLesson.id}`}
                    prefetch={true}
                    onClick={() => handleLessonNavigate(prevLesson.id)}
                    className="group min-w-0 py-1 text-left transition-colors"
                  >
                    <span className="block text-[0.6875rem] text-muted-foreground/75">
                      ← Bài trước
                    </span>
                    <span className="mt-0.5 block truncate font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {prevLesson.title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}

                {nextLesson ? (
                  <Link
                    href={`/lessons/${nextLesson.slug || nextLesson.id}`}
                    prefetch={true}
                    onClick={() => handleLessonNavigate(nextLesson.id)}
                    className="group min-w-0 py-1 text-right transition-colors"
                  >
                    <span className="block text-[0.6875rem] text-muted-foreground/75">
                      Bài tiếp →
                    </span>
                    <span className="mt-0.5 block truncate font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {nextLesson.title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
              </footer>
            )}
          </article>

          <aside className="hidden xl:block sticky top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar">
            {rendered.headings.length >= 2 && (
              <nav aria-label="Mục lục bài học">
                <p className="text-xs font-medium tracking-tight text-foreground">Mục lục</p>
                <ul className="mt-2.5 space-y-1.5 border-l border-border/80 text-xs">
                  {rendered.headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        onClick={(e) => handleJumpHeading(e, h.id)}
                        className={cn(
                          '-ml-[0.0625rem] block border-l-2 py-0.5 leading-snug transition-colors duration-150',
                          h.level === 3 ? 'pl-5' : 'pl-3',
                          activeHeadingId === h.id
                            ? 'border-foreground font-medium text-foreground'
                            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                        )}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>
        </div>
      </main>

      <Sheet
        open={isSyllabusOpen}
        onClose={() => setIsSyllabusOpen(false)}
        side="left"
        label={topic.title}
        className="roadmap-theme p-5 overflow-y-auto"
      >
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
          <span className="truncate text-sm font-semibold text-foreground">{topic.title}</span>
          <button
            type="button"
            onClick={() => setIsSyllabusOpen(false)}
            aria-label="Đóng"
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        {renderSyllabus(() => setIsSyllabusOpen(false))}
      </Sheet>

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
        onClose={() => setIsContentOpen(false)}
        onSubmit={handleSaveContent}
      />

      <ImagePreview
        src={allImages[currentImageIndex] || ''}
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
