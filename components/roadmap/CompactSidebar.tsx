'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Plus, Layers, Sparkles, UserRound } from 'lucide-react';
import { RoadmapMeta } from '@/lib/roadmap/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

interface CompactSidebarProps {
  currentView: 'home' | 'roadmap';
  currentSlug: string;
  roadmaps: RoadmapMeta[];
  isLoading?: boolean;
  onSelectHome: () => void;
  onSelectRoadmap: (slug: string) => void;
  onOpenCreateRoadmap?: () => void;
  onOpenTriage?: () => void;
  triageBadgeCount?: number;
  className?: string;
}

export function CompactSidebar({
  currentView,
  currentSlug,
  roadmaps,
  isLoading = false,
  onSelectHome,
  onSelectRoadmap,
  onOpenCreateRoadmap,
  onOpenTriage,
  triageBadgeCount,
  className,
}: CompactSidebarProps) {
  return (
    <aside
      className={cn(
        'w-[80px] h-full shrink-0 flex flex-col items-center justify-between py-4 bg-card/60 backdrop-blur-md border-r border-border/60 select-none z-20',
        className
      )}
    >
      {/* Top: Home & Roadmaps list */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Logo / Brand Indicator */}
        <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs mb-1">
          <Layers className="w-5 h-5 text-primary" />
        </div>

        <div className="w-8 h-[1px] bg-border/60 my-1" />

        {/* 1. Default HOME button */}
        <button
          type="button"
          onClick={onSelectHome}
          title="Home Dashboard"
          className={`group relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 cursor-pointer ${
            currentView === 'home'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
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

          <Home className="w-4 h-4 transition-colors" />
          <span className="text-[0.625rem] font-semibold tracking-tight">Home</span>
        </button>

        <div className="w-8 h-[1px] bg-border/40 my-1" />

        {/* 2. Roadmaps items (AI, BE, FE, ...) */}
        <div className="flex flex-col items-center gap-2.5 w-full">
          {isLoading && roadmaps.length === 0 ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/40 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent flex items-center justify-center">
                <div className="w-5 h-3 rounded bg-muted/70" />
              </div>
              <div className="w-12 h-12 rounded-2xl bg-muted/40 border border-border/30 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent flex items-center justify-center">
                <div className="w-5 h-3 rounded bg-muted/60" />
              </div>
            </>
          ) : (
            roadmaps.map((r) => {
              const isSelected = currentView === 'roadmap' && currentSlug === r.slug;
              const code = (r.shortCode || r.slug.substring(0, 2)).toUpperCase();

              return (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => onSelectRoadmap(r.slug)}
                  title={r.title}
                  className={`group relative w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 p-1 transition-colors duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
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
                    className={`w-full text-center truncate font-black tracking-tight uppercase leading-none ${
                      code.length <= 2
                        ? 'text-sm'
                        : code.length === 3
                        ? 'text-xs'
                        : 'text-[0.625rem]'
                    }`}
                  >
                    {code}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom: Triage, Portfolio, Quick Add, Theme */}
      <div className="flex flex-col items-center gap-2">
        {onOpenTriage && (
          <button
            type="button"
            onClick={onOpenTriage}
            title="Knowledge Triage"
            className="group relative w-10 h-10 rounded-xl text-muted-foreground hover:text-[#C2410C] hover:bg-[#FBEDE5] dark:hover:bg-[#C2410C]/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-muted-foreground group-hover:text-[#C2410C]" />
            {typeof triageBadgeCount === 'number' && triageBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#C2410C] text-[0.5625rem] font-bold text-white shadow-xs">
                {triageBadgeCount}
              </span>
            )}
          </button>
        )}
        <Link
          href="/portfolio"
          title="Portfolio"
          className="w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors"
        >
          <UserRound className="w-4 h-4" />
        </Link>
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
        <ThemeToggle className="h-9 w-9 rounded-xl border border-border/60 bg-card hover:bg-muted text-foreground shadow-2xs" />
      </div>
    </aside>
  );
}
