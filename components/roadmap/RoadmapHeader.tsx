'use client';

import { Sparkles, Layers } from 'lucide-react';
import { RoadmapStats } from '@/lib/roadmap/types';

interface RoadmapHeaderProps {
  stats: RoadmapStats;
}

export function RoadmapHeader({ stats }: RoadmapHeaderProps) {
  return (
    <header className="w-full border-b border-border/60 bg-background/80 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm shadow-primary/10">
          <Layers className="w-5 h-5 text-primary animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              AI &amp; LLM Architecture Roadmap
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Dynamic State Mode
              </span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage, create, and customize knowledge layers &amp; concepts
          </p>
        </div>
      </div>

      {/* Level breakdown + total count */}
      <div className="flex items-center gap-3 flex-wrap w-full md:w-auto justify-between md:justify-end">
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium">Core:</span>
            <span className="font-bold">{stats.byLevel.core}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="font-medium">Intermediate:</span>
            <span className="font-bold">{stats.byLevel.intermediate}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/5 border border-rose-500/20 text-rose-600 dark:text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="font-medium">Advanced:</span>
            <span className="font-bold">{stats.byLevel.advanced}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-xl border border-border/50 text-xs font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Total: {stats.total} items</span>
        </div>
      </div>
    </header>
  );
}
