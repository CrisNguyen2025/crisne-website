'use client';

import React from 'react';
import { CheckCircle2, CircleDot, Target } from 'lucide-react';
import { LESSON_STATUSES, LESSON_STATUS_LABEL, type LessonStatus } from '@/lib/roadmap/status';
import { cn } from '@/lib/utils';

// Lesson Status (ADR-0010): the Owner's progress with a lesson, shown to the Owner only

const STATUS_ICON: Record<LessonStatus, React.ComponentType<{ className?: string }>> = {
  target: Target,
  learning: CircleDot,
  known: CheckCircle2,
};

const STATUS_TONE: Record<LessonStatus, string> = {
  target: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  learning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  known: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

interface LessonStatusBadgeProps {
  status: LessonStatus;
  className?: string;
}

/** A small label for a lesson row. */
export function LessonStatusBadge({ status, className }: LessonStatusBadgeProps) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        STATUS_TONE[status],
        className
      )}
    >
      <Icon className="size-3" />
      {LESSON_STATUS_LABEL[status]}
    </span>
  );
}

interface LessonStatusPickerProps {
  value: LessonStatus;
  onChange: (status: LessonStatus) => void;
  disabled?: boolean;
}

/** The three statuses as one control; the current one is pressed. */
export function LessonStatusPicker({ value, onChange, disabled = false }: LessonStatusPickerProps) {
  return (
    <div role="group" aria-label="Trạng thái bài học" className="inline-flex flex-wrap gap-1.5">
      {LESSON_STATUSES.map((status) => {
        const Icon = STATUS_ICON[status];
        const isActive = status === value;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !isActive && onChange(status)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              isActive
                ? STATUS_TONE[status]
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            {LESSON_STATUS_LABEL[status]}
          </button>
        );
      })}
    </div>
  );
}
