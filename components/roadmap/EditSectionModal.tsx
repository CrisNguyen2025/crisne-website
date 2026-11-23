'use client';

import React, { useCallback, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { normalizeTitle } from '@/lib/roadmap/titles';
import { Dialog } from '@/components/ui/dialog';
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_INPUT_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from './RoadmapFormPrimitives';

interface EditSectionModalProps {
  isOpen: boolean;
  /** The section's current name; null for the lessons outside any section (nothing to rename) */
  section: string | null;
  existingSections?: string[];
  onClose: () => void;
  /** Renaming onto a name the topic already uses merges the two sections */
  onSubmit: (from: string, to: string) => void | Promise<void>;
}

function EditSectionForm({
  isOpen,
  section,
  existingSections,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  section: string;
  existingSections?: string[];
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (from: string, to: string) => void | Promise<void>;
}) {
  const titleId = useId();
  const errorId = useId();
  const [title, setTitle] = useState(section);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const trimmed = title.trim();
  const mergeTarget = trimmed
    ? existingSections?.find(
        (s) => s !== section && normalizeTitle(s) === normalizeTitle(trimmed)
      )
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!trimmed) {
      setError('Nhập tên mục.');
      return;
    }
    if (trimmed === section) {
      onClose();
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit(section, trimmed);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không đổi tên được mục. Thử lại nhé.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Đổi tên mục"
      titleClassName={ROADMAP_MODAL_TITLE_CLASS}
      className="roadmap-theme"
      footer={
        <>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className={ROADMAP_GHOST_BTN_CLASS}
          >
            Hủy
          </button>
          <button
            type="submit"
            form="edit-section-form"
            disabled={isSubmitting}
            className={ROADMAP_PRIMARY_BTN_CLASS}
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}</span>
          </button>
        </>
      }
    >
      <form id="edit-section-form" noValidate onSubmit={handleSubmit} className="space-y-4">
        <RoadmapFormError id={errorId} message={error} />

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={titleId} required>
            Tên mục
          </RoadmapFieldLabel>
          <input
            id={titleId}
            type="text"
            required
            autoFocus
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={isSubmitting}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError('');
            }}
            className={ROADMAP_INPUT_CLASS}
          />
          {mergeTarget && (
            <p className="text-xs leading-relaxed text-[var(--editorial-accent)]">
              Trùng mục sẵn có — bài học sẽ gộp vào &ldquo;{mergeTarget}&rdquo;.
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function EditSectionModal({
  isOpen,
  section,
  existingSections,
  onClose,
  onSubmit,
}: EditSectionModalProps) {
  const isActive = isOpen && section !== null;
  const [renderedSection, setRenderedSection] = useState<string | null>(
    isActive ? section : null
  );
  const [wasActive, setWasActive] = useState(isActive);
  const [sessionId, setSessionId] = useState(0);

  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive && section !== null) {
      setRenderedSection(section);
      setSessionId((prev) => prev + 1);
    }
  } else if (isActive && section !== null && renderedSection !== section) {
    setRenderedSection(section);
  }

  const handleAfterClose = useCallback(() => {
    setRenderedSection(null);
  }, []);

  if (renderedSection === null) return null;
  return (
    <EditSectionForm
      key={`${renderedSection}:${sessionId}`}
      isOpen={isActive}
      section={renderedSection}
      existingSections={existingSections}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
