/** Lesson Status (ADR-0010): where the Owner is with a lesson. Not its difficulty. */
export const LESSON_STATUSES = ['target', 'learning', 'known'] as const;

export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** A lesson created without a status is known: the roadmap has held known knowledge so far (ADR-0010). */
export const DEFAULT_LESSON_STATUS: LessonStatus = 'known';

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  target: 'Mục tiêu',
  learning: 'Đang học',
  known: 'Đã nắm',
};

export function isLessonStatus(value: unknown): value is LessonStatus {
  return typeof value === 'string' && (LESSON_STATUSES as readonly string[]).includes(value);
}
