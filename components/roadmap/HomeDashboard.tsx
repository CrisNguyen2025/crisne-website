'use client';

import React from 'react';
import { RoadmapMeta } from '@/lib/roadmap/types';

interface HomeDashboardProps {
  roadmaps: (RoadmapMeta & { _count?: { items: number } })[];
  isLoading?: boolean;
  onSelectRoadmap: (slug: string) => void;
}

/** The home page: the topic cards only. Creating a topic and the theme live in the header and the Topics sheet. */
export function HomeDashboard({ roadmaps, isLoading = false, onSelectRoadmap }: HomeDashboardProps) {
  return (
    <div className="h-full w-full flex-1 overflow-y-auto bg-background p-4 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] select-none sm:p-6 md:p-10 md:pb-10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && roadmaps.length === 0
          ? [1, 2, 3].map((idx) => (
              <div key={idx} className="h-[132px] space-y-3 rounded-2xl border border-border/60 bg-card/60 p-5">
                <div className="size-9 rounded-xl bg-muted/60" />
                <div className="h-4 w-2/3 rounded-lg bg-muted/70" />
                <div className="h-3 w-full rounded bg-muted/40" />
              </div>
            ))
          : roadmaps.map((r) => {
              // Topics have no short code (ADR-0009): the mark is the first letters of the title
              const code = r.title
                .split(/\s+/)
                .map((w) => w[0] ?? '')
                .join('')
                .slice(0, 3)
                .toUpperCase();
              const lessonCount = r._count?.items;

              return (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => onSelectRoadmap(r.slug)}
                  className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 text-left transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      title={code}
                      className={`flex size-9 shrink-0 items-center justify-center truncate rounded-xl border border-primary/20 bg-primary/10 p-1 text-center font-black text-primary ${
                        code.length <= 2 ? 'text-sm' : 'text-xs'
                      }`}
                    >
                      {code}
                    </span>
                    {typeof lessonCount === 'number' && (
                      <span className="text-xs text-muted-foreground">{lessonCount} bài</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {r.title}
                    </h3>
                    {r.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
      </div>
    </div>
  );
}
