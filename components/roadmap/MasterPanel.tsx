'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SECTIONS_ENABLED } from './sectionsEnabled';
import { AlertTriangle, FolderPlus, Layers, Pencil, Search, Trash2 } from 'lucide-react';
import { ChecklistItem, RoadmapStats, RoadmapMeta } from '@/lib/roadmap/types';
import type { SectionGroup } from '@/hooks/use-roadmap';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/action-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SectionList } from './SectionList';
import { RoadmapView, ViewToggle } from './ViewToggle';
import { EditSectionModal } from './EditSectionModal';
import { EditTopicModal } from './EditTopicModal';

function ListSkeleton() {
  return (
    <div className="space-y-5 p-4">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
        </div>
      ))}
    </div>
  );
}

/** Stable key for a section, null included */
const keyOf = (section: string | null) => section ?? '__none__';

interface MasterPanelProps {
  sectionGroups: SectionGroup[];
  activeItemId: string;
  selectedSection: string | null | 'all';
  onSelectSection: (section: string | null | 'all') => void;
  stats: RoadmapStats;
  currentRoadmap?: RoadmapMeta | null;
  /** The Owner sees the write controls; every write is still checked on the server */
  canWrite: boolean;
  view: RoadmapView;
  onViewChange: (view: RoadmapView) => void;
  onEditRoadmap?: (title: string, description?: string) => Promise<void>;
  onDeleteRoadmap?: (slug: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onSelectItem: (id: string) => void;
  /** The whole topic in its new order */
  onReorderItems: (items: ChecklistItem[]) => void;
  onOpenCreateItem: (section: string | null) => void;
  onRenameSection: (from: string, to: string) => void;
  onDissolveSection: (section: string) => void;
}

export function MasterPanel({
  sectionGroups,
  activeItemId,
  selectedSection,
  onSelectSection,
  stats,
  currentRoadmap,
  canWrite,
  view,
  onViewChange,
  onEditRoadmap,
  onDeleteRoadmap,
  isLoading = false,
  isError = false,
  onSelectItem,
  onReorderItems,
  onOpenCreateItem,
  onRenameSection,
  onDissolveSection,
}: MasterPanelProps) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [isEditTopicOpen, setIsEditTopicOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isLocked = Boolean(currentRoadmap?.isLocked);
  const sectionNames = useMemo(
    () => sectionGroups.map((g) => g.section).filter((s): s is string => s !== null),
    [sectionGroups]
  );

  // The sections to show: only the chosen one, and search keeps the sections that hold a match
  const displayGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const groups = SECTIONS_ENABLED
      ? sectionGroups
      : [{ section: null, items: sectionGroups.flatMap((g) => g.items) }];
    return groups
      .filter((g) => !SECTIONS_ENABLED || selectedSection === 'all' || g.section === selectedSection)
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            !q || item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0 || (!q && selectedSection !== 'all'));
  }, [sectionGroups, searchQuery, selectedSection]);

  const visibleItems = useMemo(
    () => displayGroups.flatMap((g) => (collapsed[keyOf(g.section)] ? [] : g.items)),
    [displayGroups, collapsed]
  );

  // Ctrl+F / ⌘F focuses the lesson search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ArrowUp / ArrowDown move between the visible lessons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.getAttribute('contenteditable') === 'true') return;
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || visibleItems.length === 0) return;
      e.preventDefault();
      const current = visibleItems.findIndex((i) => i.id === activeItemId);
      const next =
        current === -1 ? 0 : e.key === 'ArrowDown' ? Math.min(current + 1, visibleItems.length - 1) : Math.max(current - 1, 0);
      if (visibleItems[next] && visibleItems[next].id !== activeItemId) onSelectItem(visibleItems[next].id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, activeItemId, onSelectItem]);

  /** The whole topic in order: each section's new order, sections in their page order */
  const reorderSection = (section: string | null, reordered: ChecklistItem[]) => {
    if (!SECTIONS_ENABLED) return onReorderItems(reordered);
    const next = sectionGroups.flatMap((g) => (g.section === section ? reordered : g.items));
    onReorderItems(next);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg leading-tight text-foreground">
              {currentRoadmap?.title || (isLoading ? '…' : 'Roadmap')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Loading…' : SECTIONS_ENABLED ? `${stats.total} bài · ${sectionNames.length} mục` : `${stats.total} bài`}
            </p>
          </div>
          <ViewToggle value={view} onChange={onViewChange} />
          {canWrite && (
            <>
              <ActionMenu
                label="Topic actions"
                items={[
                  { label: 'Thêm bài', icon: FolderPlus, onSelect: () => onOpenCreateItem(null) },
                  ...(onEditRoadmap && currentRoadmap
                    ? [{ label: 'Sửa topic', icon: Pencil, onSelect: () => setIsEditTopicOpen(true) }]
                    : []),
                  ...(onDeleteRoadmap && currentRoadmap
                    ? [
                        {
                          label: 'Xoá topic',
                          icon: Trash2,
                          danger: true,
                          confirm: {
                            title: `Xoá "${currentRoadmap.title}"?`,
                            description: 'Mọi bài trong topic cũng bị xoá.',
                          },
                          onSelect: () => {
                            onDeleteRoadmap(currentRoadmap.slug);
                            toast(`Đã xoá topic "${currentRoadmap.title}"`, 'success');
                          },
                        },
                      ]
                    : []),
                ]}
              />
            </>
          )}
        </div>

        {/* Section filter: a horizontally scrolling row of chips */}
        {SECTIONS_ENABLED && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {isLoading ? (
            <>
              <Skeleton className="h-7 w-14 shrink-0 rounded-full" />
              <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
            </>
          ) : (
            [{ id: 'all' as const, label: 'Tất cả' }, ...sectionNames.map((s) => ({ id: s, label: s }))].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onSelectSection(chip.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedSection === chip.id
                    ? 'border-transparent bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {chip.label}
              </button>
            ))
          )}
        </div>
        )}
      </div>

      {/* ── Lessons ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && <ListSkeleton />}

        {!isLoading && isError && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <AlertTriangle className="size-5 text-destructive" />
            <p className="text-sm font-medium text-foreground">Không tải được topic này</p>
            <p className="text-xs text-muted-foreground">Kiểm tra kết nối rồi thử lại.</p>
          </div>
        )}

        {!isLoading && !isError && displayGroups.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            {searchQuery ? (
              <Search className="size-5 text-muted-foreground" />
            ) : (
              <Layers className="size-5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? `Không có bài nào khớp "${searchQuery}"` : 'Chưa có bài nào'}
            </p>
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery('')} className="text-xs font-medium text-primary hover:underline">
                Xoá tìm kiếm
              </button>
            ) : (
              canWrite && (
                <button
                  type="button"
                  onClick={() => onOpenCreateItem(selectedSection === 'all' ? null : selectedSection)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Thêm bài
                </button>
              )
            )}
          </div>
        )}

        {!isLoading && !isError && (
          <div key={selectedSection === 'all' ? 'all' : keyOf(selectedSection)} className="px-2 pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] animate-in fade-in duration-150 lg:pb-6">
            {displayGroups.map((group) => (
              <SectionList
                key={keyOf(group.section)}
                section={group.section}
                items={group.items}
                activeItemId={activeItemId}
                canWrite={canWrite}
                isLocked={isLocked}
                isCollapsed={Boolean(collapsed[keyOf(group.section)])}
                onToggleCollapse={() =>
                  setCollapsed((prev) => ({ ...prev, [keyOf(group.section)]: !prev[keyOf(group.section)] }))
                }
                onSelectItem={onSelectItem}
                onReorder={(reordered) => reorderSection(group.section, reordered)}
                onOpenCreateItem={onOpenCreateItem}
                onRenameSection={setRenamingSection}
                onDissolveSection={onDissolveSection}
                flat={!SECTIONS_ENABLED}
              />
            ))}
          </div>
        )}
      </div>

      <EditSectionModal
        isOpen={renamingSection !== null}
        section={renamingSection}
        onClose={() => setRenamingSection(null)}
        onSubmit={(from, to) => onRenameSection(from, to)}
      />

      <EditTopicModal
        isOpen={isEditTopicOpen}
        topic={currentRoadmap || null}
        onClose={() => setIsEditTopicOpen(false)}
        onSubmit={async (title, description) => {
          if (onEditRoadmap) await onEditRoadmap(title, description);
        }}
      />
    </div>
  );
}
