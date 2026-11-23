'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ROADMAP_MODAL_TITLE_CLASS =
  'font-display text-[1.1875rem] font-normal leading-snug tracking-[-0.015em] text-foreground';

export const ROADMAP_INPUT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150 focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 focus:outline-none aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:border-destructive aria-[invalid=true]:focus:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60';

export const ROADMAP_TEXTAREA_CLASS =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150 focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 focus:outline-none aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:border-destructive aria-[invalid=true]:focus:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60';

export const ROADMAP_GHOST_BTN_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

export const ROADMAP_SECONDARY_BTN_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-[0.8125rem] font-medium text-foreground transition-[background-color,border-color,transform] duration-150 hover:border-foreground/30 hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

export const ROADMAP_PRIMARY_BTN_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-[0.8125rem] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

export const ROADMAP_DESTRUCTIVE_BTN_CLASS =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-destructive px-3.5 text-[0.8125rem] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 cursor-pointer';

export function RoadmapDangerIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive">
      {children}
    </span>
  );
}

export function RoadmapFieldLabel({
  htmlFor,
  children,
  required,
  trailing,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-0.5">
        <label htmlFor={htmlFor} className="block text-[0.8125rem] font-medium text-foreground">
          {children}
        </label>
        {required && (
          <span className="text-[0.8125rem] font-medium text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {trailing}
    </div>
  );
}

export const RoadmapFormError = React.forwardRef<
  HTMLDivElement,
  { id?: string; message: string; className?: string }
>(function RoadmapFormError({ id, message, className }, ref) {
  if (!message) return null;
  return (
    <div
      id={id}
      ref={ref}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive motion-safe:animate-in motion-safe:fade-in duration-150',
        className
      )}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
});
