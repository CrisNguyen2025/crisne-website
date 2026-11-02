'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface SectionFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Sections the topic already has; picking one reuses its spelling */
  sections: string[];
  className?: string;
}

/**
 * The "mục" of a lesson: pick one the topic already has, or type a new one. Empty means no section.
 */
export function SectionField({ value, onChange, sections, className }: SectionFieldProps) {
  const listId = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={listId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Mục
      </label>
      <input
        id={listId}
        type="text"
        list={`${listId}-options`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Để trống nếu không thuộc mục nào"
        className="w-full text-sm px-3.5 py-2 rounded-xl bg-background border border-border/70 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-foreground transition-colors"
      />
      <datalist id={`${listId}-options`}>
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p className="text-[0.6875rem] text-muted-foreground">Chọn mục có sẵn hoặc gõ tên mục mới.</p>
    </div>
  );
}
