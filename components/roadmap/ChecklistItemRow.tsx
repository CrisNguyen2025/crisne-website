'use client';

import React from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChecklistItem } from '@/lib/roadmap/types';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  isActive: boolean;
  onSelect: () => void;
}

export function ChecklistItemRow({
  item,
  isActive,
  onSelect,
}: ChecklistItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

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
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-20 group-hover:opacity-80 hover:!opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground p-0.5 -ml-1 transition-opacity touch-none shrink-0"
        title="Kéo thả sắp xếp trong nhóm"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Item title and description only */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="font-medium text-xs tracking-tight truncate text-foreground">
          {item.title}
        </span>
        <p className="text-[11px] text-muted-foreground truncate font-normal">
          {item.description}
        </p>
      </div>
    </div>
  );
}
