'use client';

import React, { useCallback, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { sectionSpelling } from '@/lib/roadmap/sections';
import { Dialog } from '@/components/ui/dialog';
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_INPUT_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_SECONDARY_BTN_CLASS,
  ROADMAP_TEXTAREA_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from './RoadmapFormPrimitives';
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
  onSubmit: CreateItemModalProps['onSubmit'];
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [section, setSection] = useState(targetSection ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submittingMode, setSubmittingMode] = useState<'create' | 'create-and-edit' | null>(null);
  const [error, setError] = useState('');

  const isSubmitting = submittingMode !== null;

  const submitForm = async (openEditor: boolean) => {
    if (isSubmitting) return;
    if (!title.trim()) {
      setError('Nhập tên bài.');
      return;
    }
    try {
      setSubmittingMode(openEditor ? 'create-and-edit' : 'create');
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
      setSubmittingMode(null);
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
      titleClassName={ROADMAP_MODAL_TITLE_CLASS}
      className="roadmap-theme sm:max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className={`${ROADMAP_GHOST_BTN_CLASS} sm:mr-auto`}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submitForm(true)}
            className={ROADMAP_SECONDARY_BTN_CLASS}
          >
            {submittingMode === 'create-and-edit' && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>
              {submittingMode === 'create-and-edit' ? 'Đang mở trình soạn…' : 'Tạo & viết nội dung'}
            </span>
          </button>
          <button
            type="submit"
            form="create-item-form"
            disabled={isSubmitting}
            className={ROADMAP_PRIMARY_BTN_CLASS}
          >
            {submittingMode === 'create' && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>{submittingMode === 'create' ? 'Đang thêm…' : 'Thêm bài'}</span>
          </button>
        </div>
      }
    >
      <form id="create-item-form" noValidate onSubmit={handleSubmit} className="space-y-4">
        <RoadmapFormError id={errorId} message={error} />

        {SECTIONS_ENABLED && <SectionField value={section} onChange={setSection} sections={sections} />}

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={titleId} required>
            Tên bài
          </RoadmapFieldLabel>
          <input
            id={titleId}
            type="text"
            required
            autoFocus
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={isSubmitting}
            placeholder="ví dụ: Speculative Decoding, GraphRAG…"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError('');
            }}
            className={ROADMAP_INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={descriptionId}>Mô tả</RoadmapFieldLabel>
          <textarea
            id={descriptionId}
            disabled={isSubmitting}
            placeholder="Tóm tắt ngắn…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitForm(false);
              }
            }}
            rows={3}
            className={`${ROADMAP_TEXTAREA_CLASS} resize-none`}
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
