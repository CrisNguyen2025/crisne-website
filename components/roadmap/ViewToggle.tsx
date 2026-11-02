'use client';

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RoadmapView = 'list' | 'map';

const OPTIONS: { value: RoadmapView; label: string; icon: typeof List }[] = [
  { value: 'list', label: 'List', icon: List },
  { value: 'map', label: 'Map', icon: LayoutGrid },
];

export function ViewToggle({ value, onChange }: { value: RoadmapView; onChange: (view: RoadmapView) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="flex shrink-0 rounded-lg border border-border p-0.5">
      {OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          title={`${label} view`}
          onClick={() => onChange(option)}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            value === option ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
