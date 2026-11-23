'use client';

import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { Dialog } from '@/components/ui/dialog';
import { SectionField } from './SectionField';
import { SECTIONS_ENABLED } from './sectionsEnabled';

export interface CreateItemOptions {
  openEditor?: boolean;
}

interface CreateItemModalProps {
  isOpen: boolean;
  sections: string[];
  targetSection: string | null;
  onClose: () => void;
  onSubmit: (
    section: string | null,
    title: string,
    description: string,
    options?: CreateItemOptions
  ) => void | Promise<void>;
}

function CreateItemForm({
  isOpen,
  sections,
  targetSection,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  sections: string[];
  targetSection: string | null;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (
    section: string | null,
    title: string,
    description: string,
    options?: CreateItemOptions
  ) => void | Promise<void>;
}) {
  const [section, setSection] = useState(targetSection ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submitForm = async (openEditor: boolean) => {
    if (!title.trim()) {
      setError('Nhập tên bài.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit(
        SECTIONS_ENABLED ? sectionSpelling(sections, section) : null,
        title.trim(),
        description.trim(),
        { openEditor }
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thêm được bài học.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitForm(false);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Thêm bài học"
      className="roadmap-theme"
      description={
        SECTIONS_ENABLED ? (
          <span className="mt-0.5 truncate text-xs text-muted-foreground">
            Mục:{' '}
            <span className="font-medium text-foreground">
              {sectionSpelling(sections, section) ?? 'Chung'}
            </span>
          </span>
        ) : undefined
      }
      footer={
        <>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submitForm(true)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            Tạo & viết nội dung
          </button>
          <button
            type="submit"
            form="create-item-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang thêm…' : 'Thêm bài'}</span>
          </button>
        </>
      }
    >
      <form id="create-item-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {SECTIONS_ENABLED && <SectionField value={section} onChange={setSection} sections={sections} />}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Tên bài *</label>
          <input
            type="text"
            autoFocus
            placeholder="ví dụ: Speculative Decoding, GraphRAG…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus:border-foreground/50 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Mô tả</label>
          <textarea
            placeholder="Tóm tắt ngắn (tuỳ chọn)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground transition-[border-color,box-shadow] duration-150 focus:border-foreground/50 focus:outline-none"
          />
        </div>
      </form>
    </Dialog>
  );
}

export function CreateItemModal({
  isOpen,
  sections,
  targetSection,
  onClose,
  onSubmit,
}: CreateItemModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [renderedTargetSection, setRenderedTargetSection] = useState(targetSection);
  const [sessionId, setSessionId] = useState(0);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setShouldRender(true);
      setRenderedTargetSection(targetSection);
      setSessionId((prev) => prev + 1);
    }
  }

  const handleAfterClose = useCallback(() => {
    setShouldRender(false);
  }, []);

  if (!shouldRender) return null;
  return (
    <CreateItemForm
      key={`${renderedTargetSection ?? '__none__'}:${sessionId}`}
      isOpen={isOpen}
      sections={sections}
      targetSection={renderedTargetSection}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
