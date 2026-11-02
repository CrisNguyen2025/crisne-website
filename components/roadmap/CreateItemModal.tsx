'use client';

import React, { useState } from 'react';
import { Sparkles, FileText, AlignLeft, Folder } from 'lucide-react';
import { CreateItemDto, RoadmapLayer } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Picker value for "name a new group" instead of an existing one */
const NEW_GROUP = '__new';

interface CreateItemModalProps {
  isOpen: boolean;
  layers: RoadmapLayer[];
  targetLayerId: string;
  /** The group the user opened from; empty when none was picked, so the modal asks. */
  targetGroupId: string;
  onClose: () => void;
  onSubmit: (
    layerId: string,
    group: Pick<CreateItemDto, 'groupId' | 'groupTitle'>,
    title: string,
    description: string
  ) => void;
}

function CreateItemForm({
  layers,
  targetLayerId,
  targetGroupId,
  onClose,
  onSubmit,
}: {
  layers: RoadmapLayer[];
  targetLayerId: string;
  targetGroupId: string;
  onClose: () => void;
  onSubmit: (
    layerId: string,
    group: Pick<CreateItemDto, 'groupId' | 'groupTitle'>,
    title: string,
    description: string
  ) => void;
}) {
  const currentLayer = layers.find((l) => l.id === targetLayerId);
  const groups = currentLayer?.groups ?? [];

  const [groupId, setGroupId] = useState(
    () => targetGroupId || (groups.length === 1 ? groups[0].id : groups.length === 0 ? NEW_GROUP : '')
  );
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const currentGroup = groups.find((g) => g.id === groupId);
  const groupDisplayName =
    groupId === NEW_GROUP ? newGroupTitle.trim() || 'New group' : currentGroup?.title || 'No group chosen';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a lesson title.');
      return;
    }
    if (!description.trim()) {
      setError('Enter a brief description for this lesson.');
      return;
    }
    if (!groupId || (groupId === NEW_GROUP && !newGroupTitle.trim())) {
      setError('Choose a group or name a new one.');
      return;
    }
    onSubmit(
      targetLayerId,
      groupId === NEW_GROUP ? { groupTitle: newGroupTitle.trim() } : { groupId },
      title.trim(),
      description.trim()
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add new lesson"
      description={
        <span className="flex items-center gap-1.5 mt-0.5 truncate text-xs text-muted-foreground">
          <Folder className="size-3 text-primary shrink-0" />
          <span className="font-medium text-foreground truncate max-w-[9.375rem]">
            {currentLayer?.shortTag || currentLayer?.title || 'Layer'}
          </span>
          <span className="text-muted-foreground/40 shrink-0">›</span>
          <span className="font-semibold text-primary truncate max-w-[8.75rem]">
            {groupDisplayName}
          </span>
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
            Cancel
          </button>
          <button
            type="submit"
            form="create-item-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Create lesson
          </button>
        </>
      }
    >
      <form id="create-item-form" onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="font-semibold text-muted-foreground">Group *</label>
          <div className="flex flex-wrap gap-2">
            {[...groups.map((g) => ({ id: g.id, title: g.title })), { id: NEW_GROUP, title: '+ New group' }].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGroupId(opt.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
                  groupId === opt.id
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border/70 text-foreground hover:border-primary/50'
                )}
              >
                {opt.title}
              </button>
            ))}
          </div>
          {groupId === NEW_GROUP && (
            <input
              type="text"
              placeholder="Fundamentals"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs mt-1.5"
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <FileText className="size-3.5 text-primary" /> Lesson title *
          </label>
          <input
            type="text"
            autoFocus
            placeholder="e.g. Speculative Decoding, GraphRAG..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <AlignLeft className="size-3.5 text-primary" /> Description *
          </label>
          <textarea
            placeholder="Brief explanation of what this concept is and how it's used…"
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

export function CreateItemModal({
  isOpen,
  layers,
  targetLayerId,
  targetGroupId,
  onClose,
  onSubmit,
}: CreateItemModalProps) {
  if (!isOpen) return null;
  return (
    <CreateItemForm
      key={`${targetLayerId}-${targetGroupId}`}
      layers={layers}
      targetLayerId={targetLayerId}
      targetGroupId={targetGroupId}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
