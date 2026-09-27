'use client';

import React from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChecklistItem } from '@/lib/roadmap/types';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  isActive: boolean;
  isLocked?: boolean;
  onSelect: () => void;
}

export function ChecklistItemRow({
  item,
  isActive,
  isLocked = false,
  onSelect,
}: ChecklistItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isLocked,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm transition-colors duration-150 cursor-pointer ${
        isActive
          ? 'bg-primary/10 border-primary/40 shadow-xs text-foreground'
          : 'bg-card/50 border-border/40 hover:bg-muted/60 hover:border-border text-foreground/90'
      }`}
    >
      {/* Handle icon: Lock icon when locked, Grip handle when draggable */}
      {isLocked ? (
        <div
          className="text-muted-foreground/60 p-0.5 -ml-1 shrink-0 cursor-default"
          title="Item is locked (Reordering disabled)"
          onClick={(e) => e.stopPropagation()}
        >
          <Lock className="w-3.5 h-3.5" />
        </div>
      ) : (
        <div
          {...attributes}
          {...listeners}
          className="opacity-20 group-hover:opacity-80 hover:!opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground p-0.5 -ml-1 transition-opacity touch-none shrink-0"
          title="Drag to reorder within group"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Item title only */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-xs tracking-tight truncate text-foreground">
          {item.title}
        </span>
      </div>
    </div>
  );
}
