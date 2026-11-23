'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  X,
  Check,
  FileText,
  Keyboard,
  Clock,
  ListTree,
} from 'lucide-react';
import { contentStats } from '@/lib/roadmap/content-utils';
import { DEFAULT_LESSON_TEMPLATE_HTML } from '@/lib/roadmap/lesson-template';
import { ChecklistItem } from '@/lib/roadmap/types';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

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
        <div className="pt-2 space-y-2.5">
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
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorSeedVersion, setEditorSeedVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
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

  const handleContentChange = useCallback((val: string) => {
    if (!baselineNormalizedRef.current) {
      baselineNormalizedRef.current = true;
      initialContentRef.current = val;
    }
    contentRef.current = val;
    setContent(val);
  }, []);

  const attemptClose = useCallback(() => {
    const hasUnsavedChanges = contentRef.current !== initialContentRef.current;
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await onSubmit(item.id, contentRef.current);
      initialContentRef.current = contentRef.current;
      onClose();
    } catch (err) {
      console.error('Failed to save content in drawer:', err);
    } finally {
      setIsSaving(false);
    }
  }, [item.id, isSaving, onSubmit, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          attemptClose();
        }
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, attemptClose, handleSave, showDiscardConfirm]);

  const stats = useMemo(() => {
    const { words, characters, readingMinutes: readTimeMinutes } = contentStats(content);
    return { words, characters, readTimeMinutes };
  }, [content]);

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={attemptClose}
        onAfterClose={onAfterClose}
        side={isMobile ? 'bottom' : 'right'}
        label="Edit lesson content"
        className={isMobile ? 'roadmap-theme max-h-[92dvh]' : 'roadmap-theme md:max-w-3xl lg:max-w-4xl'}
      >
        <div className="px-5 md:px-7 py-3.5 border-b border-border shrink-0 bg-muted/15 flex items-center justify-between gap-4 min-h-[3.5625rem]">
          <div className="min-w-0 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex flex-col">
              <h3 className="font-bold text-sm md:text-base text-foreground truncate">
                {item.title}
              </h3>
              <span className="text-xs text-muted-foreground truncate">
                Editing content
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!content.trim() && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  baselineNormalizedRef.current = false;
                  contentRef.current = DEFAULT_LESSON_TEMPLATE_HTML;
                  initialContentRef.current = DEFAULT_LESSON_TEMPLATE_HTML;
                  setContent(DEFAULT_LESSON_TEMPLATE_HTML);
                  setEditorSeedVersion((v) => v + 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.98] cursor-pointer"
              >
                <ListTree className="size-3.5" />
                <span>Chèn mẫu</span>
              </button>
            )}
            <button
              type="button"
              onClick={attemptClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-[background-color,color,transform] duration-150 active:scale-95 cursor-pointer"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="flex-1 flex flex-col px-5 py-4 md:px-7 md:py-5 min-h-0">
            {isEditorReady ? (
              <div className="flex-1 flex flex-col min-h-0 motion-safe:animate-in motion-safe:fade-in duration-200 ease-out">
                <Editor
                  key={editorSeedVersion}
                  value={content}
                  onChange={handleContentChange}
                  namespace="RoadmapItemContentDrawerEditor"
                  showTopbar={false}
                  fillHeight={true}
                  placeholder="Write document content here (supports Headings, Code, Callout, Tables, Lists)..."
                  contentEditableClassName="post-content-view editorial-prose prose dark:prose-invert max-w-none py-2 outline-none min-h-[30rem] px-3"
                />
              </div>
            ) : (
              <EditorContentSkeleton />
            )}
          </div>
        </div>

        {/* Footer Actions & Stats */}
        <div className="flex items-center justify-between px-5 md:px-7 py-3 border-t border-border bg-muted/15 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-[background-color,transform] duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="size-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5 stroke-[2.5]" />
                  <span>Save content</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <span>{stats.words} words</span>
              <span className="text-muted-foreground/30">•</span>
              <span>{stats.characters} chars</span>
            </div>

            {stats.words > 0 && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/80">
                <Clock className="size-3 text-muted-foreground/60" />
                <span>~{stats.readTimeMinutes} min read</span>
              </div>
            )}

            <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground/60 pl-2 border-l border-border/40">
              <Keyboard className="size-3" />
              <span>
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[0.625rem] font-mono">
                  ⌘/Ctrl
                </kbd>{' '}
                +{' '}
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[0.625rem] font-mono">
                  S
                </kbd>{' '}
                to save
              </span>
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmDeleteModal
        isOpen={showDiscardConfirm}
        title="Discard unsaved changes?"
        description="You have modified the document content. If you exit now without saving, your changes will be discarded."
        confirmText="Discard"
        cancelText="Keep editing"
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
