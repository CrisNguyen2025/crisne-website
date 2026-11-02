'use client';

import React, { useState } from 'react';
import { Layers, AlignLeft, Sparkles } from 'lucide-react';
import { RoadmapMeta } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface EditTopicModalProps {
  isOpen: boolean;
  topic: RoadmapMeta | null;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
}

function EditTopicForm({
  topic,
  onClose,
  onSubmit,
}: {
  topic: RoadmapMeta;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(topic.title);
  const [description, setDescription] = useState(topic.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a topic title.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit(title.trim(), description.trim());
      onClose();
    } catch (err: unknown) {
      console.error('Failed to update topic:', err);
      const msg = err instanceof Error ? err.message : 'Failed to update topic. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit Topic"
      description="Tên và mô tả của topic"
      icon={<Layers className="size-4 text-primary" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-topic-form"
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="edit-topic-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="size-3.5 text-primary" />
            <span>Topic Title *</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AI & LLM Architecture"
            className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors text-foreground"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlignLeft className="size-3.5 text-muted-foreground" />
            <span>Description</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short summary or purpose of this roadmap topic..."
            rows={3}
            className="w-full px-3 py-2 text-xs bg-muted/40 border border-border/60 rounded-xl focus:outline-none focus:border-primary focus:bg-background transition-colors text-foreground resize-none"
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
  if (!isOpen || !topic) return null;
  return <EditTopicForm key={topic.id} topic={topic} onClose={onClose} onSubmit={onSubmit} />;
}
