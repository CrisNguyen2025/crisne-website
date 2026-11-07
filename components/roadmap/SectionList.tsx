'use client';

import React from 'react';
import { ChevronRight, Pencil, Plus, Ungroup } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChecklistItem } from '@/lib/roadmap/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { cn } from '@/lib/utils';
import { ChecklistItemRow } from './ChecklistItemRow';

interface SectionListProps {
  /** null is the group of lessons outside any section */
  section: string | null;
  items: ChecklistItem[];
  activeItemId: string;
  canWrite: boolean;
  isLocked: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectItem: (id: string) => void;
  /** The section's lessons in their new order; the page reorders the whole topic from it */
  onReorder: (reordered: ChecklistItem[]) => void;
  onOpenCreateItem: (section: string | null) => void;
  onRenameSection: (section: string) => void;
  onDissolveSection: (section: string) => void;
  /** One flat list: no section header, no section menu */
  flat?: boolean;
}

/** A section of a topic and its lessons, which can be reordered within the section (ADR-0009). */
export function SectionList({
  section,
  items,
  activeItemId,
  canWrite,
  isLocked,
  isCollapsed,
  onToggleCollapse,
  onSelectItem,
  onReorder,
  onOpenCreateItem,
  onRenameSection,
  onDissolveSection,
  flat = false,
}: SectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const isDraggable = canWrite && !isLocked;
  const title = section ?? 'Chung';

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!isDraggable || !over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <section>
      {!flat && (
      <div
        onClick={onToggleCollapse}
        className="group/gh flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform duration-200', !isCollapsed && 'rotate-90')} />
        <span className="truncate">{title}</span>
        <span className="ml-auto tabular-nums">{items.length}</span>
        {canWrite && (
          <ActionMenu
            label="Section actions"
            triggerClassName="size-6 lg:opacity-0 lg:group-hover/gh:opacity-100 lg:aria-expanded:opacity-100"
            items={[
              { label: 'Thêm bài vào mục', icon: Plus, onSelect: () => onOpenCreateItem(section) },
              ...(section !== null
                ? [
                    { label: 'Đổi tên mục', icon: Pencil, onSelect: () => onRenameSection(section) },
                    {
                      label: 'Bỏ mục (về Chung)',
                      icon: Ungroup,
                      onSelect: () => onDissolveSection(section),
                      confirm: {
                        title: `Bỏ mục "${section}"?`,
                        description: `${items.length} bài chuyển về Chung. Bài học không bị xoá.`,
                        confirmLabel: 'Bỏ mục',
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      )}

      {(flat || !isCollapsed) && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 pb-1">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  isDraggable={isDraggable}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
              {items.length === 0 && canWrite && (
                <button
                  type="button"
                  onClick={() => onOpenCreateItem(section)}
                  className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  + Thêm bài đầu tiên
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
