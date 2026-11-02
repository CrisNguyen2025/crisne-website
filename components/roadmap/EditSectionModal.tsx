'use client';

import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
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
      description="Mọi bài trong mục sẽ chuyển sang tên mới"
      icon={<Pencil className="size-4 text-amber-600 dark:text-amber-400" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="edit-section-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Lưu
          </button>
        </>
      }
    >
      <form id="edit-section-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">{error}</div>
        )}
        <div className="space-y-1.5">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Pencil className="size-3.5 text-primary" /> Tên mục *
          </label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
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
