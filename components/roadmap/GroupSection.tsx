'use client';

import React from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { ChecklistItem, RoadmapGroup } from '@/lib/roadmap/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { cn } from '@/lib/utils';
import { ChecklistItemRow } from './ChecklistItemRow';

interface GroupSectionProps {
  layerId: string;
  group: RoadmapGroup;
  activeItemId: string;
  canWrite: boolean;
  isLocked: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (groupId: string, reorderedItems: ChecklistItem[]) => void;
  onOpenCreateItem: (layerId: string, groupId?: string) => void;
  onEditGroup: (group: RoadmapGroup) => void;
  onDeleteGroup: (group: RoadmapGroup) => void;
}

export function GroupSection({
  layerId,
  group,
  activeItemId,
  canWrite,
  isLocked,
  isCollapsed,
  onToggleCollapse,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateItem,
  onEditGroup,
  onDeleteGroup,
}: GroupSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const isDraggable = canWrite && !isLocked;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!isDraggable || !over || active.id === over.id) return;
    const oldIndex = group.items.findIndex((i) => i.id === active.id);
    const newIndex = group.items.findIndex((i) => i.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderGroupItems(group.id, arrayMove(group.items, oldIndex, newIndex));
    }
  };

  return (
    <section>
      <div
        onClick={onToggleCollapse}
        className="group/gh flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform duration-200', !isCollapsed && 'rotate-90')} />
        <span className="truncate">{group.title}</span>
        <span className="ml-auto tabular-nums">{group.items.length}</span>
        {canWrite && (
          <ActionMenu
            label="Group actions"
            triggerClassName="size-6 lg:opacity-0 lg:group-hover/gh:opacity-100 lg:aria-expanded:opacity-100"
            items={[
              { label: 'Add lesson', icon: Plus, onSelect: () => onOpenCreateItem(layerId, group.id) },
              { label: 'Rename group', icon: Pencil, onSelect: () => onEditGroup(group) },
              {
                label: 'Delete group',
                icon: Trash2,
                danger: true,
                onSelect: () => onDeleteGroup(group),
                confirm: {
                  title: `Delete "${group.title}"?`,
                  description: group.items.length > 0 ? 'Its lessons are deleted too.' : 'This cannot be undone.',
                },
              },
            ]}
          />
        )}
      </div>

      {!isCollapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={group.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 pb-1">
              {group.items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  isDraggable={isDraggable}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
              {group.items.length === 0 && canWrite && (
                <button
                  type="button"
                  onClick={() => onOpenCreateItem(layerId, group.id)}
                  className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  + Add first lesson
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
