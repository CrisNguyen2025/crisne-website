'use client';

import React, { useState, ReactNode } from 'react';

// ─── Smooth Collapsible ───────────────────────────────────────────────────────
// CSS grid-template-rows + opacity with cubic-bezier easing:
// guarantees zero jitter, perfect clipping, and buttery smooth expand/collapse.
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [isStableOpen, setIsStableOpen] = useState(open);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setIsStableOpen(true), 320);
      return () => clearTimeout(timer);
    } else {
      setIsStableOpen(false);
    }
  }, [open]);

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${
        open && isStableOpen ? 'overflow-visible' : 'overflow-hidden'
      }`}
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
      }}
    >
      <div className={`min-h-0 ${open && isStableOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
        {children}
      </div>
    </div>
  );
}

import {
  ChevronRight,
  ChevronsRight,
  ChevronsLeft,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
  Layers,
  MoreHorizontal,
  ChevronUp,
  AlertTriangle,
  Lock,
  Unlock,
  Search,
  X,
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
import { RoadmapLayer, RoadmapLevel, ChecklistItem, RoadmapStats, RoadmapMeta } from '@/lib/roadmap/types';
import { useToast } from '@/components/ui/toast';
import { Popconfirm } from 'antd';
import { ChecklistItemRow } from './ChecklistItemRow';
import { EditLayerModal } from './EditLayerModal';
import { CreateGroupModal } from './CreateGroupModal';
import { EditGroupModal } from './EditGroupModal';
import { EditTopicModal } from './EditTopicModal';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loaders — shown while data is fetching from BE
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonPill({ width = 'w-14' }: { width?: string }) {
  return (
    <div
      className={`${width} h-7 rounded-lg bg-muted/50 border border-border/30 shrink-0 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent`}
    />
  );
}

function SkeletonItemRow() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/40 bg-card/60 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent">
      <div className="w-3.5 h-3.5 rounded bg-muted/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3 w-3/5 rounded bg-muted/70" />
        <div className="h-2 w-4/5 rounded bg-muted/40" />
      </div>
    </div>
  );
}

function SkeletonLayerCard() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 overflow-hidden shadow-xs">
      <div className="px-3.5 py-3 bg-muted/30 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-muted/60" />
          <div className="h-3.5 w-32 rounded-md bg-muted/70" />
        </div>
        <div className="h-4 w-10 rounded-full bg-muted/50" />
      </div>
      <div className="p-2.5 space-y-2">
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
  groupId?: string;
  level: RoadmapLevel;
  title: string;
  items: ChecklistItem[];
  activeItemId: string;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (layerId: string, level: RoadmapLevel, reorderedItems: ChecklistItem[]) => void;
  onOpenCreateItem: (layerId: string, level: RoadmapLevel) => void;
  onEditGroup?: (group: { id: string; title: string; level: RoadmapLevel; items: ChecklistItem[] }) => void;
  onDeleteGroup?: (groupId: string, groupTitle: string, itemCount: number) => void;
  onDeleteItem: (itemId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLocked?: boolean;
  isActionsOpen: boolean;
  onToggleActions: () => void;
  onCloseActions: () => void;
}

function SortableGroup({
  layerId,
  groupId,
  level,
  title,
  items,
  activeItemId,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateItem,
  onEditGroup,
  onDeleteGroup,
  onDeleteItem,
  isCollapsed,
  onToggleCollapse,
  isLocked = false,
  isActionsOpen,
  onToggleActions,
  onCloseActions,
}: SortableGroupProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (isLocked) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderGroupItems(layerId, level, arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <div className={`space-y-1.5 transition-all ${isActionsOpen ? 'relative z-50' : 'relative z-0'}`}>
      <div
        onClick={onToggleCollapse}
        className="group/gh flex items-center justify-between px-2 py-1 rounded-lg hover:bg-muted/40 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground relative"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronRight
            className={`w-3 h-3 text-muted-foreground/70 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${
              isCollapsed ? 'rotate-0' : 'rotate-90'
            }`}
          />
          <span className="truncate">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Actions popover */}
          <div className="relative shrink-0">
            <button
              type="button"
              data-dropdown-trigger="true"
              onClick={(e) => {
                e.stopPropagation();
                onToggleActions();
              }}
              className={`p-1 rounded-md transition-colors ${
                isActionsOpen
                  ? 'text-foreground bg-muted'
                  : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/80'
              }`}
              title="Group actions"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isActionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseActions();
                  }}
                />
                <div
                  data-dropdown-menu="true"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 z-50 w-44 bg-popover/95 border border-border/80 rounded-xl shadow-xl p-1 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs font-normal"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onCloseActions();
                      onOpenCreateItem(layerId, level);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Create item</span>
                  </button>

                  {groupId && onEditGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseActions();
                        onEditGroup({ id: groupId, title, level, items });
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-500" />
                      <span>Edit group</span>
                    </button>
                  )}

                  {onDeleteGroup && (
                    <Popconfirm
                      title="Delete group?"
                      description={items.length > 0 ? "All items inside will be deleted." : "This action cannot be undone."}
                      onConfirm={() => {
                        const targetId = groupId || level;
                        onDeleteGroup(targetId, title, items.length);
                        onCloseActions();
                      }}
                      onCancel={() => onCloseActions()}
                      okText="Delete"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true, size: 'small' }}
                      cancelButtonProps={{ size: 'small' }}
                      icon={<Trash2 className="w-4 h-4 text-rose-500 mr-1.5 shrink-0 inline-block" />}
                      placement="bottomRight"
                      zIndex={9999}
                    >
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors text-left font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete group</span>
                      </button>
                    </Popconfirm>
                  )}
                </div>
              </>
            )}
          </div>

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
                  isLocked={isLocked}
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
  currentRoadmap?: (RoadmapMeta & { [key: string]: any }) | null;
  roadmaps?: { slug: string; title: string }[];
  onRoadmapChange?: (slug: string) => void;
  onEditRoadmap?: (title: string, shortCode: string, description?: string) => Promise<void>;
  onDeleteRoadmap?: (slug: string) => void;
  onToggleLock?: (locked?: boolean) => void;
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
  onEditGroup?: (groupId: string, title: string) => void;
  onDeleteGroup?: (groupId: string) => void;
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
  currentRoadmap,
  roadmaps = [],
  onRoadmapChange,
  onEditRoadmap,
  isLoading = false,
  isError = false,
  onLayerChange,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateLayer,
  onOpenCreateItem,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onEditLayer,
  onDeleteLayer,
  onDeleteItem,
  onDeleteRoadmap,
  onToggleLock,
}: MasterPanelProps) {
  const { toast } = useToast();
  const [collapsedLayers, setCollapsedLayers] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isEditTopicOpen, setIsEditTopicOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Sync with currentRoadmap?.isLocked, fallback to false
  const isItemsLocked = Boolean(currentRoadmap?.isLocked);

  const toggleItemsLock = () => {
    onToggleLock?.(!isItemsLocked);
  };

  const [editingLayer, setEditingLayer] = useState<RoadmapLayer | null>(null);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [targetGroupLayer, setTargetGroupLayer] = useState<RoadmapLayer | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Filter layers based on search query
  const displayLayers = React.useMemo(() => {
    if (!searchQuery.trim()) return layers;
    const q = searchQuery.trim().toLowerCase();
    return layers
      .map((layer) => {
        const matchingGroups = layer.groups
          .map((group) => {
            const matchingItems = group.items.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description?.toLowerCase().includes(q)
            );
            return { ...group, items: matchingItems };
          })
          .filter((group) => group.items.length > 0);

        return { ...layer, groups: matchingGroups };
      })
      .filter((layer) => layer.groups.length > 0);
  }, [layers, searchQuery]);

  // Total matching search count
  const totalSearchMatches = React.useMemo(() => {
    if (!searchQuery.trim()) return 0;
    return displayLayers.reduce(
      (acc, l) => acc + l.groups.reduce((gAcc, g) => gAcc + g.items.length, 0),
      0
    );
  }, [displayLayers, searchQuery]);

  // Flattened visible items list for keyboard arrow navigation
  const visibleItems = React.useMemo(() => {
    return displayLayers.flatMap((l) => l.groups.flatMap((g) => g.items));
  }, [displayLayers]);

  // Quick Ctrl+F / Cmd+F shortcut to open search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ArrowUp / ArrowDown navigation across checklist items
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (isInputActive) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (visibleItems.length === 0) return;
        e.preventDefault();

        const currentIndex = visibleItems.findIndex((i) => i.id === activeItemId);
        let nextIndex = 0;

        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visibleItems.length - 1);
        } else {
          nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
        }

        const targetItem = visibleItems[nextIndex];
        if (targetItem && targetItem.id !== activeItemId) {
          onSelectItem(targetItem.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, activeItemId, onSelectItem]);

  // Auto-close active dropdown on click-outside, scroll, or Escape key
  React.useEffect(() => {
    if (!activeDropdownId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-dropdown-trigger]') ||
        target?.closest('[data-dropdown-menu]') ||
        target?.closest('.ant-popover') ||
        target?.closest('.ant-popconfirm') ||
        target?.closest('.ant-modal') ||
        target?.closest('.ant-dropdown') ||
        target?.closest('.ant-tooltip')
      ) {
        return;
      }
      setActiveDropdownId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdownId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDropdownId]);

  // Layer filter tabs horizontal scroll tracking (for gradient fade + << / >> indicators)
  const tabsContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabsScroll = React.useCallback(() => {
    const el = tabsContainerRef.current;
    if (el) {
      // Allow 2px tolerance for subpixel rounding
      const hasMoreLeft = el.scrollLeft > 2;
      const hasMoreRight = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
      setCanScrollLeft(hasMoreLeft);
      setCanScrollRight(hasMoreRight);
    }
  }, []);

  React.useEffect(() => {
    checkTabsScroll();
    const el = tabsContainerRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkTabsScroll, { passive: true });
    window.addEventListener('resize', checkTabsScroll);

    const resizeObserver = new ResizeObserver(() => checkTabsScroll());
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', checkTabsScroll);
      window.removeEventListener('resize', checkTabsScroll);
      resizeObserver.disconnect();
    };
  }, [checkTabsScroll, allLayers]);

  const handleScrollTabsLeft = () => {
    tabsContainerRef.current?.scrollBy({ left: -140, behavior: 'smooth' });
  };

  const handleScrollTabsRight = () => {
    tabsContainerRef.current?.scrollBy({ left: 140, behavior: 'smooth' });
  };

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
      <div className="px-4 py-3.5 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0 space-y-2.5 relative z-30">
        <div className="h-7 relative flex items-center">
          {!isSearchOpen && !searchQuery ? (
            /* Standard Header: Topic Title & Action Buttons */
            <div className="w-full flex items-center justify-between gap-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="font-bold text-xs text-foreground tracking-tight truncate">
                  {currentRoadmap?.title || 'Architecture Roadmap'}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 shrink-0">
                  {isLoading ? '…' : stats.total}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="p-1.5 rounded-lg transition-colors cursor-pointer border text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/40"
                  title="Search items (Ctrl+F / ⌘F)"
                  aria-label="Search items"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleItemsLock}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                    isItemsLocked
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/40'
                  }`}
                  title={isItemsLocked ? 'Unlock item reordering (drag & drop disabled)' : 'Lock item reordering'}
                  aria-label={isItemsLocked ? 'Unlock items' : 'Lock items'}
                >
                  {isItemsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    data-dropdown-trigger="true"
                    onClick={() =>
                      setActiveDropdownId((prev) => (prev === 'topic' ? null : 'topic'))
                    }
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                      activeDropdownId === 'topic'
                        ? 'text-foreground bg-muted border-border'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/40'
                    }`}
                    title="Topic options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {activeDropdownId === 'topic' && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setActiveDropdownId(null)}
                      />
                      <div
                        data-dropdown-menu="true"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1.5 z-50 w-44 bg-popover/95 border border-border/80 rounded-xl shadow-xl p-1 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs font-normal"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdownId(null);
                            onOpenCreateLayer();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left font-medium cursor-pointer"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-primary" />
                          <span>Add layer</span>
                        </button>

                        {onEditRoadmap && currentRoadmap && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdownId(null);
                              setIsEditTopicOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left font-medium cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-amber-500" />
                            <span>Edit topic</span>
                          </button>
                        )}

                        {onDeleteRoadmap && currentRoadmap && (
                          <Popconfirm
                            title="Delete topic?"
                            description="All layers and items will be deleted."
                            onConfirm={() => {
                              setActiveDropdownId(null);
                              onDeleteRoadmap(currentRoadmap.slug);
                              toast(`Deleted topic "${currentRoadmap.title}" successfully`, 'success');
                            }}
                            onCancel={() => setActiveDropdownId(null)}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true, size: 'small' }}
                            cancelButtonProps={{ size: 'small' }}
                            icon={<Trash2 className="w-4 h-4 text-rose-500 mr-1.5 shrink-0 inline-block" />}
                            placement="bottomRight"
                            zIndex={9999}
                          >
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors text-left font-medium cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete topic</span>
                            </button>
                          </Popconfirm>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Morph in-place Search Bar (Zero layout shift for elements below) */
            <div className="w-full flex items-center gap-1.5 animate-in fade-in zoom-in-98 duration-150">
              <div className="relative flex-1 flex items-center">
                <Search className="w-3.5 h-3.5 text-primary absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }
                  }}
                  placeholder="Search items in topic... (Esc to exit)"
                  className="w-full h-7 pl-8 pr-16 text-xs bg-muted/50 hover:bg-muted/70 focus:bg-background border border-primary/40 focus:border-primary rounded-lg text-foreground placeholder:text-muted-foreground/60 outline-none transition-all shadow-2xs"
                />
                <div className="absolute right-1.5 flex items-center gap-1">
                  {searchQuery && (
                    <span className="text-[10px] font-semibold text-primary px-1.5 py-0.5 bg-primary/10 rounded border border-primary/20 leading-none">
                      {totalSearchMatches}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/80 transition-colors cursor-pointer"
                    title="Close search (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Layer filter tabs with horizontal scroll fade & << / >> indicators */}
        <div className="relative group/tabs flex items-center">
          {/* Left edge fade gradient & << indicator when scrolled right */}
          <div
            className={`absolute left-0 top-0 bottom-0 pl-1 pr-12 flex items-center justify-start bg-gradient-to-r from-background via-background/90 to-transparent rounded-l-xl z-20 transition-all duration-300 pointer-events-none ${
              canScrollLeft ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
            }`}
          >
            <button
              type="button"
              onClick={handleScrollTabsLeft}
              title="Previous layers (scroll left)"
              disabled={!canScrollLeft}
              className="pointer-events-auto h-7 px-1.5 min-w-[28px] rounded-lg bg-card/90 hover:bg-primary hover:text-primary-foreground border border-border/80 shadow-sm hover:shadow text-muted-foreground transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 backdrop-blur-sm"
            >
              <ChevronsLeft className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>

          <div
            ref={tabsContainerRef}
            className="flex-1 flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/60 overflow-x-auto scrollbar-none no-scrollbar touch-pan-x scroll-smooth"
          >
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

          {/* Right edge fade gradient & >> indicator when scrollable items remain */}
          <div
            className={`absolute right-0 top-0 bottom-0 pr-1 pl-12 flex items-center justify-end bg-gradient-to-l from-background via-background/90 to-transparent rounded-r-xl z-20 transition-all duration-300 pointer-events-none ${
              canScrollRight ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
            }`}
          >
            <button
              type="button"
              onClick={handleScrollTabsRight}
              title="More layers (scroll right)"
              disabled={!canScrollRight}
              className="pointer-events-auto h-7 px-1.5 min-w-[28px] rounded-lg bg-card/90 hover:bg-primary hover:text-primary-foreground border border-border/80 shadow-sm hover:shadow text-primary transition-all duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 backdrop-blur-sm group/btn"
            >
              <ChevronsRight className="w-4 h-4 stroke-[2.2] group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>
          </div>
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
          {!isLoading && !isError && displayLayers.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                {searchQuery ? <Search className="w-5 h-5 text-primary" /> : <Layers className="w-5 h-5 text-primary" />}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {searchQuery ? `No results for "${searchQuery}"` : 'No layers yet'}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {searchQuery
                    ? 'Try searching with different keywords or clear the search.'
                    : 'Click "Add layer" to create your first architecture layer.'}
                </p>
              </div>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
                >
                  Clear search
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenCreateLayer}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  + Add layer
                </button>
              )}
            </div>
          )}

          {/* Layers list — keyed on selectedLayerId so switching segment triggers entrance animation */}
          {!isLoading && !isError && (
            <div
              key={selectedLayerId}
              className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              {displayLayers.map((layer) => {
            const isLayerCollapsed = collapsedLayers[layer.id];
            const layerTotal = layer.groups.reduce((acc, g) => acc + g.items.length, 0);
            const isLayerDropdownOpen = activeDropdownId === `layer-${layer.id}`;
            const isLayerElevated =
              isLayerDropdownOpen || Boolean(activeDropdownId?.startsWith(`group-${layer.id}-`));

            return (
              <div
                key={layer.id}
                className={`rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-xs relative transition-all duration-300 ${
                  isLayerElevated ? 'z-50 overflow-visible' : 'z-0 overflow-hidden'
                }`}
              >
                {/* Layer header row */}
                <div
                  onClick={() => toggleLayer(layer.id)}
                  className={`group/lh px-3.5 py-2.5 bg-muted/40 hover:bg-muted/70 flex items-center justify-between cursor-pointer select-none transition-all relative ${
                    isLayerCollapsed ? 'rounded-2xl' : 'rounded-t-2xl'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${
                        isLayerCollapsed ? 'rotate-0' : 'rotate-90'
                      }`}
                    />
                    <span className="font-semibold text-xs tracking-tight text-foreground truncate">
                      {layer.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Actions popover */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        data-dropdown-trigger="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownId(isLayerDropdownOpen ? null : `layer-${layer.id}`);
                        }}
                        className={`p-1 rounded-md transition-colors ${
                          isLayerDropdownOpen
                            ? 'text-foreground bg-background'
                            : 'text-muted-foreground/70 hover:text-foreground hover:bg-background/80'
                        }`}
                        title="Layer options"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {isLayerDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(null);
                            }}
                          />
                          <div
                            data-dropdown-menu="true"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1 z-50 w-52 bg-popover/95 border border-border/80 rounded-xl shadow-xl p-1 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs font-normal"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDropdownId(null);
                                setTargetGroupLayer(layer);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                            >
                              <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Create level group</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveDropdownId(null);
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
                              onClick={() => {
                                setActiveDropdownId(null);
                                setEditingLayer(layer);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
                            >
                              <Pencil className="w-3.5 h-3.5 text-amber-500" />
                              <span>Edit layer</span>
                            </button>

                            <Popconfirm
                              title="Delete layer?"
                              description={layerTotal > 0 ? "All groups and items will be deleted." : "This action cannot be undone."}
                              onConfirm={() => {
                                setActiveDropdownId(null);
                                onDeleteLayer(layer.id);
                                toast(`Deleted layer "${layer.title}" successfully`, 'success');
                              }}
                              onCancel={() => setActiveDropdownId(null)}
                              okText="Delete"
                              cancelText="Cancel"
                              okButtonProps={{ danger: true, size: 'small' }}
                              cancelButtonProps={{ size: 'small' }}
                              icon={<Trash2 className="w-4 h-4 text-rose-500 mr-1.5 shrink-0 inline-block" />}
                              placement="bottomRight"
                              zIndex={9999}
                            >
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors text-left font-medium cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete layer</span>
                              </button>
                            </Popconfirm>
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
                    {layer.groups.length === 0 ? (
                      <div className="py-4 px-3 text-center space-y-2 bg-muted/20 rounded-xl border border-dashed border-border/60">
                        <p className="text-[11px] text-muted-foreground font-medium">
                          No groups in this layer yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => setTargetGroupLayer(layer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>Create level group</span>
                        </button>
                      </div>
                    ) : (
                      layer.groups.map((group) => {
                        const groupKey = `${layer.id}-${group.level}`;
                        const groupDropdownKey = `group-${layer.id}-${group.id || group.level}`;
                        const isGroupActionsOpen = activeDropdownId === groupDropdownKey;

                        return (
                          <SortableGroup
                            key={groupKey}
                            layerId={layer.id}
                            groupId={group.id}
                            level={group.level}
                            title={group.title}
                            items={group.items}
                            activeItemId={activeItemId}
                            onSelectItem={onSelectItem}
                            onReorderGroupItems={onReorderGroupItems}
                            onOpenCreateItem={onOpenCreateItem}
                            onEditGroup={(grp) => setEditingGroup(grp)}
                            onDeleteGroup={async (gId, gTitle) => {
                              try {
                                await onDeleteGroup?.(gId);
                                toast(`Deleted group "${gTitle}" successfully`, 'success');
                              } catch (err: any) {
                                toast(err?.message || `Failed to delete group "${gTitle}"`, 'error');
                              }
                            }}
                            onDeleteItem={onDeleteItem}
                            isLocked={isItemsLocked}
                            isCollapsed={Boolean(collapsedGroups[groupKey])}
                            onToggleCollapse={() => toggleGroup(groupKey)}
                            isActionsOpen={isGroupActionsOpen}
                            onToggleActions={() =>
                              setActiveDropdownId(isGroupActionsOpen ? null : groupDropdownKey)
                            }
                            onCloseActions={() => setActiveDropdownId(null)}
                          />
                        );
                      })
                    )}
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

      <EditGroupModal
        isOpen={Boolean(editingGroup)}
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSubmit={(groupId, title) => {
          onEditGroup?.(groupId, title);
          setEditingGroup(null);
        }}
      />

      <EditTopicModal
        isOpen={isEditTopicOpen}
        topic={currentRoadmap || null}
        onClose={() => setIsEditTopicOpen(false)}
        onSubmit={async (title, shortCode, description) => {
          if (onEditRoadmap) {
            await onEditRoadmap(title, shortCode, description);
          }
        }}
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
