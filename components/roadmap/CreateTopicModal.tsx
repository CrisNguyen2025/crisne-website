'use client';

import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreateRoadmapDto } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoadmapDto) => Promise<void>;
}

function CreateTopicForm({
  isOpen,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (payload: CreateRoadmapDto) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tạo được topic. Thử lại nhé.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Tạo topic"
      className="roadmap-theme"
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
            type="submit"
            form="create-topic-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang tạo…' : 'Tạo topic'}</span>
          </button>
        </>
      }
    >
      <form id="create-topic-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Tên topic *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ví dụ: AI Engineering"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground transition-[border-color,box-shadow] duration-150 focus:border-foreground/50 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Mô tả</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tóm tắt ngắn (tuỳ chọn)…"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground transition-[border-color,box-shadow] duration-150 focus:border-foreground/50 focus:outline-none"
          />
        </div>
      </form>
    </Dialog>
  );
}

/** A topic starts with its name and description; its lessons are added afterwards, with or without a section. */
export function CreateTopicModal({ isOpen, onClose, onSubmit }: CreateTopicModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [sessionId, setSessionId] = useState(0);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setShouldRender(true);
      setSessionId((prev) => prev + 1);
    }
  }

  const handleAfterClose = useCallback(() => {
    setShouldRender(false);
  }, []);

  if (!shouldRender) return null;

  return (
    <CreateTopicForm
      key={sessionId}
      isOpen={isOpen}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
