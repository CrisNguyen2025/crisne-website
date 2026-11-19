'use client';

import React from 'react';
import { Check, CheckCircle2, CircleDot, Target } from 'lucide-react';
import { LESSON_STATUSES, LESSON_STATUS_LABEL, type LessonStatus } from '@/lib/roadmap/status';
import { cn } from '@/lib/utils';

// Lesson Status (ADR-0010): the Owner's progress with a lesson, shown to the Owner only

const STATUS_ICON: Record<LessonStatus, React.ComponentType<{ className?: string }>> = {
  target: Target,
  learning: CircleDot,
  known: CheckCircle2,
};

const STATUS_TONE: Record<LessonStatus, string> = {
  target: 'border-[var(--status-target-border)] bg-[var(--status-target-bg)] text-[var(--status-target)]',
  learning: 'border-[var(--status-learning-border)] bg-[var(--status-learning-bg)] text-[var(--status-learning)]',
  known: 'border-[var(--status-known-border)] bg-[var(--status-known-bg)] text-[var(--status-known)]',
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

const STATUS_DOT: Record<LessonStatus, string> = {
  target: 'bg-[var(--status-target)]',
  learning: 'bg-[var(--status-learning)]',
  known: 'bg-[var(--status-known)]',
};

const STATUS_LIST_ACTIVE: Record<LessonStatus, string> = {
  target: 'bg-[var(--status-target-bg)] text-[var(--status-target)]',
  learning: 'bg-[var(--status-learning-bg)] text-[var(--status-learning)]',
  known: 'bg-[var(--status-known-bg)] text-[var(--status-known)]',
};

const STATUS_TAB_ACTIVE: Record<LessonStatus, string> = {
  target: 'border-[var(--status-target)] text-[var(--status-target)]',
  learning: 'border-[var(--status-learning)] text-[var(--status-learning)]',
  known: 'border-[var(--status-known)] text-[var(--status-known)]',
};

interface LessonStatusPickerProps {
  value: LessonStatus;
  onChange: (status: LessonStatus) => void;
  disabled?: boolean;
  /** pill: a row of chips · list: one row per status with a colored dot · tabs: underlined tabs */
  variant?: 'pill' | 'list' | 'tabs';
}

/** The three statuses as one control; the current one is pressed. */
export function LessonStatusPicker({
  value,
  onChange,
  disabled = false,
  variant = 'pill',
}: LessonStatusPickerProps) {
  return (
    <div
      role="group"
      aria-label="Trạng thái bài học"
      className={cn(
        variant === 'pill' && 'inline-flex flex-wrap gap-1.5',
        variant === 'list' && 'flex w-full flex-col gap-0.5',
        variant === 'tabs' && 'flex gap-4 border-b border-border'
      )}
    >
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
              'inline-flex items-center text-xs font-medium transition-colors disabled:opacity-50',
              variant !== 'pill' && 'cursor-pointer',
              variant === 'pill' && [
                'gap-1.5 rounded-full border px-3 py-1',
                isActive
                  ? STATUS_TONE[status]
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              ],
              variant === 'list' && [
                'w-full gap-2.5 rounded-lg px-2 py-1.5 text-left',
                isActive
                  ? STATUS_LIST_ACTIVE[status]
                  : 'font-normal text-muted-foreground hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground',
              ],
              variant === 'tabs' && [
                '-mb-px border-b-2 pb-2 pt-0.5',
                isActive
                  ? STATUS_TAB_ACTIVE[status]
                  : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              ]
            )}
          >
            {variant === 'pill' && <Icon className="size-3.5" />}
            {variant === 'list' && (
              <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
            )}
            <span className={cn(variant === 'list' && 'flex-1')}>{LESSON_STATUS_LABEL[status]}</span>
            {variant === 'list' && isActive && <Check aria-hidden="true" className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
