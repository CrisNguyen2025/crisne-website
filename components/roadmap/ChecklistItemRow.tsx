'use client';

import React from 'react';
import { ChevronRight, FileText, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChecklistItem } from '@/lib/roadmap/types';
import { cn } from '@/lib/utils';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  isActive: boolean;
  /** Drag handle shown: the Owner may reorder and the topic is not locked */
  isDraggable?: boolean;
  onSelect: () => void;
}

export function ChecklistItemRow({ item, isActive, isDraggable = false, onSelect }: ChecklistItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={cn(
        'group relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm transition-colors lg:py-2',
        isActive ? 'bg-primary/10 text-foreground' : 'text-foreground/85 hover:bg-muted',
        isDragging && 'z-50 opacity-40'
      )}
    >
      {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}

      {isDraggable && (
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
          className="-ml-1 hidden cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing lg:inline-flex"
        >
          <GripVertical className="size-3.5" />
        </span>
      )}

      <span className={cn('min-w-0 flex-1 truncate', isActive && 'font-medium')}>{item.title}</span>

      {item.content && (
        <FileText aria-label="Has content" className="size-3.5 shrink-0 text-muted-foreground/70" />
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 lg:hidden" />
    </div>
  );
}
