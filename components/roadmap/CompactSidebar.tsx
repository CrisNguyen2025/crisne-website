'use client';

import React from 'react';
import { Home, Plus, Layers, Sparkles } from 'lucide-react';
import { RoadmapMeta } from '@/lib/roadmap/types';

interface CompactSidebarProps {
  currentView: 'home' | 'roadmap';
  currentSlug: string;
  roadmaps: RoadmapMeta[];
  onSelectHome: () => void;
  onSelectRoadmap: (slug: string) => void;
  onOpenCreateRoadmap?: () => void;
}

export function CompactSidebar({
  currentView,
  currentSlug,
  roadmaps,
  onSelectHome,
  onSelectRoadmap,
  onOpenCreateRoadmap,
}: CompactSidebarProps) {
  return (
    <aside className="w-[80px] h-full shrink-0 flex flex-col items-center justify-between py-4 bg-card/60 backdrop-blur-md border-r border-border/60 select-none z-20">
      {/* Top: Home & Roadmaps list */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Logo / Brand Indicator */}
        <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs mb-1">
          <Layers className="w-5 h-5 text-primary animate-pulse" />
        </div>

        <div className="w-8 h-[1px] bg-border/60 my-1" />

        {/* 1. Default HOME button */}
        <button
          type="button"
          onClick={onSelectHome}
          title="Home Dashboard"
          className={`group relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-300 ease-out cursor-pointer ${
            currentView === 'home'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold scale-[1.04]'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95'
          }`}
        >
          {/* Left vertical border indicator (pinned to sidebar edge) */}
          <span
            className={`absolute -left-3.5 w-1 rounded-r-full bg-primary transition-all duration-300 ease-out ${
              currentView === 'home'
                ? 'h-7 opacity-100 scale-y-100 shadow-sm shadow-primary'
                : 'h-0 opacity-0 scale-y-0'
            }`}
          />

          <Home className={`w-4 h-4 transition-transform duration-200 ${currentView === 'home' ? 'scale-110' : 'group-hover:scale-105'}`} />
          <span className="text-[10px] font-semibold tracking-tight">Home</span>
        </button>

        <div className="w-8 h-[1px] bg-border/40 my-1" />

        {/* 2. Roadmaps items (AI, BE, FE, ...) */}
        <div className="flex flex-col items-center gap-2.5 w-full">
          {roadmaps.map((r) => {
            const isSelected = currentView === 'roadmap' && currentSlug === r.slug;
            const code = (r.shortCode || r.slug.substring(0, 2)).toUpperCase();

            return (
              <button
                key={r.slug}
                type="button"
                onClick={() => onSelectRoadmap(r.slug)}
                title={r.title}
                className={`group relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 p-1 transition-all duration-300 ease-out cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold scale-[1.04]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95'
                }`}
              >
                {/* Left vertical border indicator (pinned to sidebar edge) */}
                <span
                  className={`absolute -left-3.5 w-1 rounded-r-full bg-primary transition-all duration-300 ease-out ${
                    isSelected
                      ? 'h-7 opacity-100 scale-y-100 shadow-sm shadow-primary'
                      : 'h-0 opacity-0 scale-y-0'
                  }`}
                />

                {/* Shortcode Badge / Main Glyphs */}
                <span
                  className={`w-full text-center truncate font-black tracking-tight uppercase leading-none transition-transform duration-200 ${
                    isSelected ? 'scale-105' : 'group-hover:scale-105'
                  } ${
                    code.length <= 2
                      ? 'text-sm'
                      : code.length === 3
                      ? 'text-xs'
                      : 'text-[10px]'
                  }`}
                >
                  {code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom: Quick Add Roadmap or Info */}
      <div className="flex flex-col items-center gap-2">
        {onOpenCreateRoadmap && (
          <button
            type="button"
            onClick={onOpenCreateRoadmap}
            title="Create new roadmap"
            className="w-10 h-10 rounded-xl border border-dashed border-border/80 text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
