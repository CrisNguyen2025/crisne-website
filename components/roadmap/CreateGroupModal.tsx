'use client';

import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { RoadmapLayer } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface CreateGroupModalProps {
  isOpen: boolean;
  layer: RoadmapLayer | null;
  onClose: () => void;
  onSubmit: (layerId: string, title: string) => void;
}

export function CreateGroupModal({
  isOpen,
  layer,
  onClose,
  onSubmit,
}: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  if (!layer) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a group title.');
      return;
    }
    if (layer.groups.some((g) => g.title.trim().toLowerCase() === title.trim().toLowerCase())) {
      setError(`Group "${title.trim()}" already exists in this layer.`);
      return;
    }
    onSubmit(layer.id, title.trim());
    setTitle('');
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Create group"
      description={
        <span>
          Adds a named group of lessons to layer{' '}
          <span className="font-semibold text-foreground">{layer.shortTag}</span>
        </span>
      }
      icon={<FolderPlus className="size-4 text-emerald-600 dark:text-emerald-400" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-group-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Create group
          </button>
        </>
      }
    >
      <form id="create-group-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <FolderPlus className="size-3.5 text-primary" /> Group title *
          </label>
          <input
            type="text"
            autoFocus
            placeholder="Fundamentals"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
          />
        </div>
      </form>
    </Dialog>
  );
}
