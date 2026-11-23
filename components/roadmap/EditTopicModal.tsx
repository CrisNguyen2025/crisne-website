'use client';

import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { RoadmapMeta } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface EditTopicModalProps {
  isOpen: boolean;
  topic: RoadmapMeta | null;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
}

function EditTopicForm({
  isOpen,
  topic,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  isOpen: boolean;
  topic: RoadmapMeta;
  onClose: () => void;
  onAfterClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(topic.title);
  const [description, setDescription] = useState(topic.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nhập tên topic.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit(title.trim(), description.trim());
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không cập nhật được topic. Thử lại nhé.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Sửa topic"
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
            form="edit-topic-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang lưu…' : 'Lưu'}</span>
          </button>
        </>
      }
    >
      <form id="edit-topic-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Tên topic *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

export function EditTopicModal({
  isOpen,
  topic,
  onClose,
  onSubmit,
}: EditTopicModalProps) {
  const isActive = isOpen && Boolean(topic);
  const [renderedTopic, setRenderedTopic] = useState<RoadmapMeta | null>(isActive ? topic : null);
  const [wasActive, setWasActive] = useState(isActive);
  const [sessionId, setSessionId] = useState(0);

  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive && topic) {
      setRenderedTopic(topic);
      setSessionId((prev) => prev + 1);
    }
  } else if (isActive && topic && renderedTopic !== topic) {
    setRenderedTopic(topic);
  }

  const handleAfterClose = useCallback(() => {
    setRenderedTopic(null);
  }, []);

  if (!renderedTopic) return null;
  return (
    <EditTopicForm
      key={`${renderedTopic.id}:${sessionId}`}
      isOpen={isActive}
      topic={renderedTopic}
      onClose={onClose}
      onAfterClose={handleAfterClose}
      onSubmit={onSubmit}
    />
  );
}
