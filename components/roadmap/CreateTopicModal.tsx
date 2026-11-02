'use client';

import React, { useState } from 'react';
import { AlignLeft, Sparkles } from 'lucide-react';
import { CreateRoadmapDto } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoadmapDto) => Promise<void>;
}

/** A topic starts with its name and description; its lessons are added afterwards, with or without a section. */
export function CreateTopicModal({ isOpen, onClose, onSubmit }: CreateTopicModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setName('');
    setDescription('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nhập tên topic.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit({ title: name.trim(), description: description.trim() || undefined });
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tạo được topic. Thử lại nhé.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        reset();
        onClose();
      }}
      title="Tạo topic"
      description="Bài sẽ được thêm sau khi tạo topic"
      icon={<Sparkles className="size-4 text-primary" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="create-topic-form"
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
          >
            {isSubmitting ? 'Đang tạo…' : 'Tạo topic'}
          </button>
        </>
      }
    >
      <form id="create-topic-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">{error}</div>
        )}

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="size-3.5 text-primary" />
            <span>Tên topic *</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ví dụ: AI Engineering"
            className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors text-foreground"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlignLeft className="size-3.5 text-muted-foreground" />
            <span>Mô tả</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tóm tắt ngắn về topic này..."
            rows={3}
            className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors text-foreground resize-none"
          />
        </div>
      </form>
    </Dialog>
  );
}
