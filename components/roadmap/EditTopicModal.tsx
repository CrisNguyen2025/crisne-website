'use client';

import React, { useCallback, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { RoadmapMeta } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';
import {
  ROADMAP_GHOST_BTN_CLASS,
  ROADMAP_INPUT_CLASS,
  ROADMAP_MODAL_TITLE_CLASS,
  ROADMAP_PRIMARY_BTN_CLASS,
  ROADMAP_TEXTAREA_CLASS,
  RoadmapFieldLabel,
  RoadmapFormError,
} from './RoadmapFormPrimitives';

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
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [title, setTitle] = useState(topic.title);
  const [description, setDescription] = useState(topic.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submitTopic = async () => {
    if (isSubmitting) return;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitTopic();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Sửa topic"
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
            form="edit-topic-form"
            disabled={isSubmitting}
            className={ROADMAP_PRIMARY_BTN_CLASS}
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}</span>
          </button>
        </>
      }
    >
      <form id="edit-topic-form" noValidate onSubmit={handleSubmit} className="space-y-4">
        <RoadmapFormError id={errorId} message={error} />

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={titleId} required>
            Tên topic
          </RoadmapFieldLabel>
          <input
            id={titleId}
            type="text"
            required
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : undefined}
            value={title}
            disabled={isSubmitting}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError('');
            }}
            placeholder="ví dụ: AI Engineering"
            className={ROADMAP_INPUT_CLASS}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <RoadmapFieldLabel htmlFor={descriptionId}>Mô tả</RoadmapFieldLabel>
          <textarea
            id={descriptionId}
            value={description}
            disabled={isSubmitting}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitTopic();
              }
            }}
            placeholder="Tóm tắt ngắn…"
            rows={3}
            className={`${ROADMAP_TEXTAREA_CLASS} resize-none`}
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
