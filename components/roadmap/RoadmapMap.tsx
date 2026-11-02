'use client';

import React from 'react';
import { RoadmapMeta, RoadmapStats } from '@/lib/roadmap/types';
import type { SectionGroup } from '@/hooks/use-roadmap';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RoadmapView, ViewToggle } from './ViewToggle';

interface RoadmapMapProps {
  sectionGroups: SectionGroup[];
  currentRoadmap?: RoadmapMeta | null;
  stats: RoadmapStats;
  activeItemId: string;
  isLoading?: boolean;
  view: RoadmapView;
  onViewChange: (view: RoadmapView) => void;
  onSelectItem: (id: string) => void;
}

/** Lessons with content, out of all lessons in a section */
function coverage(items: { content?: string }[]) {
  return { total: items.length, withContent: items.filter((i) => i.content).length };
}

/**
 * The whole topic at a glance: one column per section (a station on a line on phones), its lessons inside.
 * A lesson with content is a solid chip, one without is dashed.
 */
export function RoadmapMap({
  sectionGroups,
  currentRoadmap,
  stats,
  activeItemId,
  isLoading = false,
  view,
  onViewChange,
  onSelectItem,
}: RoadmapMapProps) {
  const covered = sectionGroups.reduce((n, g) => n + coverage(g.items).withContent, 0);
  const percent = stats.total ? Math.round((covered / stats.total) * 100) : 0;
  const sectionCount = sectionGroups.filter((g) => g.section !== null).length;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg leading-tight text-foreground">
            {currentRoadmap?.title || (isLoading ? '…' : 'Roadmap')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : `${stats.total} bài · ${sectionCount} mục · ${percent}% có nội dung`}
          </p>
        </div>
        <ViewToggle value={view} onChange={onViewChange} />
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex flex-col gap-4 p-4 md:flex-row md:p-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 w-full shrink-0 rounded-xl md:w-72" />
            ))}
          </div>
        ) : (
          <ol className="relative flex flex-col gap-6 p-4 pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:min-h-full md:flex-row md:items-start md:gap-4 md:p-6">
            {sectionGroups.map((group) => {
              const { total, withContent } = coverage(group.items);
              const isDone = total > 0 && withContent === total;
              return (
                <li key={group.section ?? '__none__'} className="group/station relative pl-7 md:w-72 md:shrink-0 md:pl-0">
                  {/* The line between stations, on phones only */}
                  <span className="absolute bottom-[-1.5rem] left-[0.4375rem] top-3 w-0.5 bg-border group-last/station:hidden md:hidden" />
                  <span
                    className={cn(
                      'absolute left-0 top-1 size-4 rounded-full border-2 md:hidden',
                      isDone ? 'border-primary bg-primary' : 'border-border bg-background'
                    )}
                  />

                  <div className="md:rounded-xl md:border md:border-border md:bg-card md:p-3">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-medium leading-snug text-foreground">
                        {group.section ?? 'Chung'}
                      </h2>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {withContent}/{total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${total ? Math.round((withContent / total) * 100) : 0}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {group.items.length === 0 && <p className="text-xs text-muted-foreground">Chưa có bài nào.</p>}
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectItem(item.id)}
                          title={item.description || item.title}
                          className={cn(
                            'max-w-full truncate rounded-md border px-2 py-1 text-left text-xs transition-colors',
                            item.content
                              ? 'border-border bg-muted/60 text-foreground hover:border-primary/50'
                              : 'border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                            item.id === activeItemId && 'border-primary ring-1 ring-primary'
                          )}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-4 border-t border-border px-6 py-2 text-xs text-muted-foreground md:flex">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border border-border bg-muted/60" /> Có nội dung
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border border-dashed border-border" /> Chỉ có tên
        </span>
      </div>
    </div>
  );
}
