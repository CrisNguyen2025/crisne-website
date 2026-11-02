'use client';

import React from 'react';
import { RoadmapLayer, RoadmapMeta, RoadmapStats } from '@/lib/roadmap/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { layerCoverage } from './LayerSection';
import { RoadmapView, ViewToggle } from './ViewToggle';

interface RoadmapMapProps {
  layers: RoadmapLayer[];
  currentRoadmap?: RoadmapMeta | null;
  stats: RoadmapStats;
  activeItemId: string;
  isLoading?: boolean;
  view: RoadmapView;
  onViewChange: (view: RoadmapView) => void;
  onSelectItem: (id: string) => void;
}

/**
 * The whole topic at a glance: one column per layer (a station on a line on phones), its groups and
 * lessons inside. A lesson with content is a solid chip, one without is dashed.
 */
export function RoadmapMap({
  layers,
  currentRoadmap,
  stats,
  activeItemId,
  isLoading = false,
  view,
  onViewChange,
  onSelectItem,
}: RoadmapMapProps) {
  const covered = layers.reduce((n, l) => n + layerCoverage(l).withContent, 0);
  const percent = stats.total ? Math.round((covered / stats.total) * 100) : 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg leading-tight text-foreground">
            {currentRoadmap?.title || (isLoading ? '…' : 'Roadmap')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : `${stats.total} lessons · ${layers.length} layers · ${percent}% with content`}
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
            {layers.map((layer) => {
              const { total, withContent } = layerCoverage(layer);
              const isDone = total > 0 && withContent === total;
              return (
                <li key={layer.id} className="group/station relative pl-7 md:w-72 md:shrink-0 md:pl-0">
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
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                        {layer.shortTag}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {withContent}/{total}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-sm font-medium leading-snug text-foreground">{layer.title}</h2>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${total ? Math.round((withContent / total) * 100) : 0}%` }}
                      />
                    </div>

                    <div className="mt-3 space-y-3">
                      {layer.groups.length === 0 && <p className="text-xs text-muted-foreground">No lessons yet.</p>}
                      {layer.groups.map((group) => (
                        <div key={group.id}>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.title}</p>
                          <div className="flex flex-wrap gap-1.5">
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
          <span className="h-3 w-4 rounded-sm border border-border bg-muted/60" /> Has content
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm border border-dashed border-border" /> Title only
        </span>
      </div>
    </div>
  );
}
