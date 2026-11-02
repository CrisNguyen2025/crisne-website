'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  X,
  Check,
  FileText,
  Keyboard,
  Clock,
} from 'lucide-react';
import { ChecklistItem } from '@/lib/roadmap/types';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

// Load Editor dynamically to optimize bundle and avoid SSR mismatches
const Editor = dynamic(() => import('@/components/ui/editor/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10 p-8">
      <div className="size-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-xs font-medium animate-pulse">Loading editor...</p>
    </div>
  ),
});

interface EditItemContentDrawerProps {
  isOpen: boolean;
  item: ChecklistItem | null;
  onClose: () => void;
  onSubmit: (id: string, content: string) => Promise<void> | void;
}

function EditItemContentForm({
  item,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem;
  onClose: () => void;
  onSubmit: (id: string, content: string) => Promise<void> | void;
}) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [content, setContent] = useState(() => item.content || '');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const contentRef = useRef(item.content || '');
  const initialContentRef = useRef(item.content || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsEditorReady(true);
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  const handleContentChange = useCallback((val: string) => {
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

  // Handle ESC and Cmd+S / Ctrl+S shortcuts
  useEffect(() => {
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
  }, [attemptClose, handleSave, showDiscardConfirm]);

  const stats = useMemo(() => {
    if (!content) return { words: 0, characters: 0, readTimeMinutes: 0 };
    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plainText) return { words: 0, characters: 0, readTimeMinutes: 0 };
    const words = plainText.split(' ').filter(Boolean).length;
    const characters = plainText.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, characters, readTimeMinutes };
  }, [content]);

  return (
    <>
      <Sheet
        open
        onClose={attemptClose}
        side={isMobile ? 'bottom' : 'right'}
        label="Edit lesson content"
        className={isMobile ? 'max-h-[92dvh]' : 'md:max-w-3xl lg:max-w-4xl'}
      >
        {/* Header */}
        <div className="px-5 md:px-7 py-3.5 border-b border-border shrink-0 bg-muted/15 flex items-center justify-between gap-4 min-h-[57px]">
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

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={attemptClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body: Full-height Notion Editor */}
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
          <div className="flex-1 flex flex-col p-4 md:p-5 min-h-0">
            {isEditorReady ? (
              <Editor
                value={content}
                onChange={handleContentChange}
                namespace="RoadmapItemContentDrawerEditor"
                showTopbar={false}
                fillHeight={true}
                placeholder="Write document content here (supports Headings, Code, Callout, Tables, Lists)..."
                contentEditableClassName="py-2 transition-all duration-200 outline-none min-h-[480px] max-w-full px-3"
              />
            ) : (
              <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/5 p-8 rounded-xl border border-border/50">
                <div className="size-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <p className="text-xs font-medium text-muted-foreground animate-pulse">
                  Loading editor...
                </p>
              </div>
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
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
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
  onClose,
  onSubmit,
}: EditItemContentDrawerProps) {
  if (!isOpen || !item) return null;
  return <EditItemContentForm key={item.id} item={item} onClose={onClose} onSubmit={onSubmit} />;
}
