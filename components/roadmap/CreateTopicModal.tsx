'use client';

import React, { useCallback, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreateRoadmapDto } from '@/lib/roadmap/types';
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
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submitTopic = async () => {
    if (isSubmitting) return;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitTopic();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      onAfterClose={onAfterClose}
      title="Tạo topic"
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
            form="create-topic-form"
            disabled={isSubmitting}
            className={ROADMAP_PRIMARY_BTN_CLASS}
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? 'Đang tạo…' : 'Tạo topic'}</span>
          </button>
        </>
      }
    >
      <form id="create-topic-form" noValidate onSubmit={handleSubmit} className="space-y-4">
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
            value={name}
            disabled={isSubmitting}
            onChange={(e) => {
              setName(e.target.value);
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
