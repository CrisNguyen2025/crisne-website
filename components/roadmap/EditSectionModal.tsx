'use client';

import React, { useCallback, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';

interface EditSectionModalProps {
  isOpen: boolean;
  /** The section's current name; null for the lessons outside any section (nothing to rename) */
  section: string | null;
  onClose: () => void;
  /** Renaming onto a name the topic already uses merges the two sections */
  onSubmit: (from: string, to: string) => void;
}

function EditSectionForm({
  isOpen,
  section,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  section: string;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (from: string, to: string) => void;
}) {
  const [title, setTitle] = useState(section);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nhập tên mục.');
      return;
    }
    onSubmit(section, title.trim());
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      onAfterClose={onAfterClose}
      title="Đổi tên mục"
      className="roadmap-theme"
      description="Mọi bài học trong mục sẽ chuyển sang tên mới."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="edit-section-form"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
          >
            Lưu
          </button>
        </>
      }
    >
      <form id="edit-section-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Tên mục *</label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus:border-foreground/50 focus:outline-none"
          />
        </div>
      </form>
    </Dialog>
  );
}

export function EditSectionModal({ isOpen, section, onClose, onSubmit }: EditSectionModalProps) {
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
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
