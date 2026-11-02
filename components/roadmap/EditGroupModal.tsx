'use client';

import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { RoadmapGroup } from '@/lib/roadmap/types';
import { Dialog } from '@/components/ui/dialog';

interface EditGroupModalProps {
  isOpen: boolean;
  group: RoadmapGroup | null;
  onClose: () => void;
  onSubmit: (groupId: string, title: string) => void;
}

function EditGroupForm({
  group,
  onClose,
  onSubmit,
}: {
  group: RoadmapGroup;
  onClose: () => void;
  onSubmit: (groupId: string, title: string) => void;
}) {
  const [title, setTitle] = useState(group.title);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a group title.');
      return;
    }
    if (!group.id) {
      setError('Group ID is missing.');
      return;
    }
    onSubmit(group.id, title.trim());
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit group"
      description="Update the title of this group"
      icon={<Pencil className="size-4 text-amber-600 dark:text-amber-400" />}
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
            form="edit-group-form"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Save changes
          </button>
        </>
      }
    >
      <form id="edit-group-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <Pencil className="size-3.5 text-primary" /> Group title *
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

export function EditGroupModal({
  isOpen,
  group,
  onClose,
  onSubmit,
}: EditGroupModalProps) {
  if (!isOpen || !group) return null;
  return <EditGroupForm key={group.id} group={group} onClose={onClose} onSubmit={onSubmit} />;
}
