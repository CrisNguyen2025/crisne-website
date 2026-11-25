'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Ungroup } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChecklistItem, RoadmapMeta, RoadmapStats, SectionGroup } from '@/lib/roadmap/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { lessonPath } from '@/lib/roadmap/paths';
import type { LessonStatus } from '@/lib/roadmap/status';
import { RoadmapView, ViewToggle } from './ViewToggle';
import { SECTIONS_ENABLED } from './sectionsEnabled';

interface RoadmapMapProps {
  sectionGroups: SectionGroup[];
  currentRoadmap?: RoadmapMeta | null;
  stats: RoadmapStats;
  activeItemId?: string;
  isLoading?: boolean;
  view?: RoadmapView;
  onViewChange?: (view: RoadmapView) => void;
  onSelectItem?: (id: string) => void;
  embedded?: boolean;
  canWrite?: boolean;
  isLocked?: boolean;
  onOpenCreateItem?: (section: string | null) => void;
  onRenameSection?: (section: string) => void;
  onDissolveSection?: (section: string) => void;
  onReorderSection?: (section: string | null, reordered: ChecklistItem[]) => void;
}

const STATUS_DOT: Record<LessonStatus, string> = {
  target: 'bg-[var(--status-target)]',
  learning: 'bg-[var(--status-learning)]',
  known: '',
};

interface MapChipProps {
  item: ChecklistItem;
  topicSlug: string;
  isActive: boolean;
  onSelectItem?: (id: string) => void;
}

function chipClassName(
  hasBody: boolean,
  isActive: boolean,
  isDragging = false,
  sortable = false
): string {
  return cn(
    'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-xs ease-out',
    sortable
      ? 'transition-[border-color,background-color,color,box-shadow] duration-150 select-none'
      : 'transition-[border-color,background-color,color,transform] duration-150 active:scale-[0.98]',
    hasBody
      ? 'border-border/90 bg-background/80 text-foreground shadow-[0_0.0625rem_0.0625rem_oklch(0_0_0/0.02)] hover:border-foreground/30 hover:bg-muted/50'
      : 'border-dashed border-border/90 bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
    isActive && 'border-foreground ring-1 ring-foreground',
    isDragging && 'z-20 opacity-85 shadow-md ring-1 ring-foreground/20'
  );
}

function ChipInner({ item }: { item: ChecklistItem }) {
  const statusDot = item.status && item.status !== 'known' ? STATUS_DOT[item.status] : '';
  return (
    <>
      {statusDot && <span className={cn('size-1.5 shrink-0 rounded-full', statusDot)} />}
      <span className="truncate">{item.title}</span>
    </>
  );
}

function StaticMapChip({ item, topicSlug, isActive, onSelectItem }: MapChipProps) {
  const hasBody = Boolean(item.hasContent ?? item.content);
  const className = chipClassName(hasBody, isActive);

  if (onSelectItem) {
    return (
      <button
        type="button"
        onClick={() => onSelectItem(item.id)}
        title={item.description || item.title}
        className={className}
      >
        <ChipInner item={item} />
      </button>
    );
  }

  return (
    <Link
      href={lessonPath(item.roadmapSlug || topicSlug, item.slug || item.id)}
      prefetch={true}
      title={item.description || item.title}
      className={className}
    >
      <ChipInner item={item} />
    </Link>
  );
}

function SortableMapChip({
  item,
  topicSlug,
  isActive,
  onSelectItem,
  suppressClickRef,
}: MapChipProps & { suppressClickRef: React.MutableRefObject<boolean> }) {
  const hasBody = Boolean(item.hasContent ?? item.content);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  const className = cn(
    chipClassName(hasBody, isActive, isDragging, true),
    'touch-manipulation',
    !isDragging && 'active:scale-[0.98]',
    isDragging ? 'cursor-grabbing' : 'cursor-pointer'
  );

  if (onSelectItem) {
    return (
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        type="button"
        onClickCapture={handleClickCapture}
        onClick={() => onSelectItem(item.id)}
        title={item.description || item.title}
        className={className}
      >
        <ChipInner item={item} />
      </button>
    );
  }

  return (
    <Link
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      href={lessonPath(item.roadmapSlug || topicSlug, item.slug || item.id)}
      prefetch={true}
      draggable={false}
      onClickCapture={handleClickCapture}
      title={item.description || item.title}
      className={className}
    >
      <ChipInner item={item} />
    </Link>
  );
}

function SortableSectionChips({
  section,
  items,
  topicSlug,
  activeItemId,
  onSelectItem,
  onReorderSection,
}: {
  section: string | null;
  items: ChecklistItem[];
  topicSlug: string;
  activeItemId: string;
  onSelectItem?: (id: string) => void;
  onReorderSection: (section: string | null, reordered: ChecklistItem[]) => void;
}) {
  const suppressClickRef = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const releaseClickLock = () => {
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 60);
  };

  const handleDragStart = () => {
    suppressClickRef.current = true;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    releaseClickLock();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderSection(section, arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      id={`roadmap-map-${section ?? '__none__'}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={releaseClickLock}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="mt-3 flex flex-wrap gap-2">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">Chưa có bài học nào.</p>
          )}
          {items.map((item) => (
            <SortableMapChip
              key={item.id}
              item={item}
              topicSlug={topicSlug}
              isActive={item.id === activeItemId}
              onSelectItem={onSelectItem}
              suppressClickRef={suppressClickRef}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function RoadmapMap({
  sectionGroups,
  currentRoadmap,
  stats,
  activeItemId = '',
  isLoading = false,
  view = 'map',
  onViewChange,
  onSelectItem,
  embedded = false,
  canWrite = false,
  isLocked = false,
  onOpenCreateItem,
  onRenameSection,
  onDissolveSection,
  onReorderSection,
}: RoadmapMapProps) {
  const sectionCount = sectionGroups.filter((g) => g.section !== null).length;
  const stations = SECTIONS_ENABLED
    ? sectionGroups
    : [{ section: null, items: sectionGroups.flatMap((g) => g.items) }];
  const canReorder = canWrite && !isLocked && !currentRoadmap?.isLocked && Boolean(onReorderSection);
  const topicSlug = currentRoadmap?.slug ?? '';

  return (
    <div className={cn('flex w-full flex-col', !embedded && 'h-full overflow-hidden')}>
      {!embedded && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight text-foreground">
              {currentRoadmap?.title || (isLoading ? '…' : 'Roadmap')}
            </h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {isLoading && 'Loading…'}
              {!isLoading && SECTIONS_ENABLED && `${stats.total} bài · ${sectionCount} mục`}
              {!isLoading && !SECTIONS_ENABLED && `${stats.total} bài`}
            </p>
          </div>
          {onViewChange && <ViewToggle value={view} onChange={onViewChange} />}
        </div>
      )}

      <div className={cn(!embedded && 'flex-1 overflow-auto scrollbar-thin p-4 md:p-6')}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            {stations.map((group) => (
              <li
                key={group.section ?? '__none__'}
                className="flex flex-col rounded-xl border border-border/90 bg-card p-4 shadow-[0_0.0625rem_0.125rem_oklch(0_0_0/0.025)]"
              >
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">
                    {group.section ?? 'Chung'}
                  </h2>
                  <span className="text-xs tabular-nums text-muted-foreground/80">
                    {group.items.length}
                  </span>
                  {canWrite && (
                    <ActionMenu
                      label="Thao tác mục"
                      items={[
                        ...(onOpenCreateItem
                          ? [
                              {
                                label: 'Thêm bài vào mục',
                                icon: Plus,
                                onSelect: () => onOpenCreateItem(group.section),
                              },
                            ]
                          : []),
                        ...(group.section !== null && onRenameSection
                          ? [
                              {
                                label: 'Đổi tên mục',
                                icon: Pencil,
                                onSelect: () => onRenameSection(group.section as string),
                              },
                            ]
                          : []),
                        ...(group.section !== null && onDissolveSection
                          ? [
                              {
                                label: 'Bỏ mục (về Chung)',
                                icon: Ungroup,
                                onSelect: () => onDissolveSection(group.section as string),
                                confirm: {
                                  title: `Bỏ mục "${group.section}"?`,
                                  description: `${group.items.length} bài học sẽ chuyển về Chung.`,
                                  confirmLabel: 'Bỏ mục',
                                },
                              },
                            ]
                          : []),
                      ]}
                    />
                  )}
                </div>

                {canReorder && onReorderSection ? (
                  <SortableSectionChips
                    section={group.section}
                    items={group.items}
                    topicSlug={topicSlug}
                    activeItemId={activeItemId}
                    onSelectItem={onSelectItem}
                    onReorderSection={onReorderSection}
                  />
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.items.length === 0 && (
                      <p className="text-xs text-muted-foreground">Chưa có bài học nào.</p>
                    )}
                    {group.items.map((item) => (
                      <StaticMapChip
                        key={item.id}
                        item={item}
                        topicSlug={topicSlug}
                        isActive={item.id === activeItemId}
                        onSelectItem={onSelectItem}
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
