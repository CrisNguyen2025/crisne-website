'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
  Layers,
  RotateCcw,
  MoreHorizontal,
  ChevronUp,
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(items, oldIndex, newIndex);
      onReorderGroupItems(layerId, level, reordered);
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        onClick={onToggleCollapse}
        className="group/gh flex items-center justify-between px-2 py-1 rounded-lg hover:bg-muted/40 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground/70 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground/70 shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreateItem(layerId, level);
            }}
            className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
            title={`Thêm mục mới vào ${title}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          <span className="text-[10px] font-medium text-muted-foreground/70 bg-background/60 px-2 py-0.5 rounded-full border border-border/40">
            {items.length} khái niệm
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5 pl-1">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeItemId}
                  onSelect={() => onSelectItem(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface MasterPanelProps {
  layers: RoadmapLayer[];
  allLayers: RoadmapLayer[];
  activeItemId: string;
  selectedLayerId: string | 'all';
  stats: RoadmapStats;
  onLayerChange: (layerId: string | 'all') => void;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (layerId: string, level: RoadmapLevel, newItems: ChecklistItem[]) => void;
  onOpenCreateLayer: () => void;
  onOpenCreateItem: (layerId: string, level: RoadmapLevel) => void;
  onAddGroup?: (layerId: string, title: string) => void;
  onEditLayer?: (layerId: string, title: string, shortTag: string, subtitle?: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onResetToDefault?: () => void;
}

export function MasterPanel({
  layers,
  allLayers,
  activeItemId,
  selectedLayerId,
  stats,
  onLayerChange,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateLayer,
  onOpenCreateItem,
  onAddGroup,
  onEditLayer,
  onDeleteLayer,
  onDeleteItem,
  onResetToDefault,
}: MasterPanelProps) {
  const [collapsedLayers, setCollapsedLayers] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activePopoverLayerId, setActivePopoverLayerId] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<RoadmapLayer | null>(null);
  const [targetGroupLayer, setTargetGroupLayer] = useState<RoadmapLayer | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const toggleLayer = (layerId: string) => {
    setCollapsedLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 240);
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleSaveEditLayer = (layerId: string, title: string, shortTag: string, subtitle?: string) => {
    if (onEditLayer) {
      onEditLayer(layerId, title, shortTag, subtitle);
    }
    setEditingLayer(null);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      <div className="p-3 border-b border-border/50 bg-muted/20 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-xs text-foreground tracking-tight truncate">
                AI Architecture
              </span>
              <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-1.5 py-0.2 rounded border border-border/40">
                {stats.total}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenCreateLayer}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-colors flex items-center gap-1.5"
              title="Tạo Tầng kiến trúc mới cho Topic này"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Thêm tầng</span>
            </button>

            {onResetToDefault && (
              <button
                type="button"
                onClick={onResetToDefault}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Khôi phục dữ liệu ban đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/60 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => onLayerChange('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 ${
              selectedLayerId === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Tất cả ({allLayers.length})
          </button>

          {allLayers.map((layer) => {
            const isSelected = selectedLayerId === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => onLayerChange(layer.id)}
                title={layer.title}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <span>{layer.shortTag}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-left scrollbar-thin"
      >
        <div className="p-3 space-y-3">
          {layers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Chưa có Tầng dữ liệu nào. Hãy bấm &quot;Thêm tầng&quot; để bắt đầu tạo mới!
            </div>
          ) : (
            layers.map((layer) => {
              const isLayerCollapsed = collapsedLayers[layer.id];

              let layerTotal = 0;
              layer.groups.forEach((g) => {
                layerTotal += g.items.length;
              });

              return (
                <div
                  key={layer.id}
                  className={`rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-xs relative transition-all ${
                    activePopoverLayerId === layer.id ? 'z-30' : 'z-0'
                  }`}
                >
                  <div
                    onClick={() => toggleLayer(layer.id)}
                    className={`group/lh px-3.5 py-2.5 bg-muted/40 hover:bg-muted/70 flex items-center justify-between cursor-pointer select-none transition-colors relative ${
                      isLayerCollapsed ? 'rounded-2xl' : 'rounded-t-2xl border-b border-border/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isLayerCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    
                      <span className="font-semibold text-xs tracking-tight text-foreground truncate">
                        {layer.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className="relative shrink-0"
                        onMouseLeave={() => setActivePopoverLayerId(null)}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePopoverLayerId(
                              activePopoverLayerId === layer.id ? null : layer.id
                            );
                          }}
                          className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-background/80 rounded-md transition-colors"
                          title="Tùy chọn tầng"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {activePopoverLayerId === layer.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePopoverLayerId(null);
                              }}
                            />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              onMouseLeave={() => setActivePopoverLayerId(null)}
                              className="absolute right-0 top-full mt-1 z-40 w-52 bg-popover/95 border border-border/80 rounded-xl shadow-lg p-1 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs font-normal"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePopoverLayerId(null);
                                  setTargetGroupLayer(layer);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                              >
                                <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Tạo nhóm cấp độ (Group)</span>
                              </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePopoverLayerId(null);
                                    const defaultLevel = layer.groups[0]?.level || 'core';
                                    onOpenCreateItem(layer.id, defaultLevel);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                                >
                                <Plus className="w-3.5 h-3.5 text-primary" />
                                <span>Tạo khái niệm (Item)</span>
                              </button>

                              <div className="my-1 border-t border-border/40" />

                              <button
                                type="button"
                                onClick={() => {
                                  setActivePopoverLayerId(null);
                                  setEditingLayer(layer);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                              >
                                <Pencil className="w-3.5 h-3.5 text-amber-500" />
                                <span>Sửa tầng này (Edit)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActivePopoverLayerId(null);
                                  if (layerTotal > 0) {
                                    alert(
                                      `Không thể xóa tầng "${layer.title}" vì đang chứa ${layerTotal} khái niệm con. Vui lòng xóa hết khái niệm con trước khi xóa tầng này!`
                                    );
                                    return;
                                  }
                                  if (confirm(`Bạn có chắc chắn muốn xóa tầng "${layer.title}"?`)) {
                                    onDeleteLayer(layer.id);
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors text-left font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa tầng này (Delete)</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <span className="text-[10px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                        {layerTotal} khái niệm
                      </span>
                    </div>
                  </div>

                  {!isLayerCollapsed && (
                    <div className="p-2 space-y-2.5">
                      {layer.groups.map((group) => {
                        const groupKey = `${layer.id}-${group.level}`;
                        const isGroupCollapsed = collapsedGroups[groupKey];

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
                            isCollapsed={Boolean(isGroupCollapsed)}
                            onToggleCollapse={() => toggleGroup(groupKey)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
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
        onSubmit={(layerId, title) => {
          if (onAddGroup) {
            onAddGroup(layerId, title);
          }
        }}
      />

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-5 right-5 z-30 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-border/20 flex items-center justify-center animate-in fade-in zoom-in-75 cursor-pointer"
          title="Cuộn lên đầu trang"
          aria-label="Cuộn lên đầu trang"
        >
          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
