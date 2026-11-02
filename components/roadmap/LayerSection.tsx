'use client';

import React from 'react';
import { ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { ChecklistItem, RoadmapGroup, RoadmapLayer } from '@/lib/roadmap/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { cn } from '@/lib/utils';
import { GroupSection } from './GroupSection';

/** Lessons of a layer that have content, out of all its lessons. */
export function layerCoverage(layer: RoadmapLayer): { total: number; withContent: number } {
  const items = layer.groups.flatMap((g) => g.items);
  return { total: items.length, withContent: items.filter((i) => Boolean(i.content)).length };
}

interface LayerSectionProps {
  layer: RoadmapLayer;
  activeItemId: string;
  canWrite: boolean;
  isLocked: boolean;
  isCollapsed: boolean;
  collapsedGroups: Record<string, boolean>;
  onToggleCollapse: () => void;
  onToggleGroup: (groupId: string) => void;
  onSelectItem: (id: string) => void;
  onReorderGroupItems: (groupId: string, reorderedItems: ChecklistItem[]) => void;
  onOpenCreateItem: (layerId: string, groupId?: string) => void;
  onOpenCreateGroup: (layer: RoadmapLayer) => void;
  onEditLayer: (layer: RoadmapLayer) => void;
  onDeleteLayer: (layer: RoadmapLayer) => void;
  onEditGroup: (group: RoadmapGroup) => void;
  onDeleteGroup: (group: RoadmapGroup) => void;
}

export function LayerSection({
  layer,
  activeItemId,
  canWrite,
  isLocked,
  isCollapsed,
  collapsedGroups,
  onToggleCollapse,
  onToggleGroup,
  onSelectItem,
  onReorderGroupItems,
  onOpenCreateItem,
  onOpenCreateGroup,
  onEditLayer,
  onDeleteLayer,
  onEditGroup,
  onDeleteGroup,
}: LayerSectionProps) {
  const { total, withContent } = layerCoverage(layer);

  return (
    <section className="border-b border-border py-2 last:border-b-0">
      <div
        onClick={onToggleCollapse}
        className="group/lh flex cursor-pointer select-none items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/60"
      >
        <ChevronRight
          className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200', !isCollapsed && 'rotate-90')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              {layer.shortTag}
            </span>
            <span className="truncate text-sm font-medium text-foreground">{layer.title}</span>
          </div>
          {total > 0 && (
            <div className="mt-2 flex items-center gap-2" title={`${withContent} of ${total} lessons have content`}>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70 transition-[width]"
                  style={{ width: `${Math.round((withContent / total) * 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {withContent}/{total}
              </span>
            </div>
          )}
        </div>
        {canWrite && (
          <ActionMenu
            label="Layer actions"
            triggerClassName="lg:opacity-0 lg:group-hover/lh:opacity-100 lg:aria-expanded:opacity-100"
            items={[
              { label: 'Add lesson', icon: Plus, onSelect: () => onOpenCreateItem(layer.id) },
              { label: 'Add group', icon: FolderPlus, onSelect: () => onOpenCreateGroup(layer) },
              { label: 'Edit layer', icon: Pencil, onSelect: () => onEditLayer(layer) },
              {
                label: 'Delete layer',
                icon: Trash2,
                danger: true,
                onSelect: () => onDeleteLayer(layer),
                confirm: {
                  title: `Delete "${layer.shortTag}"?`,
                  description: total > 0 ? 'All its groups and lessons are deleted too.' : 'This cannot be undone.',
                },
              },
            ]}
          />
        )}
      </div>

      {!isCollapsed && (
        <div className="space-y-1 pl-3 pt-1">
          {layer.groups.length === 0 ? (
            canWrite ? (
              <button
                type="button"
                onClick={() => onOpenCreateItem(layer.id)}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                + Add the first lesson of this layer
              </button>
            ) : (
              <p className="px-2 py-2 text-xs text-muted-foreground">No lessons yet.</p>
            )
          ) : (
            layer.groups.map((group) => (
              <GroupSection
                key={group.id}
                layerId={layer.id}
                group={group}
                activeItemId={activeItemId}
                canWrite={canWrite}
                isLocked={isLocked}
                isCollapsed={Boolean(collapsedGroups[group.id])}
                onToggleCollapse={() => onToggleGroup(group.id)}
                onSelectItem={onSelectItem}
                onReorderGroupItems={onReorderGroupItems}
                onOpenCreateItem={onOpenCreateItem}
                onEditGroup={onEditGroup}
                onDeleteGroup={onDeleteGroup}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
