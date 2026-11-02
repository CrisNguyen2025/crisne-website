'use client';

import React, { useState } from 'react';
import { X, Check, Edit3, AlignLeft } from 'lucide-react';
import { ChecklistItem, RoadmapGroup } from '@/lib/roadmap/types';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

interface EditItemInfoDrawerProps {
  isOpen: boolean;
  item:
    | (ChecklistItem & {
        layerTitle?: string;
        groupTitle?: string;
        layerGroups?: Pick<RoadmapGroup, 'id' | 'title'>[];
      })
    | null;
  onClose: () => void;
  /** groupId is set only when the lesson moves to another group of its layer */
  onSubmit: (id: string, title: string, description: string, groupId?: string) => void;
}

function EditItemInfoForm({
  item,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem & {
    layerTitle?: string;
    groupTitle?: string;
    layerGroups?: Pick<RoadmapGroup, 'id' | 'title'>[];
  };
  onClose: () => void;
  onSubmit: (id: string, title: string, description: string, groupId?: string) => void;
}) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [groupId, setGroupId] = useState(item.groupId);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a lesson title.');
      return;
    }

    onSubmit(item.id, title.trim(), description.trim(), groupId !== item.groupId ? groupId : undefined);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      side={isMobile ? 'bottom' : 'right'}
      label="Edit lesson"
      className={isMobile ? 'max-h-[90dvh]' : 'sm:max-w-md md:max-w-[440px]'}
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border bg-muted/15 flex items-center justify-between shrink-0 min-h-[57px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 shadow-2xs">
            <Edit3 className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate">Edit lesson</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span>Lesson</span>
              <span className="text-muted-foreground/40">•</span>
              <span className="font-mono text-[0.625rem]">ID: {item.id}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Close (Esc)"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body Form */}
      <form id="edit-item-info-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div className="p-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            {error}
          </div>
        )}

        {(item.layerGroups?.length ?? 0) > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Group
            </label>
            <div className="flex flex-wrap gap-2">
              {item.layerGroups!.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    'py-1.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer',
                    groupId === g.id
                      ? 'bg-primary/10 border-primary/40 text-primary font-bold shadow-xs'
                      : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Attention mechanism"
            autoFocus
            className="w-full text-sm font-semibold px-3.5 py-2 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <AlignLeft className="size-3.5 text-primary" />
            <span>Summary description</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Enter brief description explaining this concept..."
            className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground leading-relaxed resize-y transition-colors"
          />
        </div>
      </form>

      {/* Footer */}
      <div className="p-4 px-5 border-t border-border bg-muted/10 shrink-0 flex items-center justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="edit-item-info-form"
          className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Check className="size-3.5" /> Save changes
        </button>
      </div>
    </Sheet>
  );
}

export function EditItemInfoDrawer({
  isOpen,
  item,
  onClose,
  onSubmit,
}: EditItemInfoDrawerProps) {
  if (!isOpen || !item) return null;
  return <EditItemInfoForm key={item.id} item={item} onClose={onClose} onSubmit={onSubmit} />;
}
