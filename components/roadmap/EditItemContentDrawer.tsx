'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Check, Keyboard, ListTree, Loader2, X } from 'lucide-react';
import { contentStats } from '@/lib/roadmap/content-utils';
import { DEFAULT_LESSON_TEMPLATE_HTML } from '@/lib/roadmap/lesson-template';
import { ChecklistItem } from '@/lib/roadmap/types';
import { getScrollBehavior } from '@/lib/utils';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_SECONDARY_BTN_CLASS,
  RoadmapFormError,
} from './RoadmapFormPrimitives';

const loadEditorModule = () => import('@/components/ui/editor/Editor');

export function preloadLessonContentEditor() {
  void loadEditorModule();
}

function EditorContentSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-1 flex-col gap-5 py-2 motion-safe:animate-pulse"
    >
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <div className="h-6 w-14 rounded-md bg-muted/80" />
        <div className="h-6 w-6 rounded-md bg-muted/70" />
        <div className="h-6 w-6 rounded-md bg-muted/70" />
        <div className="h-6 w-6 rounded-md bg-muted/70" />
        <div className="mx-1 h-4 w-px bg-border/60" />
        <div className="h-6 w-6 rounded-md bg-muted/70" />
        <div className="h-6 w-6 rounded-md bg-muted/70" />
      </div>
      <div className="max-w-[65ch] space-y-4 pt-1">
        <div className="h-6 w-2/5 rounded-md bg-muted/85" />
        <div className="space-y-2.5">
          <div className="h-3.5 w-full rounded bg-muted/65" />
          <div className="h-3.5 w-11/12 rounded bg-muted/65" />
          <div className="h-3.5 w-4/5 rounded bg-muted/65" />
        </div>
        <div className="space-y-2.5 pt-2">
          <div className="h-3.5 w-full rounded bg-muted/55" />
          <div className="h-3.5 w-5/6 rounded bg-muted/55" />
          <div className="h-3.5 w-3/5 rounded bg-muted/55" />
        </div>
      </div>
    </div>
  );
}

const Editor = dynamic(loadEditorModule, {
  ssr: false,
  loading: () => <EditorContentSkeleton />,
});

interface EditItemContentDrawerProps {
  isOpen: boolean;
  item: ChecklistItem | null;
  initialDraftContent?: string;
  onClose: () => void;
  onSubmit: (id: string, content: string) => Promise<void> | void;
}

function EditItemContentForm({
  isOpen,
  item,
  initialDraftContent,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  item: ChecklistItem;
  initialDraftContent?: string;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (id: string, content: string) => Promise<void> | void;
}) {
  const seedValue = item.content || initialDraftContent || '';
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorSeedVersion, setEditorSeedVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');
  const [content, setContent] = useState(() => seedValue);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const contentRef = useRef(seedValue);
  const initialContentRef = useRef(seedValue);
  const baselineNormalizedRef = useRef(!seedValue);

  useEffect(() => {
    if (!isOpen) return;
    preloadLessonContentEditor();
    const timer = window.setTimeout(() => {
      setIsEditorReady(true);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView?.({ behavior: getScrollBehavior(), block: 'nearest' });
    }
  }, [error]);

  const handleContentChange = useCallback((val: string) => {
    if (!baselineNormalizedRef.current) {
      baselineNormalizedRef.current = true;
      initialContentRef.current = val;
    }
    contentRef.current = val;
    setContent(val);
    setIsDirty(val !== initialContentRef.current);
  }, []);

  const attemptClose = useCallback(() => {
    if (isSaving) return;
    if (contentRef.current !== initialContentRef.current) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isSaving, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setError('');
      await onSubmit(item.id, contentRef.current);
      initialContentRef.current = contentRef.current;
      setIsDirty(false);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không lưu được nội dung. Vui lòng thử lại.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [item.id, isSaving, onSubmit, onClose]);

  useEffect(() => {
    if (!isOpen || showDiscardConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSave, showDiscardConfirm]);

  const handleSheetClose = useCallback(() => {
    if (showDiscardConfirm) {
      setShowDiscardConfirm(false);
      return;
    }
    attemptClose();
  }, [attemptClose, showDiscardConfirm]);

  const stats = useMemo(() => {
    const { words, characters, readingMinutes: readTimeMinutes } = contentStats(content);
    return { words, characters, readTimeMinutes };
  }, [content]);

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={handleSheetClose}
        onAfterClose={onAfterClose}
        side={isMobile ? 'bottom' : 'right'}
        label={item.title}
        className={isMobile ? 'roadmap-theme max-h-[92dvh]' : 'roadmap-theme md:max-w-3xl lg:max-w-4xl'}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 py-4 md:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className={`${ROADMAP_MODAL_TITLE_CLASS} truncate`}>{item.title}</h2>
            {isDirty && (
              <span className="shrink-0 rounded-full bg-[var(--editorial-accent-soft)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--editorial-accent)]">
                Chưa lưu
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!content.trim() && (
              <button
                type="button"
                disabled={isSaving}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  baselineNormalizedRef.current = false;
                  contentRef.current = DEFAULT_LESSON_TEMPLATE_HTML;
                  initialContentRef.current = DEFAULT_LESSON_TEMPLATE_HTML;
                  setContent(DEFAULT_LESSON_TEMPLATE_HTML);
                  setIsDirty(false);
                  setEditorSeedVersion((v) => v + 1);
                }}
                className={`${ROADMAP_SECONDARY_BTN_CLASS} h-8 px-2.5 text-xs`}
              >
                <ListTree className="size-3.5" />
                <span>Chèn mẫu</span>
              </button>
            )}
            <button
              type="button"
              disabled={isSaving}
              onClick={attemptClose}
              className="-mr-1 rounded-lg p-1.5 text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
              title="Đóng (Esc)"
              aria-label="Đóng"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable] bg-background">
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4 md:px-7 md:py-5">
            <RoadmapFormError ref={errorRef} message={error} />

            {isEditorReady ? (
              <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in duration-200 ease-out">
                <Editor
                  key={editorSeedVersion}
                  value={content}
                  onChange={handleContentChange}
                  namespace="RoadmapItemContentDrawerEditor"
                  showTopbar={false}
                  fillHeight={true}
                  placeholder="Viết nội dung bài học..."
                  contentEditableClassName="post-content-view editorial-prose prose dark:prose-invert max-w-none min-h-[30rem] px-3 py-2 outline-none"
                />
              </div>
            ) : (
              <EditorContentSkeleton />
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/15 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-7">
          <div className="flex min-w-0 items-center gap-2.5 text-xs tabular-nums text-muted-foreground">
            <span>
              {stats.words} từ · {stats.characters} ký tự
            </span>

            {stats.words > 0 && (
              <span className="hidden text-muted-foreground/80 sm:inline">
                ~{stats.readTimeMinutes} phút
              </span>
            )}

            <span className="hidden items-center gap-1 border-l border-border/60 pl-2.5 text-muted-foreground/70 md:inline-flex">
              <Keyboard className="size-3" aria-hidden="true" />
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.625rem]">
                ⌘/Ctrl+S
              </kbd>
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={attemptClose}
              disabled={isSaving}
              className={ROADMAP_GHOST_BTN_CLASS}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className={ROADMAP_PRIMARY_BTN_CLASS}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  <span>Lưu nội dung</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Sheet>

      <ConfirmDeleteModal
        isOpen={showDiscardConfirm}
        title="Bỏ thay đổi chưa lưu?"
        description="Các thay đổi chưa lưu trong bài học này sẽ bị mất."
        confirmText="Bỏ thay đổi"
        cancelText="Tiếp tục soạn"
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

export function EditItemContentDrawer({
  isOpen,
  item,
  initialDraftContent,
  onClose,
  onSubmit,
}: EditItemContentDrawerProps) {
  const isActive = isOpen && Boolean(item);
  const [renderedItem, setRenderedItem] = useState<ChecklistItem | null>(
    isActive ? item : null
  );
  const [wasActive, setWasActive] = useState(isActive);
  const [sessionId, setSessionId] = useState(0);

  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive && item) {
      setRenderedItem(item);
      setSessionId((prev) => prev + 1);
    }
  } else if (isActive && item && renderedItem !== item) {
    setRenderedItem(item);
  }

  const handleAfterClose = useCallback(() => {
    setRenderedItem(null);
  }, []);

  if (!renderedItem) return null;

  return (
    <EditItemContentForm
      key={`${renderedItem.id}:${sessionId}:${initialDraftContent ? 'draft' : 'plain'}`}
      isOpen={isActive}
      item={renderedItem}
      initialDraftContent={initialDraftContent}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
