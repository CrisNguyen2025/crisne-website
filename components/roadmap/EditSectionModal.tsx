'use client';

import React, { useState } from 'react';
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
  section,
  onClose,
  onSubmit,
}: {
  section: string;
  onClose: () => void;
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
      open
      onClose={onClose}
      title="Đổi tên mục"
      className="roadmap-theme"
      description="Mọi bài học trong mục sẽ chuyển sang tên mới."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="edit-section-form"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-foreground/50 focus:outline-none"
          />
        </div>
      </form>
    </Dialog>
  );
}

export function EditSectionModal({ isOpen, section, onClose, onSubmit }: EditSectionModalProps) {
  if (!isOpen || section === null) return null;
  return <EditSectionForm key={section} section={section} onClose={onClose} onSubmit={onSubmit} />;
}
