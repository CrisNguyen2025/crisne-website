'use client';

import { SECTIONS_ENABLED } from './sectionsEnabled';
import React, { useState, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  History,
  Folder,
  Pencil,
  Edit3,
  Trash2,
} from 'lucide-react';
import { ChecklistItem } from '@/lib/roadmap/types';
import { formatFriendlyTime } from '@/lib/roadmap/date-utils';
import { contentToHtml, readingMinutes, withHeadingIds } from '@/lib/roadmap/content-utils';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/action-menu';
import { ImagePreview } from '@/components/ui/image-preview';
import { EditItemContentDrawer } from './EditItemContentDrawer';
import { EditItemInfoDrawer } from './EditItemInfoDrawer';
import { LessonStatusPicker } from './LessonStatus';
import type { LessonStatus } from '@/lib/roadmap/status';

interface DetailPanelProps {
  item: ChecklistItem | null;
  /** The topic's sections, offered when a lesson moves */
  sections?: string[];
  isLoading?: boolean;
  canWrite?: boolean;
  prevLesson?: { id: string; title: string };
  nextLesson?: { id: string; title: string };
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  onBack?: () => void;
  onUpdateNote?: (id: string, text: string) => void;
  onEditItem?: (id: string, title: string, description: string, section?: string | null) => void;
  onDeleteItem?: (id: string) => Promise<void>;
  onChangeStatus?: (id: string, status: LessonStatus) => void;
}

function DetailContent({
  item,
  sections = [],
  canWrite = false,
  prevLesson,
  nextLesson,
  onSelectPrev,
  onSelectNext,
  onBack,
  onUpdateNote,
  onEditItem,
  onDeleteItem,
  onChangeStatus,
}: {
  item: ChecklistItem;
  sections?: string[];
  canWrite?: boolean;
  prevLesson?: { id: string; title: string };
  nextLesson?: { id: string; title: string };
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  onBack?: () => void;
  onUpdateNote?: (id: string, text: string) => void;
  onEditItem?: (id: string, title: string, description: string, section?: string | null) => void;
  onDeleteItem?: (id: string) => Promise<void>;
  onChangeStatus?: (id: string, status: LessonStatus) => void;
}) {
  const { toast } = useToast();
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (img && img.src) {
      e.preventDefault();
      const container = e.currentTarget;
      const imgs = Array.from(container.querySelectorAll('img'))
        .map((el) => el.src)
        .filter(Boolean);
      const clickedIndex = imgs.indexOf(img.src);

      setAllImages(imgs.length > 0 ? imgs : [img.src]);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setPreviewVisible(true);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    setShowScrollTop(currentScrollTop > 240);
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const itemContent = item.content;
  const { processedHtml, headings } = useMemo(() => {
    if (!itemContent) return { processedHtml: '', headings: [] };
    const rawHtml = contentToHtml(itemContent);
    const { html, headings: list } = withHeadingIds(rawHtml);
    return { processedHtml: html, headings: list };
  }, [itemContent]);

  const mins = useMemo(() => readingMinutes(itemContent), [itemContent]);

  const handleSaveInfo = async (id: string, title: string, description: string, section?: string | null) => {
    try {
      if (onEditItem) {
        await onEditItem(id, title, description, section);
      }
      toast('Info updated successfully!', 'success');
    } catch {
      toast('Failed to update info, please try again!', 'error');
      throw new Error('Failed to update info');
    }
  };

  const handleSaveContent = async (id: string, newContent: string) => {
    try {
      if (onUpdateNote) {
        await onUpdateNote(id, newContent);
      }
      toast('Content saved successfully!', 'success');
    } catch {
      toast('Failed to save content, please try again!', 'error');
      throw new Error('Failed to save content');
    }
  };

  return (
    <div className="flex-1 relative h-full flex flex-col overflow-hidden bg-card">
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 flex flex-col h-full overflow-y-auto scrollbar-thin">
        {/* Header Toolbar */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border bg-card/80 backdrop-blur-md shrink-0 min-h-[57px]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium min-w-0 flex-1 truncate">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to lessons list"
                className="lg:hidden flex items-center gap-1 px-2.5 py-1.5 -ml-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted active:scale-95 transition-all cursor-pointer shrink-0 font-medium text-xs border border-border/50 bg-background/50 shadow-2xs"
              >
                <ChevronLeft className="size-4" />
                <span>Lessons</span>
              </button>
            )}

            {SECTIONS_ENABLED && <span className="truncate">{item.section || 'Chung'}</span>}
          </div>

          {canWrite && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Edit lesson title and description"
              >
                <Pencil className="size-3.5 text-primary" />
                <span>Edit</span>
              </button>

              <ActionMenu
                label="Lesson actions"
                items={[
                  {
                    label: item.content ? 'Edit content' : 'Add content',
                    icon: Edit3,
                    onSelect: () => setIsContentModalOpen(true),
                  },
                  ...(onDeleteItem
                    ? [
                        {
                          label: 'Delete lesson',
                          icon: Trash2,
                          danger: true,
                          confirm: {
                            title: 'Delete lesson?',
                            description: 'This action cannot be undone.',
                            confirmLabel: 'Delete',
                          },
                          onSelect: async () => {
                            const itemTitle = item.title;
                            try {
                              await onDeleteItem(item.id);
                              toast(`Deleted lesson "${itemTitle}"`, 'success');
                            } catch {
                              toast('Failed to delete lesson, please try again!', 'error');
                            }
                          },
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}
        </div>

        {/* Reader Container */}
        <div className="pb-[max(4.5rem,calc(3rem+env(safe-area-inset-bottom)))] pt-4 md:pt-6 space-y-6 max-w-[92%] md:max-w-[85%] w-full mx-auto">
          <article className="space-y-5">
            {/* Meta & Title */}
            <header className="space-y-3 select-text">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {item.section || 'Bài học'}
                </span>
                {mins > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3 text-primary/80" />
                    {mins} min read
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <History className="size-3 text-emerald-500/80" />
                  Updated {formatFriendlyTime(item.updatedAt)}
                </span>
              </div>

              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-snug">
                {item.title}
              </h1>

              {item.description && (
                <p className="text-sm leading-relaxed text-muted-foreground font-normal">
                  {item.description}
                </p>
              )}
            </header>

            {canWrite && item.status && onChangeStatus && (
              <LessonStatusPicker
                value={item.status}
                onChange={(status) => onChangeStatus(item.id, status)}
              />
            )}

            {/* Table of Contents (shown when 2 or more headings exist) */}
            {headings.length >= 2 && (
              <nav className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs">
                <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  On this page
                </p>
                <ul className="space-y-1.5">
                  {headings.map((h) => (
                    <li key={h.id} className={h.level === 3 ? 'pl-3' : ''}>
                      <a
                        href={`#${h.id}`}
                        className="text-muted-foreground hover:text-foreground hover:underline transition-colors block truncate"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* Content or Empty State */}
            {processedHtml ? (
              <div className="relative group pt-2">
                <div
                  onClick={handleContentClick}
                  className="post-content-view prose prose-sm dark:prose-invert max-w-none text-foreground/90 select-text leading-relaxed tracking-normal [&_h2]:scroll-mt-16 [&_h3]:scroll-mt-16"
                  dangerouslySetInnerHTML={{ __html: processedHtml }}
                />
              </div>
            ) : (
              <div className="py-12 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center text-center bg-muted/10">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Edit3 className="size-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  No detailed notes yet
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  {canWrite
                    ? 'Add comprehensive documentation, code examples, callouts, and links.'
                    : 'Notes for this lesson have not been written yet.'}
                </p>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setIsContentModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <Edit3 className="size-3.5" />
                    <span>Start writing</span>
                  </button>
                )}
              </div>
            )}

            {/* Navigation Footer (Prev / Next) */}
            {(prevLesson || nextLesson) && (
              <footer className="mt-10 pt-6 border-t border-border/70 flex flex-col sm:flex-row items-stretch justify-between gap-3">
                {prevLesson ? (
                  <button
                    type="button"
                    onClick={onSelectPrev}
                    className="group flex flex-1 flex-col items-start gap-1 p-3.5 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 active:scale-[0.99] transition-all text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium">
                      <ChevronLeft className="size-3.5" /> Previous lesson
                    </span>
                    <span className="text-sm font-semibold text-foreground line-clamp-1">
                      {prevLesson.title}
                    </span>
                  </button>
                ) : (
                  <div className="hidden sm:flex flex-1" />
                )}

                {nextLesson ? (
                  <button
                    type="button"
                    onClick={onSelectNext}
                    className="group flex flex-1 flex-col items-end gap-1 p-3.5 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 active:scale-[0.99] transition-all text-right cursor-pointer"
                  >
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium">
                      Next lesson <ChevronRight className="size-3.5" />
                    </span>
                    <span className="text-sm font-semibold text-foreground line-clamp-1">
                      {nextLesson.title}
                    </span>
                  </button>
                ) : (
                  <div className="hidden sm:flex flex-1" />
                )}
              </footer>
            )}
          </article>
        </div>
      </div>

      {/* Drawer: Notion Editor */}
      <EditItemContentDrawer
        isOpen={isContentModalOpen}
        item={item}
        onClose={() => setIsContentModalOpen(false)}
        onSubmit={handleSaveContent}
      />

      {/* Drawer: Title / Description / Group */}
      <EditItemInfoDrawer
        isOpen={isInfoModalOpen}
        item={item}
        sections={sections}
        onClose={() => setIsInfoModalOpen(false)}
        onSubmit={handleSaveInfo}
      />

      {/* Image Preview Modal */}
      <ImagePreview
        src={allImages[currentImageIndex] || ''}
        alt="Lesson image"
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        images={allImages.map((src) => ({ src, alt: 'Lesson image' }))}
        currentIndex={currentImageIndex}
        onIndexChange={setCurrentImageIndex}
      />

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ChevronUp className="size-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}

export function DetailPanel({
  item,
  sections = [],
  isLoading = false,
  canWrite = false,
  prevLesson,
  nextLesson,
  onSelectPrev,
  onSelectNext,
  onBack,
  onUpdateNote,
  onEditItem,
  onDeleteItem,
  onChangeStatus,
}: DetailPanelProps) {
  if (isLoading) {
    return (
      <div className="flex-1 relative h-full flex flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50 bg-background/80 shrink-0 min-h-[57px]">
          <div className="flex items-center gap-2 w-1/3">
            <div className="size-4 rounded bg-muted/60" />
            <div className="h-3.5 w-24 rounded bg-muted/60" />
            <div className="h-3.5 w-16 rounded bg-muted/40" />
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-6 max-w-[90%] md:max-w-[85%] w-full mx-auto">
          <div className="space-y-3">
            <div className="h-8 w-2/3 rounded-xl bg-muted/60" />
            <div className="h-4 w-5/6 rounded-lg bg-muted/40" />
            <div className="h-4 w-1/2 rounded-lg bg-muted/30" />
          </div>
          <div className="w-full border-t border-border/40 my-4" />
          <div className="space-y-3 pt-2">
            <div className="h-4 w-28 rounded-md bg-muted/50" />
            <div className="h-36 w-full rounded-2xl border border-border/40 bg-muted/20" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full bg-card relative">
        <div className="size-12 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-3">
          <Folder className="size-6 text-muted-foreground/60" />
        </div>
        <h3 className="font-semibold text-sm text-foreground mb-1">No lesson selected</h3>
        <p className="text-xs max-w-xs text-muted-foreground">
          Select a lesson from the list or map view to start reading.
        </p>
      </div>
    );
  }

  return (
    <DetailContent
      key={item.id}
      item={item}
      sections={sections}
      canWrite={canWrite}
      prevLesson={prevLesson}
      nextLesson={nextLesson}
      onSelectPrev={onSelectPrev}
      onSelectNext={onSelectNext}
      onBack={onBack}
      onUpdateNote={onUpdateNote}
      onEditItem={onEditItem}
      onDeleteItem={onDeleteItem}
      onChangeStatus={onChangeStatus}
    />
  );
}
