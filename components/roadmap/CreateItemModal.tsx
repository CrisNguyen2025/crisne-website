'use client';

import React, { useState } from 'react';
import { Sparkles, FileText, AlignLeft } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { SectionField } from './SectionField';

interface CreateItemModalProps {
  isOpen: boolean;
  /** The topic's sections, offered in the section field */
  sections: string[];
  /** The section the user opened from; null means no section. */
  targetSection: string | null;
  onClose: () => void;
  onSubmit: (section: string | null, title: string, description: string) => void;
}

function CreateItemForm({
  sections,
  targetSection,
  onClose,
  onSubmit,
}: {
  sections: string[];
  targetSection: string | null;
  onClose: () => void;
  onSubmit: (section: string | null, title: string, description: string) => void;
}) {
  const [section, setSection] = useState(targetSection ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nhập tên bài.');
      return;
    }
    if (!description.trim()) {
      setError('Nhập mô tả ngắn cho bài này.');
      return;
    }
    onSubmit(section.trim() || null, title.trim(), description.trim());
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Thêm bài"
      description={
        <span className="mt-0.5 truncate text-xs text-muted-foreground">
          Mục: <span className="font-semibold text-primary">{section.trim() || 'Chung'}</span>
        </span>
      }
      icon={<Sparkles className="size-4" />}
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
            form="create-item-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Thêm bài
          </button>
        </>
      }
    >
      <form id="create-item-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">{error}</div>
        )}

        <SectionField value={section} onChange={setSection} sections={sections} />

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <FileText className="size-3.5 text-primary" /> Tên bài *
          </label>
          <input
            type="text"
            autoFocus
            placeholder="ví dụ: Speculative Decoding, GraphRAG…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <AlignLeft className="size-3.5 text-primary" /> Mô tả *
          </label>
          <textarea
            placeholder="Giải thích ngắn về khái niệm này và cách dùng…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none leading-relaxed text-xs"
          />
        </div>
      </form>
    </Dialog>
  );
}

export function CreateItemModal({ isOpen, sections, targetSection, onClose, onSubmit }: CreateItemModalProps) {
  if (!isOpen) return null;
  return (
    <CreateItemForm
      key={targetSection ?? '__none__'}
      sections={sections}
      targetSection={targetSection}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
