'use client';

import React, { useState, ReactNode } from 'react';

// ─── Smooth Collapsible ───────────────────────────────────────────────────────
// CSS grid-template-rows trick: animates 0fr ↔ 1fr so height transitions
// without requiring a JS ResizeObserver or fixed pixel measurement.
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

import {
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
  Layers,
  MoreHorizontal,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { RoadmapLayer, RoadmapLevel, ChecklistItem, RoadmapStats } from '@/lib/roadmap/types';
import { ChecklistItemRow } from './ChecklistItemRow';
import { EditLayerModal } from './EditLayerModal';
import { CreateGroupModal } from './CreateGroupModal';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loaders — shown while data is fetching from BE
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonPill({ width = 'w-14' }: { width?: string }) {
  return <div className={`${width} h-6 rounded-lg bg-muted/60 animate-pulse shrink-0`} />;
}

function SkeletonItemRow() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/30 bg-card/50">
      <div className="w-3.5 h-3.5 rounded bg-muted/50 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-2.5 w-2/3 rounded bg-muted/60 animate-pulse" />
        <div className="h-2 w-4/5 rounded bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonLayerCard() {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-muted/30 flex items-center justify-between">
        <div className="h-3 w-32 rounded bg-muted/60 animate-pulse" />
        <div className="h-4 w-12 rounded-full bg-muted/40 animate-pulse" />
      </div>
      <div className="p-2 space-y-1.5">
        <SkeletonItemRow />
        <SkeletonItemRow />
        <SkeletonItemRow />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SortableGroup
// ─────────────────────────────────────────────────────────────────────────────

interface SortableGroupProps {
  layerId: string;
  level: RoadmapLevel;
  title: string;
  items: ChecklistItem[];
  activeItemId: string;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (layerId: string, level: RoadmapLevel, reorderedItems: ChecklistItem[]) => void;
  onOpenCreateItem: (layerId: string, level: RoadmapLevel) => void;
  onDeleteItem: (itemId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function SortableGroup({
  layerId,
  level,
  title,
  items,
  activeItemId,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateItem,
  onDeleteItem,
  isCollapsed,
  onToggleCollapse,
}: SortableGroupProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderGroupItems(layerId, level, arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        onClick={onToggleCollapse}
        className="group/gh flex items-center justify-between px-2 py-1 rounded-lg hover:bg-muted/40 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronRight
            className={`w-3 h-3 text-muted-foreground/70 shrink-0 transition-transform duration-300 ease-in-out ${
              isCollapsed ? 'rotate-0' : 'rotate-90'
            }`}
          />
          <span className="truncate">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenCreateItem(layerId, level); }}
            className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
            title={`Add new item to ${title}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-medium text-muted-foreground/70 bg-background/60 px-2 py-0.5 rounded-full border border-border/40">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      <Collapsible open={!isCollapsed}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 pl-1 pb-0.5">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
              {items.length === 0 && (
                <button
                  type="button"
                  onClick={() => onOpenCreateItem(layerId, level)}
                  className="w-full text-center py-2 text-[11px] text-muted-foreground/60 hover:text-primary hover:bg-primary/5 rounded-lg border border-dashed border-border/40 transition-colors cursor-pointer"
                >
                  + Add first item
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </Collapsible>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterPanel
// ─────────────────────────────────────────────────────────────────────────────

interface MasterPanelProps {
  layers: RoadmapLayer[];
  allLayers: RoadmapLayer[];
  activeItemId: string;
  selectedLayerId: string | 'all';
  stats: RoadmapStats;
  /** Pass true while fetching data from API to show skeleton loaders */
  isLoading?: boolean;
  /** Pass true when an API error occurred to show error state */
  isError?: boolean;
  onLayerChange: (layerId: string | 'all') => void;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (layerId: string, level: RoadmapLevel, newItems: ChecklistItem[]) => void;
  onOpenCreateLayer: () => void;
  onOpenCreateItem: (layerId: string, level: RoadmapLevel) => void;
  onAddGroup?: (layerId: string, title: string) => void;
  onEditLayer?: (layerId: string, title: string, shortTag: string, subtitle?: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onDeleteItem: (itemId: string) => void;
}

export function MasterPanel({
  layers,
  allLayers,
  activeItemId,
  selectedLayerId,
  stats,
  isLoading = false,
  isError = false,
  onLayerChange,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateLayer,
  onOpenCreateItem,
  onAddGroup,
  onEditLayer,
  onDeleteLayer,
  onDeleteItem,
}: MasterPanelProps) {
  const [collapsedLayers, setCollapsedLayers] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activePopoverLayerId, setActivePopoverLayerId] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<RoadmapLayer | null>(null);
  const [targetGroupLayer, setTargetGroupLayer] = useState<RoadmapLayer | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const toggleLayer = (layerId: string) =>
    setCollapsedLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));

  const toggleGroup = (groupKey: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) =>
    setShowScrollTop(e.currentTarget.scrollTop > 240);

  const scrollToTop = () =>
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

  const handleSaveEditLayer = (layerId: string, title: string, shortTag: string, subtitle?: string) => {
    onEditLayer?.(layerId, title, shortTag, subtitle);
    setEditingLayer(null);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3.5 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2 h-7">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-xs text-foreground tracking-tight truncate">
                AI Architecture
              </span>
              <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-1.5 py-0.2 rounded border border-border/40">
                {isLoading ? '…' : stats.total}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenCreateLayer}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-colors flex items-center gap-1.5"
              title="Create a new architecture layer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Add layer</span>
            </button>
          </div>
        </div>

        {/* Layer filter tabs */}
        <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/60 overflow-x-auto scrollbar-none">
          {isLoading ? (
            <>
              <SkeletonPill width="w-16" />
              <SkeletonPill width="w-12" />
              <SkeletonPill width="w-12" />
              <SkeletonPill width="w-14" />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onLayerChange('all')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 ${
                  selectedLayerId === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                All ({allLayers.length})
              </button>
              {allLayers.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => onLayerChange(layer.id)}
                  title={layer.title}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedLayerId === layer.id
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {layer.shortTag}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-left scrollbar-thin"
      >
        <div className="p-3 space-y-3">
          {/* Loading skeleton */}
          {isLoading && (
            <>
              <SkeletonLayerCard />
              <SkeletonLayerCard />
            </>
          )}

          {/* Error state */}
          {!isLoading && isError && (
            <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Failed to load data</p>
                <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && layers.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No layers yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Click &quot;Add layer&quot; to create your first architecture layer.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenCreateLayer}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                + Add layer
              </button>
            </div>
          )}

          {/* Layers list — keyed on selectedLayerId so switching segment triggers entrance animation */}
          {!isLoading && !isError && (
            <div
              key={selectedLayerId}
              className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              {layers.map((layer) => {
            const isLayerCollapsed = collapsedLayers[layer.id];
            const layerTotal = layer.groups.reduce((acc, g) => acc + g.items.length, 0);

            return (
              <div
                key={layer.id}
                className={`rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-xs relative transition-all overflow-hidden ${
                  activePopoverLayerId === layer.id ? 'z-30' : 'z-0'
                }`}
              >
                {/* Layer header row */}
                <div
                  onClick={() => toggleLayer(layer.id)}
                  className="group/lh px-3.5 py-2.5 bg-muted/40 hover:bg-muted/70 flex items-center justify-between cursor-pointer select-none transition-colors relative rounded-t-2xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ease-in-out ${
                        isLayerCollapsed ? 'rotate-0' : 'rotate-90'
                      }`}
                    />
                    <span className="font-semibold text-xs tracking-tight text-foreground truncate">
                      {layer.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Actions popover */}
                    <div className="relative shrink-0" onMouseLeave={() => setActivePopoverLayerId(null)}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopoverLayerId(
                            activePopoverLayerId === layer.id ? null : layer.id
                          );
                        }}
                        className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-background/80 rounded-md transition-colors"
                        title="Layer options"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {activePopoverLayerId === layer.id && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={(e) => { e.stopPropagation(); setActivePopoverLayerId(null); }}
                          />
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onMouseLeave={() => setActivePopoverLayerId(null)}
                            className="absolute right-0 top-full mt-1 z-40 w-52 bg-popover/95 border border-border/80 rounded-xl shadow-lg p-1 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs font-normal"
                          >
                            <button
                              type="button"
                              onClick={() => { setActivePopoverLayerId(null); setTargetGroupLayer(layer); }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                            >
                              <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Create level group</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActivePopoverLayerId(null);
                                onOpenCreateItem(layer.id, layer.groups[0]?.level || 'core');
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                            >
                              <Plus className="w-3.5 h-3.5 text-primary" />
                              <span>Create item</span>
                            </button>

                            <div className="my-1 border-t border-border/40" />

                            <button
                              type="button"
                              onClick={() => { setActivePopoverLayerId(null); setEditingLayer(layer); }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                            >
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                              <span>Edit layer</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActivePopoverLayerId(null);
                                if (layerTotal > 0) {
                                  alert(
                                    `Cannot delete "${layer.title}" — it has ${layerTotal} item${layerTotal === 1 ? '' : 's'}. Remove all items first.`
                                  );
                                  return;
                                }
                                if (confirm(`Delete layer "${layer.title}"? This cannot be undone.`)) {
                                  onDeleteLayer(layer.id);
                                }
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors text-left font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete layer</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <span className="text-[10px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                      {layerTotal} {layerTotal === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>

                {/* Groups — smooth expand/collapse via Collapsible */}
                <Collapsible open={!isLayerCollapsed}>
                  <div className="p-2 space-y-2.5 border-t border-border/30">
                    {layer.groups.map((group) => {
                      const groupKey = `${layer.id}-${group.level}`;
                      return (
                        <SortableGroup
                          key={groupKey}
                          layerId={layer.id}
                          level={group.level}
                          title={group.title}
                          items={group.items}
                          activeItemId={activeItemId}
                          onSelectItem={onSelectItem}
                          onReorderGroupItems={onReorderGroupItems}
                          onOpenCreateItem={onOpenCreateItem}
                          onDeleteItem={onDeleteItem}
                          isCollapsed={Boolean(collapsedGroups[groupKey])}
                          onToggleCollapse={() => toggleGroup(groupKey)}
                        />
                      );
                    })}
                  </div>
                </Collapsible>
              </div>
            );
          })}
            </div>
          )}
        </div>
      </div>

      <EditLayerModal
        isOpen={Boolean(editingLayer)}
        layer={editingLayer}
        onClose={() => setEditingLayer(null)}
        onSubmit={handleSaveEditLayer}
      />

      <CreateGroupModal
        isOpen={Boolean(targetGroupLayer)}
        layer={targetGroupLayer}
        onClose={() => setTargetGroupLayer(null)}
        onSubmit={(layerId, title) => onAddGroup?.(layerId, title)}
      />

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-5 right-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
